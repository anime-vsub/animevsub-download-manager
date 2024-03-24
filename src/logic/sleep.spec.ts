import { sleep } from "./sleep"

describe("sleep function", () => {
  it("should wait for the specified number of milliseconds", async () => {
    const start = Date.now()
    const ms = 1000 // 1 second
    await sleep(ms)
    const end = Date.now()
    const elapsed = end - start
    expect(elapsed).toBeGreaterThanOrEqual(ms)
  })
})
