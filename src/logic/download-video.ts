import { parse, stringify } from "hls-parser"
import type Hls from "hls-parser"
import { retry } from "./retry"
import { sha256sum } from "./sha256sum"
import { concurrent } from "./concurrent"
import { Episode, OptionsHttp, Utils, SeasonInfo } from "../main"

import { isMasterPlaylist } from "./is-master-playlist"

/** @returns {number} is id number media playlist */
export async function downloadVideo(
  content: string,
  seasonInfo: SeasonInfo,
  episode: Omit<Episode, "hash" | "content" | "hidden" | "size">,
  resolvePlaylist: (manifest: Hls.types.MasterPlaylist) => Promise<string>,
  optionsHttp: OptionsHttp,
  utils: Pick<Utils, "readFile" | "writeFile" | "hasFile">
): Promise<string> {
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


  const hashFilename = (episode.real_id)
  let hlsInDatabase = (await utils
    .readFile(`/episodes/${hashFilename}`)
    .then((text) => JSON.parse(text))
    .catch((err) => void (err?.code === "ENOENT" || console.warn(err)))) as
    | Episode
    | undefined

  if (hlsInDatabase && !hlsInDatabase.hidden) return hlsInDatabase.hash

  if (!hlsInDatabase) {
    hlsInDatabase = <Episode>{
      ...episode,
      hash: hashFilename,
      hidden: true
    }
    await utils.writeFile(
      `/episodes/${hashFilename}/index.meta`,
      JSON.stringify(hlsInDatabase)
    )
  }

  // ok let go download files
  const hashSegments: string[] = []

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
          const path = `/episodes/${hashFilename}/segments/${hash}`

          const rowInDb = await utils.hasFile(path)

          if (!rowInDb) {
            const buffer = await retry(
              () =>
                optionsHttp
                  .request(segment.uri)
                  .then((res) => res.arrayBuffer())
                  .then((buffer) => new Uint8Array(buffer)),
              optionsHttp
            )

            await utils.writeFile(path, buffer)
            size += buffer.length
          } else {
            size += rowInDb.size
            console.log("segment size is %f kB", rowInDb.size / 1024)
          }
          hashSegments.push(hash)

          optionsHttp.onprogress(
            seasonInfo,
            hlsInDatabase!,
            hashSegments.length,
            parsedManifest.segments.length
          )

          segment.uri = `file:./segments/${hash}`
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

  // update media playlist hidden = false
  await utils.writeFile(
    `/episodes/${hashFilename}/index.meta`,
    JSON.stringify(<Episode>{
      ...episode,
      hash: hashFilename,
      hidden: false,
      size
    })
  )
  await utils.writeFile(
    `/episodes/${hashFilename}/index.m3u8`,
    stringify(parsedManifest)
  )

  return hashFilename
}
