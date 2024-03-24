import { retry } from "./retry"

describe("retry", () => {
  it("should return the correct value when fn returns a value", async () => {
    const fn = vi.fn().mockResolvedValue("result")
    const result = await retry(fn, { delay: 100, repeat: 0 })
    expect(result).toBe("result")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("should throw an error when fn throws an error and repeat is 0", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("error"))
    await expect(retry(fn, { delay: 100, repeat: 0 })).rejects.toThrow("error")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("should retry the fn function and return the correct value when fn throws an error and repeat is greater than 0", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("error"))
      .mockResolvedValue("result")
    const result = await retry(fn, { delay: 100, repeat: 1 })
    expect(result).toBe("result")
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
