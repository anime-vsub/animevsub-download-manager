import { parse, stringify } from "hls-parser"
import type Hls from "hls-parser"
import { retry } from "./retry"
import { sha256sum } from "./sha256sum"
import { concurrent } from "./concurrent"
import { Episode, OptionsHttp, Utils } from "../main"

function isMasterPlaylist(
  manifest: Hls.types.MasterPlaylist | Hls.types.MediaPlaylist
): manifest is Hls.types.MasterPlaylist {
  return manifest.isMasterPlaylist
}

/** @returns {number} is id number media playlist */
export async function downloadVideo(
  content: string,
  episode: Omit<Episode, "hash" | "content" | "hidden">,
  resolvePlaylist: (manifest: Hls.types.MasterPlaylist) => Promise<string>,
  optionsHttp: OptionsHttp,
  utils: Pick<Utils, "readFile" | "writeFile" | "hasFile">
): Promise<string> {
  const parsedManifest = parse(content)

  if (isMasterPlaylist(parsedManifest)) {
    const result = await resolvePlaylist(parsedManifest)
    return downloadVideo(result, episode, resolvePlaylist, optionsHttp, utils)
  }

  const hashFilename = await sha256sum(episode.real_id)
  const hlsInDatabase = (await utils
    .readFile(`episodes/${hashFilename}`)
    .then((text) => JSON.parse(text))
    .catch((err) => void (err?.code === "ENOENT" || console.warn(err)))) as
    | Episode
    | undefined

  if (hlsInDatabase && !hlsInDatabase.hidden) return hlsInDatabase.hash

  // ok let go download files
  const hashSegments: string[] = []

  // init media playlist
  const mediaId =
    hlsInDatabase?.hash ||
    (await utils.writeFile(
      `/episodes/${hashFilename}/index.m3u8`,
      JSON.stringify(<Episode>{
        ...episode,
        hash: hashFilename,
        content: "",
        hidden: true
      })
    ),
    hashFilename)
  await concurrent(
    parsedManifest.segments,
    async (segment, index) => {
      await retry(
        async (): Promise<void> => {
          // hash now
          const hash = await sha256sum(segment.uri)
          const path = `/episodes/${mediaId}/segments/${hash}`

          const rowInDb = await utils.hasFile(path)

          if (!rowInDb) {
            const buffer = await retry(
              () => optionsHttp.get(segment.uri),
              optionsHttp
            )

            await utils.writeFile(path, buffer)

            optionsHttp.onprogress(index, parsedManifest.segments.length)
          }

          hashSegments.push(hash)
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

  // update media playlist hidden = false
  await utils.writeFile(
    `/episodes/${hashFilename}/index.m3u8`,
    JSON.stringify(<Episode>{
      ...episode,
      hash: hashFilename,
      content: stringify(parsedManifest),
      hidden: false
    })
  )

  return mediaId
}
