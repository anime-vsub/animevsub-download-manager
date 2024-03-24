import { downloadVideo } from "./download-video"
import Hls from "hls-parser"
import { sha256sum } from "./sha256sum"
import { get, set } from "idb-keyval"

import { openDB, IDBPDatabase } from "idb"
import FS from "@isomorphic-git/lightning-fs"
import { Episode } from "../main"

const fs = new FS("filesystem").promises

const encoder = new TextEncoder()

describe("downloadVideo", async () => {
  const m3u8 = `#EXTM3U
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

#EXT-X-ENDLIST`
  const realId = "playlist.m3u8"
  const name = "01"
  const resolvePlaylist = async (
    manifest: Hls.types.MasterPlaylist
  ): Promise<string> => {
    return m3u8
  }
  const optionsHttp = {
    get: <UseString extends boolean>(
      uri: string,
      _useString?: UseString
    ): Promise<UseString extends true ? string : Uint8Array> =>
      new Promise<UseString extends true ? string : Uint8Array>((resolve) =>
        resolve(
          new Uint8Array(encoder.encode(uri)) as UseString extends true
            ? string
            : Uint8Array
        )
      ),
    delay: 100,
    repeat: 5,
    concurrent: 2,
    onprogress: (current: number, total: number) => void {}
  }
  const episode: Omit<Episode, "hash" | "content" | "hidden"> = {
    id: "",
    real_id: realId,
    name,
    path: "/"
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
  const utils = {
    readdir(path: string) {
      return fs.readdir(path)
    },
    readFile(path: string) {
      return fs.readFile(path, "utf8") as Promise<string>
    },
    hasFile(path: string) {
      return fs
        .lstat(path)
        .then((res) => res.isFile())
        .catch(() => false)
    },
    async writeFile(path: string, content: string | Uint8Array) {
      await fs.writeFile(path, content).catch((err) => {
        if (err.code === "ENOENT") {
          return mkdirRecursive(path.split("/").slice(0, -1).join("/")).then(
            () => this.writeFile(path, content)
          )
        }

        throw err
      })
    }
  }

  const segaritants = await Promise.all(
    (Hls.parse(m3u8) as Hls.types.MediaPlaylist).segments.map(
      async (item, id) => {
        const hash = await sha256sum(item.uri)
        const content = encoder.encode(item.uri)

        return [hash, content] as const
      }
    )
  )
  const m3u8tans = {
    hash: "2caf4264aeb367070107aba7a671da16589c59121cdd605870fd247cb28085ee",
    content:
      "#EXTM3U\n" +
      "#EXT-X-VERSION:3\n" +
      "#EXT-X-TARGETDURATION:10\n" +
      "#EXTINF:10,\n" +
      "file:./segments/e4a3b347e295c06a8144ade0b529dcd67c5d6a80ee5e1584f5e95283e89be96d\n" +
      "#EXTINF:10,\n" +
      "file:./segments/eb9e78c341de72a0b074405680c9e090ee8c7ae49d90c45853acb035cfb95327\n" +
      "#EXTINF:10,\n" +
      "file:./segments/28b201383f8883ca4b83952c36167b904b03da802363b9a64113631f202ea487\n" +
      "#EXTINF:10,\n" +
      "file:./segments/b71ad926266710ea0e0799064d410e99fc7ce089200fdb4174f22b12f5514b06\n" +
      "#EXTINF:10,\n" +
      "file:./segments/20828b2db21ab374d017be5d818e6eb58a99a5b88c1d3f0a18e6c4feb51f44b3\n" +
      "#EXTINF:10,\n" +
      "file:./segments/3adf2c115646665d442101fa3f54efff8896cd1a2593d33c3325614fdae69558\n" +
      "#EXTINF:10,\n" +
      "file:./segments/7edd5cd70d1218ad15310655753a2ea9df396ed91d9f57247667f32e74edd379\n" +
      "#EXTINF:10,\n" +
      "file:./segments/fd2952fbcf411a15d00b54f96088fc853f2756e352736a1260a640411756e6b4\n" +
      "#EXTINF:10,\n" +
      "file:./segments/05bf5506702480890246c64455b3e69322fc1b6116e81048004a19950e93a00f\n" +
      "#EXTINF:10,\n" +
      "file:./segments/a3b3ea417bc44489b039c589f8451241ed3a3e6b33fa2295ec432eb8160b8972\n" +
      "#EXT-X-ENDLIST",
    hidden: false,
    name: "01",
    id: "",
    path: "/",
    real_id: "playlist.m3u8"
  }

  beforeAll(async () => {
    for (const path of await fs.readdir("/"))
      await fs.unlink(path, { recursive: true } as unknown as any)
  })

  test("download success all segments", async () => {
    await downloadVideo(m3u8, episode, resolvePlaylist, optionsHttp, utils)

    expect(await fs.readdir("/episodes")).toEqual([m3u8tans.hash])
    expect(await fs.readdir(`/episodes/${m3u8tans.hash}`)).toEqual([
      "index.m3u8",
      "segments"
    ])

    expect(
      JSON.parse(
        (await fs.readFile(
          `/episodes/${m3u8tans.hash}/index.m3u8`,
          "utf8"
        )) as string
      )
    ).toEqual(m3u8tans)

    expect(await fs.readdir(`/episodes/${m3u8tans.hash}/segments`)).toEqual(
      segaritants.map(([hash]) => hash)
    )
    expect(
      await Promise.all(
        segaritants.map(async (item) => [
          item[0],
          await fs.readFile(`/episodes/${m3u8tans.hash}/segments/${item[0]}`)
        ])
      )
    ).toEqual(segaritants)
  })

  // Additional test cases can be added to cover other scenarios
})
