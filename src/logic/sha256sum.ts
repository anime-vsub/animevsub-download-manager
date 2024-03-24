let encoder: TextEncoder
export function sha256sum(buffer: ArrayBuffer | string) {
  if (typeof buffer === "string") {
    encoder = new TextEncoder()
    buffer = encoder.encode(buffer)
  }
  return crypto.subtle.digest("SHA-256", buffer).then((hash) => {
    const hashArray = Array.from(new Uint8Array(hash))
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")

    return hashHex
  })
}
