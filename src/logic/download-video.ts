import { parse, stringify } from "hls-parser"
import type Hls from "hls-parser"
import { retry } from "./retry"
import { sha256sum } from "./sha256sum"
import { concurrent } from "./concurrent"
import {
  Episode,
  OptionsHttp,
  Utils,
  SeasonInfo,
  AnimeDownloadManager
} from "../main"

import { isMasterPlaylist } from "./is-master-playlist"

/** @returns {number} is id number media playlist */
export async function downloadVideo(
  content: string,
  seasonInfo: SeasonInfo,
  episode: Omit<Episode, "hash" | "content" | "hidden" | "size" | "source">,
  resolvePlaylist: (manifest: Hls.types.MasterPlaylist) => Promise<string>,
  optionsHttp: OptionsHttp,
  utils: Utils
): Promise<Episode> {
  const parsedManifest = parse(content)

  if (isMasterPlaylist(parsedManifest)) {
    const result = await resolvePlaylist(parsedManifest)
    return downloadVideo(
      result,
      seasonInfo,
      episode,
      resolvePlaylist,
      optionsHttp,
      utils
    )
  }

  const hashFilename = await sha256sum(episode.real_id)
  console.log({ hashFilename })
  let hlsInDatabase = (await utils
    .get(`/${AnimeDownloadManager.constants.episodes}/${hashFilename}`)
    .then((text) => (text ? JSON.parse(text as string) : undefined))
    .catch((err) => console.warn(err))) as Episode | undefined

  if (hlsInDatabase && !hlsInDatabase.hidden) return hlsInDatabase

  if (!hlsInDatabase) {
    hlsInDatabase = <Episode>{
      ...episode,
      hash: hashFilename,
      hidden: true
    }
    await utils.set(
      `/${AnimeDownloadManager.constants.episodes}/${hashFilename}/index.meta`,
      JSON.stringify(hlsInDatabase)
    )
  }

  // ok let go download files
  const hashSegments: string[] = []
  const progressingSegments = new Map<string, number>()
  const totalProgressing = (): number => {
    let total = 0
    progressingSegments.forEach(value => void (total += value))
    return total
  }

  optionsHttp.onprogress(
    seasonInfo,
    hlsInDatabase!,
    0,
    parsedManifest.segments.length
  )

  console.log(parsedManifest.segments)
  console.time()
  let size = 0
  await concurrent(
    parsedManifest.segments,
    async (segment) => {
      await retry(
        async (): Promise<void> => {
          console.log("resolving: ", segment)
          // hash now
          const hash = await sha256sum(segment.uri)
          const path = `/${AnimeDownloadManager.constants.episodes}/${hashFilename}/${AnimeDownloadManager.constants.segments}/${hash}`

          const rowInDb = await utils.get(path).catch(() => null)

          if (!rowInDb) {
            const buffer = await retry(
              () =>
                optionsHttp
                  .request(segment.uri, 'get', (received, total) => {
                    progressingSegments.set( hash , received / total )
                  })
                  .then((res) => res.arrayBuffer())
                  .then((buffer) => new Uint8Array(buffer)),
              optionsHttp
            )

            hlsInDatabase!.progress = {
              cur: hashSegments.length + totalProgressing(),
              total: parsedManifest.segments.length
            }
            await utils.setMany([
              [
                `/${AnimeDownloadManager.constants.episodes}/${hashFilename}/index.meta`,
                JSON.stringify(hlsInDatabase)
              ],
              [path, buffer]
            ])
            size += buffer.byteLength
          } else {
            size += (rowInDb as Uint8Array).byteLength
            hlsInDatabase!.progress = {
              cur: hashSegments.length + totalProgressing(),
              total: parsedManifest.segments.length
            }
            console.log(
              "segment size is %f kB",
              (rowInDb as Uint8Array).byteLength / 1024
            )
          }
          hashSegments.push(hash)
          progressingSegments.delete(hash)

          optionsHttp.onprogress(
            seasonInfo,
            hlsInDatabase!,
            hashSegments.length + totalProgressing(),
            parsedManifest.segments.length
          )

          segment.uri = `file:${path}`
        },
        {
          delay: 100,
          repeat: 5
        }
      )
    },
    optionsHttp.concurrent
  )
  console.timeEnd()

  Object.assign(hlsInDatabase, {
    hash: hashFilename,
    hidden: false,
    size,
    source: {
      ...hlsInDatabase.source,
      file: `file:/${AnimeDownloadManager.constants.episodes}/${hashFilename}/index.m3u8`
    },
    progress: {
      cur: parsedManifest.segments.length,
      total: parsedManifest.segments.length
    }
  })
  // update media playlist hidden = false
  await utils.setMany([
    [
      `/${AnimeDownloadManager.constants.episodes}/${hashFilename}/index.m3u8`,
      stringify(parsedManifest)
    ],
    [
      `/${AnimeDownloadManager.constants.episodes}/${hashFilename}/index.meta`,
      JSON.stringify(<Episode>hlsInDatabase)
    ]
  ])

  optionsHttp.onprogress(
    seasonInfo,
    hlsInDatabase!,
    hashSegments.length,
    parsedManifest.segments.length
  )

  return hlsInDatabase
}
