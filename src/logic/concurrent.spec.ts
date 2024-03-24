import { concurrent } from "./concurrent"

async function asyncFunction(value: number, index: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Result-${value}`)
    }, 100)
  })
}

test("concurrent with empty array and concurrency of 3", async () => {
  const result = await concurrent([], asyncFunction, 3)
  expect(result).toEqual([])
})

test("concurrent with array of 5 elements and concurrency of 2", async () => {
  const result = await concurrent([1, 2, 3, 4, 5], asyncFunction, 2)
  expect(result).toEqual([
    "Result-1",
    "Result-2",
    "Result-3",
    "Result-4",
    "Result-5"
  ])
})

test("concurrent with long-running asynchronous function and concurrency of 1", async () => {
  const result = await concurrent([1, 2, 3, 4, 5], asyncFunction, 1)
  expect(result).toEqual([
    "Result-1",
    "Result-2",
    "Result-3",
    "Result-4",
    "Result-5"
  ])
})
