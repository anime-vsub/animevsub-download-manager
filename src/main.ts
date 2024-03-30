import { downloadVideo } from "./logic/download-video"
import type Hls from "hls-parser"
import { isMasterPlaylist } from "./logic/is-master-playlist"
import { sha256sum } from "./logic/sha256sum"
import { parse } from "hls-parser"

export { sleep } from "./logic/sleep"
export { concurrent } from "./logic/concurrent"
export { retry } from "./logic/retry"

interface Anchor {
  path: string
  name: string
}
export interface SeasonInfo {
  /** @unique */
  seasonId: string

  image?: string
  poster?: string

  name: string
  othername: string
  description: string

  pathToView?: string
  yearOf: number

  genre: Anchor[]
  quality: string
  authors: Anchor[]
  contries: Anchor[]

  views: number
  rate: number
  count_rate: number

  duration: string
  season: Anchor[]
  currentSeason: Anchor

  follows: number

  language?: string

  studio?: string
  seasonOf: Anchor

  trailer?: string

  episodesOffline: Record<string, Episode>
  updatedAt: number
}

export interface RawEpisode {
  id: string
  play: string
  hash: string
  name: string
}

export interface Episode {
  id: string
  hash: string
  hidden: boolean
  real_id: string
  size: number
  progress: { cur: number; total: number }
  source: Source
}

export interface Source {
  readonly file: string
  readonly label: "FHD|HD" | "HD" | "FHD" | `${720 | 360 | 340}p`
  readonly qualityCode:
    | "720p"
    | "360p"
    | "340p"
    | "1080p|720p"
    | "1080p"
    | "480p"
  readonly preload?: string
  readonly type:
    | "hls"
    | "aac"
    | "f4a"
    | "mp4"
    | "f4v"
    | "m3u"
    | "m3u8"
    | "m4v"
    | "mov"
    | "mp3"
    | "mpeg"
    | "oga"
    | "ogg"
    | "ogv"
    | "vorbis"
    | "webm"
    | "youtube"
}

export interface OptionsHttp {
  request(uri: string, method?: string): Promise<Response>
  delay: number
  repeat: number
  concurrent: number
  onstart: (seasonInfo: SeasonInfo, episode: Episode) => void
  onprogress: (
    seasonInfo: SeasonInfo,
    episode: Episode,
    current: number,
    total: number
  ) => void
}
export interface Utils {
  get(key: string): Promise<unknown>
  set(key: string, data: unknown): Promise<void>
  setMany(datas: [string, unknown][]): Promise<void>
  getMany(keys: string[]): Promise<unknown[]>
}

export class AnimeDownloadManager {
  readonly #utils: Utils
  readonly #optionsHttp: OptionsHttp

  static readonly constants = {
    seasons: process.env.DEV ? `seasons` : `00`,
    posters: process.env.DEV ? "posters" : "01",
    episodes: process.env.DEV ? `episodes` : `02`,
    images: process.env.DEV ? `images` : `03`,
    segments: process.env.DEV ? "segments" : "04",
    lsEpisodes: process.env.DEV ? "list-episodes" : "05",
    allseasons: process.env.DEV ? "all-season" : "06"
  }

  constructor(utils: Utils, optionsHttp: OptionsHttp) {
    this.#utils = utils
    this.#optionsHttp = optionsHttp
  }

  public async lazyUpdateFile(
    pathname: string,
    content: string | Uint8Array
  ): Promise<void> {
    const hash = await this.#utils.get(`${pathname}.hash`).catch(() => null)

    const newHash = await sha256sum(content)

    if (hash !== newHash) {
      // wrong hash -> update this
      await this.#utils.setMany([
        [pathname, content],
        [`${pathname}.hash`, newHash]
      ])
    }
  }

  public async downloadEpisode(
    seasonInfo: Omit<SeasonInfo, "episodesOffline" | "updatedAt" | "size">,
    listEpisodes: Readonly<{
      chaps: readonly RawEpisode[]
      image: string
      poster: string
    }>,
    episodeId: string,
    episodeRealId: string,
    source: Source,
    resolvePlaylist: (manifest: Hls.types.MasterPlaylist) => Promise<string>
  ) {
    // save seasonInfo
    const seasonId = seasonInfo.seasonId
    const oldSeasonInfo =
      ((await this.#utils
        .get(`/${AnimeDownloadManager.constants.seasons}/${seasonId}`)
        .then((res) => (res ? JSON.parse(res as string) : null))
        .catch(() => null)) as SeasonInfo | null) ??
      <SeasonInfo>{
        ...seasonInfo,
        episodesOffline: {},
        updatedAt: -1
      }

    if (oldSeasonInfo !== seasonInfo) {
      Object.assign(oldSeasonInfo, seasonInfo)
      // download poster
      if (seasonInfo.poster && !seasonInfo.poster.startsWith("file:")) {
        const buffer = await this.#optionsHttp
          .request(seasonInfo.poster)
          .then((res) => res.arrayBuffer())
          .then((buffer) => new Uint8Array(buffer))
        await this.#utils.set(
          `/${AnimeDownloadManager.constants.posters}/${seasonId}`,
          buffer
        )
        oldSeasonInfo.poster = `file:/${AnimeDownloadManager.constants.posters}/${seasonId}`
      }
      // download image
      if (seasonInfo.image && !seasonInfo.image.startsWith("file:")) {
        const buffer = await this.#optionsHttp
          .request(seasonInfo.image)
          .then((res) => res.arrayBuffer())
          .then((buffer) => new Uint8Array(buffer))
        await this.#utils.set(
          `/${AnimeDownloadManager.constants.images}/${seasonId}`,
          buffer
        )
        oldSeasonInfo.image = `file:/${AnimeDownloadManager.constants.images}/${seasonId}`
      }
    }
    await this.lazyUpdateFile(
      `/${AnimeDownloadManager.constants.lsEpisodes}/${seasonId}`,
      JSON.stringify(listEpisodes)
    )

    oldSeasonInfo.updatedAt = Date.now()
    oldSeasonInfo.episodesOffline ??= {}

    const content = await this.#optionsHttp
      .request(source.file)
      .then((res) => res.text())
    const optionsHttp = this.#optionsHttp
    const utils = this.#utils

    const episodeStart: Episode = {
      id: episodeId,
      real_id: episodeRealId,
      source,
      hash: "",
      hidden: true,
      size: 0,
      progress: { cur: 0, total: Infinity }
    }
    this.#optionsHttp.onstart(oldSeasonInfo, episodeStart)
    const episode = await downloadVideo(
      content,
      oldSeasonInfo,
      episodeStart,
      resolvePlaylist,
      optionsHttp,
      utils
    )
    oldSeasonInfo.episodesOffline[episode.id] = episode
    // now you can save episodes
    await this.#utils.setMany([
      [
        `/${AnimeDownloadManager.constants.seasons}/${seasonId}`,
        JSON.stringify(oldSeasonInfo)
      ],
      [
        `/${AnimeDownloadManager.constants.allseasons}`,
        JSON.stringify([
          ...(await this.#utils
            .get(`/${AnimeDownloadManager.constants.allseasons}`)
            .then((res) => (res ? JSON.parse(res as string) : []))
            .catch((err) => (console.warn(err), []))),
          seasonId
        ])
      ]
    ])
  }

  public async getSeason(seasonId: string) {
    const content = (await this.#utils
      .get(`/${AnimeDownloadManager.constants.seasons}/${seasonId}`)
      .then((res) => (res ? JSON.parse(res as string) : null))
      .catch(() => null)) as SeasonInfo | null

    return content
  }

  public async listSeason(
    sort: "asc" | "desc" = "asc",
    limit: number = -1 >>> 0,
    after: number = 0
  ) {
    const filesName = (await this.#utils
      .get(`/${AnimeDownloadManager.constants.allseasons}`)
      .then((res) => (res ? JSON.parse(res as string) : []))) as string[]

    const contents = await this.#utils
      .getMany(
        filesName
          .slice(after, limit)
          .map((name) => `/${AnimeDownloadManager.constants.seasons}/${name}`)
      )
      .then(
        (contents) =>
          contents
            .map((json) => {
              if (!json) return
              try {
                return JSON.parse(json as string) as SeasonInfo
              } catch (err) {
                console.warn(err)
              }
            })
            .filter(Boolean) as SeasonInfo[]
      )

    if (sort === "asc") {
      contents.sort((a, b) => a.updatedAt - b.updatedAt)
    } else {
      contents.sort((a, b) => b.updatedAt - a.updatedAt)
    }

    return contents
  }

  public async getEpisode(uniqueEpisode: string) {
    const hash = await sha256sum(uniqueEpisode)
    const data = (await this.#utils.get(
      `/${AnimeDownloadManager.constants.episodes}/${hash}/index.meta`
    )) as string

    if (!data) return null

    try {
      return JSON.parse(data) as Episode
    } catch (err) {
      console.warn(err)

      return null
    }
  }

  public async hasEpisode(uniqueEpisode: string) {
    const hash = await sha256sum(uniqueEpisode)
    return !!this.#utils.get(
      `/${AnimeDownloadManager.constants.episodes}/${hash}/index.meta`
    )
  }

  public getListEpisodes(seasonId: string) {
    return this.#utils
      .get(`/${AnimeDownloadManager.constants.lsEpisodes}/${seasonId}`)
      .then((json) =>
        json
          ? (JSON.parse(json as string) as Readonly<{
              chaps: readonly RawEpisode[]
              image: string
              poster: string
            }>)
          : null
      )
      .catch(() => null)
  }

  public async getFileSize(file: string) {
    const response = await this.#optionsHttp.request(file, "HEAD")
    console.log(response)
    return parseInt(response.headers.get("content-length") ?? "-1") || -1
  }

  public async getHlsSize(file: string, seikaku: number) {
    const content = await this.#optionsHttp
      .request(file)
      .then((res) => res.text())

    const parsedManifest = parse(content)

    if (isMasterPlaylist(parsedManifest)) {
      throw new Error("Can't calculate master playlist size.")
    }

    const { segments } = parsedManifest

    return (
      ((
        await Promise.all(
          segments.slice(0, seikaku).map((item) => this.getFileSize(item.uri))
        )
      ).reduce((a, b) => a + b, 0) *
        segments.length) /
      seikaku
    )
  }
}
