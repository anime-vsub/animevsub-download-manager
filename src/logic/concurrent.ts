export async function concurrent<T, R>(
  array: T[],
  fn: (value: T, index: number) => Promise<R>,
  concurrency: number
) {
  const currentTask: Set<Promise<void>> = new Set()
  const results: R[] = []

  for (let i = 0, { length } = array; i < length; i++) {
    let done = false
    const task = fn(array[i], i).then((result) => {
      done = true
      results.push(result)
      currentTask.delete(task)
    })
    if (!done) currentTask.add(task)

    if (currentTask.size >= concurrency || i === length - 1) {
      await Promise.all(currentTask)
    }
  }

// backup
  await Promise.all(currentTask)

  return results
}
