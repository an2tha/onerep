import { Window } from "happy-dom"
import { afterEach, expect, mock, test } from "bun:test"
import { act, type ReactNode } from "react"
import { readFileSync } from "node:fs"

const window = new Window({ url: "http://localhost" })
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "Event",
  "MouseEvent",
  "CustomEvent",
  "localStorage",
  "sessionStorage",
] as const) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let enabled = true
const realConvex = await import("convex/react")
mock.module("convex/react", () => ({
  ...realConvex,
  useQuery: () => ({ hydrationEnabled: enabled }),
  useMutation: () => async () => null,
}))
mock.module("@/lib/convex", () => ({ convexClient: {} }))
mock.module("@/components/mobile-sheet", () => ({
  MobileSheet: ({
    children,
    top,
    bottom,
  }: {
    children: ReactNode
    top?: ReactNode
    bottom?: ReactNode
  }) => (
    <div>
      {top}
      {children}
      {bottom}
    </div>
  ),
}))
mock.module("@/lib/use-offline-mutation", () => ({
  useOfflineMutation: () => async () => null,
}))
const { createRoot } = await import("react-dom/client")
const { FoodDetailSheet } =
  await import("../../src/components/food-detail-sheet")
const { FoodEntrySheet } = await import("../../src/pages/Nutrition")
const { writeHydrationCountDefault } = await import("../../src/lib/hydration")
const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ""
  window.localStorage.clear()
  enabled = true
})
async function mount(ui: ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(ui))
  return container
}
const food = {
  id: "review-food",
  code: "review-food",
  name: "Chicken breast",
  brand: "",
  serving: "100 g",
  servingLabel: "100 g",
  servingGrams: 100,
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 4,
  nutrients: [],
}
for (const scenario of [
  {
    name: "solid food with a remembered yes",
    enabled: true,
    food,
    expected: undefined,
  },
  {
    name: "drink with tracking disabled",
    enabled: false,
    food: {
      ...food,
      name: "Coffee",
      serving: "250 ml",
      servingLabel: "250 ml",
      servingGrams: 250,
    },
    expected: undefined,
  },
  {
    name: "drink with tracking enabled",
    enabled: true,
    food: {
      ...food,
      name: "Coffee",
      serving: "250 ml",
      servingLabel: "250 ml",
      servingGrams: 250,
    },
    expected: 250,
  },
]) {
  test(`saving ${scenario.name} honors the visible hydration choice`, async () => {
    enabled = scenario.enabled
    writeHydrationCountDefault(true)
    const saved: unknown[][] = []
    const container = await mount(
      <FoodDetailSheet
        item={scenario.food}
        added={false}
        showMealPicker={false}
        presentation="page"
        onClose={() => {}}
        onAdd={(...args) => saved.push(args)}
      />
    )
    const cta = container.querySelector<HTMLButtonElement>(".food-log-cta")!
    expect(cta).not.toBeNull()
    await act(async () => cta.click())
    expect(saved).toHaveLength(1)
    expect(saved[0]![6]).toBe(scenario.expected)
  })
}

test("editing a drink while tracking is disabled preserves its stored water", async () => {
  enabled = false
  const entry = {
    id: "coffee",
    name: "Coffee",
    meal: "breakfast" as const,
    loggedAt: "2026-10-26T08:00:00Z",
    calories: 20,
    protein: 1,
    carbs: 2,
    fat: 1,
    hydrationMl: 330,
  }
  const saved: (typeof entry)[] = []
  const container = await mount(
    <FoodEntrySheet
      entry={entry}
      saving={false}
      onSave={(value) => saved.push(value as typeof entry)}
      onClose={() => {}}
      onDelete={() => {}}
    />
  )
  const meal = container.querySelector<HTMLSelectElement>("select")!
  await act(async () => {
    meal.value = "lunch"
    meal.dispatchEvent(new window.Event("change", { bubbles: true }))
  })
  const save = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent?.includes("Save changes"))!
  expect(save?.disabled).toBe(false)
  await act(async () => save.click())
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ meal: "lunch", hydrationMl: 330 })
})

test("both diary date branches include other apps' intake", () => {
  const source = readFileSync(
    new URL("../../src/pages/Nutrition.tsx", import.meta.url),
    "utf8"
  )
  const todayStart = source.indexOf("{!isToday ? null : (")
  expect(todayStart).toBeGreaterThan(0)
  expect(source.slice(0, todayStart)).toContain("<ExternalIntakeCard")
  expect(source.slice(todayStart)).toContain("<ExternalIntakeCard")
})
