import { downloadVideo } from "./logic/download-video"
import type Hls from "hls-parser"

interface Anchor {
  path: string
  name: string
}
interface SeasonInfo {
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
  content: string
  hidden: boolean
  name: string
  real_id: string
}

interface Source {
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
  get: <UseString extends boolean>(
    uri: string,
    useString?: UseString
  ) => Promise<UseString extends true ? string : Uint8Array>
  delay: number
  repeat: number
  concurrent: number
  onprogress: (current: number, total: number) => void
}
export interface Utils {
  readdir(path: string): Promise<string[]>
  readFile(path: string): Promise<string>
  readFiles(paths: string[]): Promise<string[]>
  hasFile(path: string): Promise<boolean>
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
    seasonInfo: Omit<SeasonInfo, "episodeIds" | "updatedAt">,
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
    }

    oldSeasonInfo.episodeIds.push(episode.id)
    oldSeasonInfo.updatedAt = Date.now()

    const content = await this.#optionsHttp.get(source.file, true)
    const name = "playlist.m3u8"
    const optionsHttp = this.#optionsHttp
    const utils = this.#utils

    return downloadVideo(content, episode, resolvePlaylist, optionsHttp, utils)
    // now you can save episodes
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
}
