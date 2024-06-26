import { downloadVideo } from "./download-video"
import Hls from "hls-parser"
import { sha256sum } from "./sha256sum"

import FS from "@isomorphic-git/lightning-fs"
import {
  AnimeDownloadManager,
  Episode,
  OptionsHttp,
  SeasonInfo,
  Source,
  Utils
} from "../main"

const fs = new FS("filesystem").promises

const encoder = new TextEncoder()

describe("downloadVideo", async () => {
  const source: Source = {
    file: `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ALLOW-CACHE:YES
#EXT-X-TARGETDURATION:10

#EXTINF:10,
output000.ts
#EXTINF:10,
output001.ts
#EXTINF:10,
output002.ts
#EXTINF:10,
output003.ts
#EXTINF:10,
output004.ts
#EXTINF:10,
output005.ts
#EXTINF:10,
output006.ts
#EXTINF:10,
output007.ts
#EXTINF:10,
output008.ts
#EXTINF:10,
output009.ts

#EXT-X-ENDLIST`,
label: "HD",
qualityCode: "720p",
type: "hls"
  }
  const realId = "playlist"
  const name = "01"
  const resolvePlaylist = async (
    manifest: Hls.types.MasterPlaylist
  ): Promise<string> => {
    return source.file
  }
  const optionsHttp: OptionsHttp = {
    request: (uri: string, method?: string, onprogress?: (received: number, total: number) => void) =>
      Promise.resolve(new Response(uri, { status: 200 })),
    delay: 100,
    repeat: 5,
    concurrent: 2,
    onstart: () => void {},
    onprogress: () => void {}
  }
  const seasonInfo = {} as SeasonInfo
  const episode: Omit<
    Episode,
    "hash" | "content" | "hidden" | "size" | "source"
  > = {
    id: "",
    real_id: realId,
    progress: { cur: 10, total: 10 }
  }
  async function mkdirRecursive(path: string) {
    try {
      await fs.mkdir(path)
    } catch (err: any) {
      if (err?.code === "ENOENT")
        await mkdirRecursive(path.split("/").slice(0, -1).join("/"))
      else throw err
    }
  }
  const utils: Utils = {
    get(path: string) {
      return fs.readFile(path, "utf8") as Promise<string>
    },
    async set(path: string, content: string | Uint8Array) {
      await fs.writeFile(path, content).catch((err) => {
        if (err.code === "ENOENT") {
          return mkdirRecursive(path.split("/").slice(0, -1).join("/")).then(
            () => this.set(path, content)
          )
        }

        throw err
      })
    },
    async setMany(contents: [string, string | Uint8Array][]): Promise<void> {
      await Promise.all(
        contents.map(([path, content]) => this.set(path, content))
      )
    },
    async getMany(paths: string[]): Promise<unknown[]> {
      return Promise.all(paths.map((path) => this.get(path)))
    }
  }

  const segaritants = await Promise.all(
    (Hls.parse(source.file) as Hls.types.MediaPlaylist).segments.map(
      async (item, id) => {
        const hash = await sha256sum(item.uri)
        const content = encoder.encode(item.uri)

        return [hash, content] as const
      }
    )
  )

  async function rmRecursive(path: string) {
    for (const name of await fs.readdir(path)) {
      const path2 = path + "/" + name

      if ((await fs.lstat(path2)).isFile()) await fs.unlink(path2)
      else await rmRecursive(path2)
    }
  }

  beforeEach(async () => {
    await rmRecursive("/")
  })

  test("download success all segments", async () => {
    await downloadVideo(
      source,
      seasonInfo,
      episode,
      resolvePlaylist,
      optionsHttp,
      utils
    )

    const m3u8tans = {
      hash: "76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a",
      hidden: false,
      id: "",
      real_id: "playlist",
      size: 120,
      source: {
        file: `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/index`
      },
      progress: {
        cur: 10,
        total: 10
      }
    }

    expect(
      await fs.readdir(`/${AnimeDownloadManager.constants.episodes}`)
    ).toEqual([m3u8tans.hash])
    expect(
      await fs.readdir(
        `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}`
      )
    ).toEqual([
      "index.meta",
      AnimeDownloadManager.constants.segments,
      "index"
    ])

    expect(
      JSON.parse(
        (await fs.readFile(
          `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/index.meta`,
          "utf8"
        )) as string
      )
    ).toEqual(m3u8tans)
    expect(
      await fs.readFile(
        `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/index`,
        "utf8"
      )
    ).toBe(
      "#EXTM3U\n" +
        "#EXT-X-VERSION:3\n" +
        "#EXT-X-TARGETDURATION:10\n" +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/e4a3b347e295c06a8144ade0b529dcd67c5d6a80ee5e1584f5e95283e89be96d\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/eb9e78c341de72a0b074405680c9e090ee8c7ae49d90c45853acb035cfb95327\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/28b201383f8883ca4b83952c36167b904b03da802363b9a64113631f202ea487\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/b71ad926266710ea0e0799064d410e99fc7ce089200fdb4174f22b12f5514b06\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/20828b2db21ab374d017be5d818e6eb58a99a5b88c1d3f0a18e6c4feb51f44b3\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/3adf2c115646665d442101fa3f54efff8896cd1a2593d33c3325614fdae69558\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/7edd5cd70d1218ad15310655753a2ea9df396ed91d9f57247667f32e74edd379\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/fd2952fbcf411a15d00b54f96088fc853f2756e352736a1260a640411756e6b4\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/05bf5506702480890246c64455b3e69322fc1b6116e81048004a19950e93a00f\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/a3b3ea417bc44489b039c589f8451241ed3a3e6b33fa2295ec432eb8160b8972\n` +
        "#EXT-X-ENDLIST"
    )

    expect(
      await fs.readdir(
        `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/${AnimeDownloadManager.constants.segments}`
      )
    ).toEqual(segaritants.map(([hash]) => hash))
    expect(
      await Promise.all(
        segaritants.map(async (item) => [
          item[0],
          await fs.readFile(
            `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/${AnimeDownloadManager.constants.segments}/${item[0]}`
          )
        ])
      )
    ).toEqual(segaritants)
  })

  test("work if change constants", async () => {
    for (const key in AnimeDownloadManager.constants) {
      ;(AnimeDownloadManager.constants as unknown as any)[key] += "-changed"
    }

    const m3u8tans = {
      hash: "76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a",
      hidden: false,
      id: "",
      real_id: "playlist",
      size: 120,
      source: {
        file: `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/index`
      },
      progress: {
        cur: 10,
        total: 10
      }
    }

    await downloadVideo(
      source,
      seasonInfo,
      episode,
      resolvePlaylist,
      optionsHttp,
      utils
    )

    expect(
      await fs.readdir(`/${AnimeDownloadManager.constants.episodes}`)
    ).toEqual([m3u8tans.hash])
    expect(
      await fs.readdir(
        `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}`
      )
    ).toEqual([
      "index.meta",
      AnimeDownloadManager.constants.segments,
      "index"
    ])

    expect(
      JSON.parse(
        (await fs.readFile(
          `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/index.meta`,
          "utf8"
        )) as string
      )
    ).toEqual(m3u8tans)
    expect(
      await fs.readFile(
        `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/index`,
        "utf8"
      )
    ).toBe(
      "#EXTM3U\n" +
        "#EXT-X-VERSION:3\n" +
        "#EXT-X-TARGETDURATION:10\n" +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/e4a3b347e295c06a8144ade0b529dcd67c5d6a80ee5e1584f5e95283e89be96d\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/eb9e78c341de72a0b074405680c9e090ee8c7ae49d90c45853acb035cfb95327\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/28b201383f8883ca4b83952c36167b904b03da802363b9a64113631f202ea487\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/b71ad926266710ea0e0799064d410e99fc7ce089200fdb4174f22b12f5514b06\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/20828b2db21ab374d017be5d818e6eb58a99a5b88c1d3f0a18e6c4feb51f44b3\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/3adf2c115646665d442101fa3f54efff8896cd1a2593d33c3325614fdae69558\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/7edd5cd70d1218ad15310655753a2ea9df396ed91d9f57247667f32e74edd379\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/fd2952fbcf411a15d00b54f96088fc853f2756e352736a1260a640411756e6b4\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/05bf5506702480890246c64455b3e69322fc1b6116e81048004a19950e93a00f\n` +
        "#EXTINF:10,\n" +
        `file:/${AnimeDownloadManager.constants.episodes}/76cd21db00b2a3eee39dff599ad245a3c5088395388942fde3d2363da968bc1a/${AnimeDownloadManager.constants.segments}/a3b3ea417bc44489b039c589f8451241ed3a3e6b33fa2295ec432eb8160b8972\n` +
        "#EXT-X-ENDLIST"
    )

    expect(
      await fs.readdir(
        `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/${AnimeDownloadManager.constants.segments}`
      )
    ).toEqual(segaritants.map(([hash]) => hash))
    expect(
      await Promise.all(
        segaritants.map(async (item) => [
          item[0],
          await fs.readFile(
            `/${AnimeDownloadManager.constants.episodes}/${m3u8tans.hash}/${AnimeDownloadManager.constants.segments}/${item[0]}`
          )
        ])
      )
    ).toEqual(segaritants)
  })

  // Additional test cases can be added to cover other scenarios
})
