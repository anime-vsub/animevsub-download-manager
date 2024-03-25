import { downloadVideo } from "./logic/download-video"
import type Hls from "hls-parser"
import { isMasterPlaylist } from "./logic/is-master-playlist"

interface Anchor {
  path: string
  name: string
}
export interface SeasonInfo {
  /** @unique */
  seasonId: string

  image: string
  poster: string

  name: string
  othername: string
  description: string

  pathToView: string
  yearOf: number

  genre: Anchor[]
  quality: string
  authors: Anchor[]
  contries: Anchor[]

  language?: string

  studio?: string
  seasonOf: Anchor

  trailer?: string

  episodeIds: string[]
  updatedAt: number
}

export interface Episode extends Anchor {
  id: string
  hash: string
  hidden: boolean
  name: string
  real_id: string
  size: number
}

export interface Source {
  readonly file: string
  readonly label: "FHD|HD" | "HD" | "FHD" | `${720 | 360 | 340}p`
  readonly qualityCode: string
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
}

export class AnimeDownloadManager {
  readonly #utils: Utils
  readonly #optionsHttp: OptionsHttp

  constructor(utils: Utils, optionsHttp: OptionsHttp) {
    this.#utils = utils
    this.#optionsHttp = optionsHttp
  }

  public async downloadEpisode(
    seasonInfo: Omit<SeasonInfo, "episodeIds" | "updatedAt" | "size">,
    episode: Episode,
    source: Source,
    resolvePlaylist: (manifest: Hls.types.MasterPlaylist) => Promise<string>
  ) {
    // save seasonInfo
    const seasonId = seasonInfo.seasonId
    const oldSeasonInfo = ((await this.#utils
      .readFile(`/seasons/${seasonId}`)
      .then((res) => JSON.parse(res))
      .catch(() => null)) as SeasonInfo | undefined) ?? {
      ...seasonInfo,
      episodeIds: [],
      updatedAt: -1
    }

    if (oldSeasonInfo !== seasonInfo) {
      Object.assign(oldSeasonInfo, seasonInfo)
      // download poster
      const buffer = await this.#optionsHttp
        .request(seasonInfo.poster)
        .then((res) => res.arrayBuffer())
        .then((buffer) => new Uint8Array(buffer))
      await this.#utils.writeFile(`/posters/${seasonId}`, buffer)
      oldSeasonInfo.poster = `file:/posters/${seasonId}`
    }

    oldSeasonInfo.episodeIds.push(episode.id)
    oldSeasonInfo.updatedAt = Date.now()

    const content = await this.#optionsHttp
      .request(source.file)
      .then((res) => res.text())
    const name = "playlist.m3u8"
    const optionsHttp = this.#optionsHttp
    const utils = this.#utils

    this.#optionsHttp.onstart(oldSeasonInfo, episode)
    await downloadVideo(
      content,
      oldSeasonInfo,
      episode,
      resolvePlaylist,
      optionsHttp,
      utils
    )
    // now you can save episodes
    await this.#utils.writeFile(
      `/seasons/${seasonId}`,
      JSON.stringify(oldSeasonInfo)
    )
  }

  public async getSeason(seasonId: string) {
    const content = (await this.#utils
      .readFile(`/seasons/${seasonId}`)
      .then((res) => JSON.parse(res))) as SeasonInfo

    return content
  }

  public async listSeason(seasonId: string, sort: "asc" | "desc" = "asc") {
    const filesName = await this.#utils.readdir(`/seasons`)

    const contents = await this.#utils
      .readFiles(filesName.map((name) => `/seasons/${name}`))
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

  public async listEpisode(seasonInfo: SeasonInfo) {
    return this.#utils
      .readFiles(seasonInfo.episodeIds.map((id) => `/episodes/${id}`))
      .then(
        (contents) =>
          contents
            .map((json) => {
              try {
                return JSON.parse(json)
              } catch (err) {
                console.warn(err)
              }
            })
            .filter(Boolean) as Episode[]
      )
  }

  public async getEpisode(uniqueEpisode: string) {
     return JSON.parse( await this.#utils.readFile(
    `/episodes/${uniqueEpisode}/index.meta`)  )
  }

  public hasEpisode(uniqueEpisode: string) {
     return this.#utils.hasFile (
    `/episodes/${uniqueEpisode}/index.meta`) 
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
      await Promise.all(
        segments.slice(0, seikaku).map((item) => this.getFileSize(item.uri))
      )
    ).reduce((a, b) => a + b, 0) * segments.length / seikaku
  }
}
import { parse } from "hls-parser"

export { sleep } from "./logic/sleep"
export { concurrent } from "./logic/concurrent"
export { retry } from "./logic/retry"
export { sha256sum } from "./logic/sha256sum"
