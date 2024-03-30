import { sha256sum } from "./sha256sum"

describe("sha256sum function", () => {
  test("should return the correct SHA-256 hash for a valid input buffer", async () => {
    const inputBuffer = new TextEncoder().encode("Hello, World!")
    const expectedHash =
      "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"

    const result = await sha256sum(inputBuffer)

    expect(result).toBe(expectedHash)
  })

  test("should return an error when an empty buffer is passed as input", async () => {
    const inputBuffer = new Uint8Array([1, 2, 3, 5, 5, 6, 7, 865, 234]).buffer

    const result = await sha256sum(inputBuffer)

    expect(result).toBe(
      "d20650a81ee76b110d2b810bae1b9a784fd4a66ee520ca924a9a02e24dbba6d3"
    )
  })
})
