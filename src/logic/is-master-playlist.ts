import type Hls from "hls-parser"

export function isMasterPlaylist(
  manifest: Hls.types.MasterPlaylist | Hls.types.MediaPlaylist
): manifest is Hls.types.MasterPlaylist {
  return manifest.isMasterPlaylist
}
