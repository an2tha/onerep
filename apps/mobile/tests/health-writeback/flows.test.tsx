import { Window } from "happy-dom"
import { afterEach, expect, mock, test } from "bun:test"
import { act } from "react"
import type { HealthNutritionItemsWrite } from "../../src/lib/health-provider"
import type { HealthNutritionItemSource } from "../../src/lib/health-nutrition-items"

const window = new Window({ url: "http://localhost" })
for (const key of ["window", "document", "navigator", "HTMLElement"] as const) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const timers = new Map<number, () => void>()
let nextTimer = 0
window.setTimeout = ((callback: () => void) => {
  timers.set(++nextTimer, callback)
  return nextTimer
}) as typeof window.setTimeout
window.clearTimeout = ((id: number) => {
  timers.delete(id)
}) as typeof window.clearTimeout

const calls: HealthNutritionItemsWrite[] = []
let enabled = true
let account = 0
const realConvex = await import("convex/react")
mock.module("convex/react", () => ({
  ...realConvex,
  useQuery: () => ({
    userId: `owner-${account}`,
    healthSync: { writeEnabled: enabled },
    hydrationEnabled: true,
  }),
}))
mock.module("../../src/lib/health-provider", () => ({
  saveHealthNutritionItems: async (options: HealthNutritionItemsWrite) => {
    calls.push(options)
    return { saved: true, written: options.items.length }
  },
}))
mock.module("../../src/lib/hydration", () => ({
  hydrationEnabledFor: () => true,
}))
mock.module("../../src/lib/health-write-access", () => ({
  refreshHealthWriteAccess: async () => {},
}))
mock.module("../../src/lib/health-write-report", () => ({
  reportHealthWriteOutcome: () => {},
}))
const { createRoot } = await import("react-dom/client")
const { useNutritionHealthWriteBack } =
  await import("../../src/lib/nutrition-writeback")

function Harness({
  entries,
  water,
}: {
  entries?: HealthNutritionItemSource[]
  water?: number
}) {
  useNutritionHealthWriteBack("2026-11-02", entries, water)
  return null
}
const roots: ReturnType<typeof createRoot>[] = []
async function mount(entries?: HealthNutritionItemSource[], water?: number) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const render = async (
    nextEntries?: HealthNutritionItemSource[],
    nextWater?: number
  ) => {
    await act(async () =>
      root.render(<Harness entries={nextEntries} water={nextWater} />)
    )
  }
  await render(entries, water)
  return render
}
async function flushWrites() {
  await act(async () => {
    const pending = [...timers.values()]
    timers.clear()
    pending.forEach((callback) => callback())
    await Promise.resolve()
  })
}
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ""
  timers.clear()
  calls.length = 0
  enabled = true
  account++
})
const meal = { id: "lunch", name: "Lunch", calories: 500 }

test("browsing away after a successful write cannot clear today's health data", async () => {
  const render = await mount([meal], 500)
  await flushWrites()
  expect(calls).toHaveLength(1)
  await render(undefined, 0)
  await flushWrites()
  expect(calls).toHaveLength(1)
  await render([], 0)
  await flushWrites()
  expect(calls[1]).toMatchObject({ clearNutrition: true, clearWater: true })
})

test("browsing away cancels a pending clear before its debounce fires", async () => {
  const render = await mount([meal], 500)
  await flushWrites()
  await render([], 0)
  await render(undefined, 0)
  await flushWrites()
  expect(calls).toHaveLength(1)
})

test("unloaded water cannot become a zero-volume deletion", async () => {
  const render = await mount([meal], 500)
  await flushWrites()
  await render([], undefined)
  await flushWrites()
  expect(calls).toHaveLength(1)
  await render([], 500)
  await flushWrites()
  expect(calls[1]).toMatchObject({
    items: [],
    waterMl: 500,
    clearNutrition: true,
  })
  expect(calls[1].clearWater).toBeUndefined()
})

test("disabling health write-back cancels a scheduled deletion", async () => {
  const render = await mount([meal], 500)
  await flushWrites()
  await render([], 0)
  enabled = false
  await render([], 0)
  await flushWrites()
  expect(calls).toHaveLength(1)
})
