import { sleep } from "./sleep"

export async function retry<T>(
  fn: () => T,
  options: { delay: number; repeat: number }
): Promise<Awaited<T>> {
  try {
    return await fn()
  } catch (err) {
    if (options.repeat > 0) {
      await sleep(options.delay)
      return await retry(fn, { ...options, repeat: options.repeat - 1 })
    }
    throw err
  }
}
