import { expect, test } from "bun:test"
import { createNutritionWriteQueue } from "../nutrition-writeback-queue"
import type {
  HealthNutritionItemsWrite,
  HealthWriteResult,
} from "../health-provider"

const meal = {
  id: "meal",
  name: "Lunch",
  meal: "lunch" as const,
  calories: 500,
  protein: 30,
  carbs: 50,
  fat: 20,
}
const day = {
  date: "2026-11-02",
  items: [meal],
  waterMl: 500,
  hydrationEnabled: true,
}

function setup() {
  const calls: HealthNutritionItemsWrite[] = []
  const write = createNutritionWriteQueue(async (options) => {
    calls.push(options)
    return { saved: true, written: options.items.length }
  })
  return { calls, write }
}

test("browsing another day or loading queries never clears a written day", async () => {
  const { calls, write } = setup()
  await write("owner", day)
  await write("owner", { ...day, items: undefined, waterMl: 0 })
  expect(calls).toHaveLength(1)
  await write("owner", { ...day, items: [], waterMl: 0 })
  expect(calls[1]).toEqual({
    date: day.date,
    items: [],
    clearNutrition: true,
    clearWater: true,
  })
})

test("an empty day never written by this account stays silent", async () => {
  const { calls, write } = setup()
  await write("owner", { ...day, items: [], waterMl: 0 })
  await write("other", day)
  await write("owner", { ...day, items: [], waterMl: 0 })
  expect(calls).toHaveLength(1)
})

test("removing the last food clears nutrition while preserving logged water", async () => {
  const { calls, write } = setup()
  await write("owner", day)
  await write("owner", { ...day, items: [] })
  expect(calls[1]).toEqual({
    date: day.date,
    items: [],
    waterMl: 500,
    clearNutrition: true,
  })
})

test("removing the last water clears hydration while preserving food", async () => {
  const { calls, write } = setup()
  await write("owner", day)
  await write("owner", { ...day, waterMl: 0 })
  expect(calls[1]).toEqual({ date: day.date, items: [meal], clearWater: true })
})

test("turning off hydration or loading its query does not delete water", async () => {
  const { calls, write } = setup()
  await write("owner", day)
  await write("owner", { ...day, items: [], hydrationEnabled: false })
  expect(calls[1]).toEqual({ date: day.date, items: [], clearNutrition: true })
  await write("owner", { ...day, items: [], waterMl: undefined })
  expect(calls).toHaveLength(2)
  await write("owner", { ...day, items: [], waterMl: 0 })
  expect(calls[2]).toEqual({ date: day.date, items: [], clearWater: true })
})

test("a clear waits for the first in-flight save, then removes its records", async () => {
  const calls: HealthNutritionItemsWrite[] = []
  let finish!: (result: HealthWriteResult) => void
  const write = createNutritionWriteQueue(async (options) => {
    calls.push(options)
    if (calls.length === 1)
      return new Promise((resolve) => {
        finish = resolve
      })
    return { saved: true, written: 0 }
  })
  const first = write("owner", day)
  await Promise.resolve()
  const clear = write("owner", { ...day, items: [], waterMl: 0 })
  expect(calls).toHaveLength(1)
  finish({ saved: true, written: 2 })
  await Promise.all([first, clear])
  expect(calls[1]).toEqual({
    date: day.date,
    items: [],
    clearNutrition: true,
    clearWater: true,
  })
})

test("the latest diary state supersedes intermediate queued changes", async () => {
  const calls: HealthNutritionItemsWrite[] = []
  let finish!: (result: HealthWriteResult) => void
  const write = createNutritionWriteQueue(async (options) => {
    calls.push(options)
    if (calls.length === 1)
      return new Promise((resolve) => {
        finish = resolve
      })
    return { saved: true }
  })
  const first = write("owner", day)
  await Promise.resolve()
  const clear = write("owner", { ...day, items: [], waterMl: 0 })
  const restored = write("owner", { ...day, waterMl: 750 })
  finish({ saved: true })
  await Promise.all([first, clear, restored])
  expect(calls).toHaveLength(2)
  expect(calls[1]).toEqual({ date: day.date, items: [meal], waterMl: 750 })
})

test("a permission refusal keeps the clear available for retry", async () => {
  let allowed = true
  const calls: HealthNutritionItemsWrite[] = []
  const write = createNutritionWriteQueue(async (options) => {
    calls.push(options)
    return allowed ? { saved: true } : { saved: false, reason: "no_permission" }
  })
  await write("owner", day)
  allowed = false
  await write("owner", { ...day, items: [], waterMl: 0 })
  allowed = true
  await write("owner", { ...day, items: [], waterMl: 0 })
  expect(calls[2]).toEqual(calls[1])
  await write("owner", { ...day, items: [], waterMl: 0 })
  expect(calls).toHaveLength(3)
})
