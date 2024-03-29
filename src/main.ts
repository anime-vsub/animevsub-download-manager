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
  source: Source
}

export interface Source {
  readonly file: string
  readonly label: "FHD|HD" | "HD" | "FHD" | `${720 | 360 | 340}p`
  readonly qualityCode:  "720p" | "360p" | "340p" | "1080p|720p" | "1080p" | "480p"
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
  readdir(path: string): Promise<string[]>
  readFile(path: string): Promise<string>
  readFiles(paths: string[]): Promise<string[]>
  hasFile(path: string): Promise<{ size: number } | false>
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  writeFiles(contents: [string, string | Uint8Array][]): Promise<void>
  unlinks(paths: string[]): Promise<void>
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
    lsEpisodes: process.env.DEV ? "list-episodes": "05"
  }

  constructor(utils: Utils, optionsHttp: OptionsHttp) {
    this.#utils = utils
    this.#optionsHttp = optionsHttp
  }

  public async lazyUpdateFile(
    pathname: string,
    content: string | Uint8Array
  ): Promise<void> {
    const hash = await this.#utils
      .readFile(`${pathname}.hash`)
      .catch(() => null)

    const newHash = await sha256sum(content)

    if (content !== newHash) {
      // wrong hash -> update this
      await this.#utils.writeFiles([
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
    const oldSeasonInfo = ((await this.#utils
      .readFile(`/${AnimeDownloadManager.constants.seasons}/${seasonId}`)
      .then((res) => JSON.parse(res))
      .catch(() => null)) as SeasonInfo | undefined) ??<SeasonInfo> {
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
        await this.#utils.writeFile(
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
        await this.#utils.writeFile(
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
      size: 0
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
    oldSeasonInfo.episodesOffline[ episode. id ] = (episode)
    // now you can save episodes
    await this.#utils.writeFile(
      `/${AnimeDownloadManager.constants.seasons}/${seasonId}`,
      JSON.stringify(oldSeasonInfo)
    )
  }

  public async getSeason(seasonId: string) {
    const content = (await this.#utils
      .readFile(`/${AnimeDownloadManager.constants.seasons}/${seasonId}`)
      .then((res) => JSON.parse(res))) as SeasonInfo

    return content
  }

  public async listSeason(sort: "asc" | "desc" = "asc") {
    const filesName = await this.#utils.readdir(
      `/${AnimeDownloadManager.constants.seasons}`
    )

    const contents = await this.#utils
      .readFiles(
        filesName.map(
          (name) => `/${AnimeDownloadManager.constants.seasons}/${name}`
        )
      )
      .then(
        (contents) =>
          contents
            .map((json) => {
              try {
                return JSON.parse(json) as SeasonInfo
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
    return JSON.parse(
      await this.#utils.readFile(
        `/${AnimeDownloadManager.constants.episodes}/${hash}/index.meta`
      )
    ) as Episode
  }


  public async hasEpisode(uniqueEpisode: string) {
    const hash = await sha256sum(uniqueEpisode)
    return this.#utils.hasFile(
      `/${AnimeDownloadManager.constants.episodes}/${hash}/index.meta`
    )
  }

  public getListEpisodes(seasonId :string) {
    return this.#utils.readFile(`/${AnimeDownloadManager.constants.lsEpisodes}/${seasonId}`)
    .then(json => JSON.parse(json) as Readonly<{
      chaps: readonly RawEpisode[]
      image: string
      poster: string
    }>)
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
