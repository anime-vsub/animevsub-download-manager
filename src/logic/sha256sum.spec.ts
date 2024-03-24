import { sha256sum } from "./sha256sum"

describe("sha256sum function", () => {
  test("should return the correct SHA-256 hash for a valid input buffer", async () => {
    const inputBuffer = new TextEncoder().encode("Hello, World!")
    const expectedHash =
      "a591a6d40bf27e1c2c6890d09cc8b7354beff0ea9cf25e2d4ad8e7c0df2a366"

    const result = await sha256sum(inputBuffer)

    expect(result).toBe(expectedHash)
  })

  test("should return an error when an empty buffer is passed as input", async () => {
    const inputBuffer = new ArrayBuffer(0)

    const result = await sha256sum(inputBuffer)

    expect(result).toBeUndefined()
  })
})
