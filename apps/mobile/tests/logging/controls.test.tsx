import { expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getFunctionName } from "convex/server"
import { writeFileSync } from "node:fs"
const calls: Array<{ name: string; args: any }> = []
let release: (() => void) | undefined
let undo: (() => void) | undefined
let fail = false
const entry = {
  id: "oats",
  name: "Oats with blueberries and Greek yogurt",
  calories: 360,
  protein: 24,
  carbs: 40,
  fat: 9,
  meal: "breakfast",
  loggedAt: "2026-09-30T08:00:00Z",
}
/**
 * The meal a tap right now lands in. Deliberately *not* the meal the fixture
 * entry carries, so a repeat that inherits its source's tag is distinguishable
 * from one that uses the current meal.
 */
const CURRENT_MEAL = "snack-post-dinner"
/**
 * Spread the real module before overriding: `mock.module` swaps out the whole
 * module, and bun's registry is process-wide, so a stub carrying only the two
 * functions this file needs hides every other export from any test that runs
 * after it — another file reading `FOOD_MICRONUTRIENT_KEYS` off the same module
 * fails with "export not found".
 */
const realFoodLog = await import("@/lib/food-log")
mock.module("@/lib/food-log", () => ({
  ...realFoodLog,
  defaultMeal: () => CURRENT_MEAL,
  foodLogEntriesFromMealPreset: (preset: { entries: unknown[] }) =>
    preset.entries,
}))
mock.module("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => async (args: unknown) => {
    const name = getFunctionName(ref)
    calls.push({ name, args })
    if (name.endsWith(":addEntries")) {
      if (fail) throw new Error("Offline")
      await new Promise<void>((resolve) => { release = resolve })
    }
    return { ok: true }
  },
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref)
    if (name === "logs/foodLogs:getRecent")
      return [{ date: "2026-09-30", entries: [entry] }]
    if (name === "logs/mealPresets:list")
      return [
        {
          id: "lunch",
          name: "Chicken, rice and vegetables",
          meal: "lunch",
          entries: [entry, { ...entry, id: "rice" }],
        },
      ]
    return null
  },
}))
mock.module("@/lib/use-energy-unit", () => ({ useEnergyUnit: () => "kcal" }))
mock.module("@/lib/use-dashboard-voice-log", () => ({
  useDashboardVoiceLog: () => ({
    available: true,
    listening: false,
    sending: false,
    error: null,
    interim: "",
    toggle: () => {},
  }),
}))
const realUi = await import("@repo/ui")
// Same hazard as the food-log stub above: spread first, then override.
mock.module("@repo/ui", () => ({
  ...realUi,
  cn: (...values: string[]) => values.join(" "),
  toast: { error: () => {}, success: (_message: string, options: { action: { onClick: () => void } }) => { undo = options.action.onClick } },
  energyDisplay: (value: number) => value,
}))
const { RepeatChips } = await import("../../src/dashboard/repeat-chips")
const { VoiceLogButton } = await import("../../src/dashboard/voice-log-button")

/** A happy-dom window with the chips mounted, for the click-driven tests. */
async function mountChips() {
  const { Window } = await import("happy-dom")
  const window = new Window({ url: "http://localhost" })
  for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent", "CustomEvent"] as const) {
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true })
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const { act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<RepeatChips dateKey="2026-10-01" />))
  return { act, container, root, window }
}

test("logging controls keep readable content and accessible actions", () => {
  const html = renderToStaticMarkup(
    <div className="my-2 flex items-center gap-2">
      <RepeatChips dateKey="2026-10-01" />
      <VoiceLogButton />
    </div>,
  )
  expect(html).toContain("Oats with blueberries")
  expect(html).toContain('aria-label="Log by voice"')
  expect(html).not.toContain(" fixed ")
  if (process.env.LOGGING_FIXTURE)
    writeFileSync(
      "tests/visual/fixtures/logging.generated.html",
      `<!doctype html><html data-visual-identity="onerep"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import '/src/styles/index.css';document.documentElement.dataset.stylesReady='true'</script></head><body class="bg-background text-foreground"><main class="mx-auto max-w-3xl p-5"><h1 class="mb-4 text-2xl font-semibold">Today</h1>${html}</main></body></html>`,
    )
})


test("repeat blocks duplicate taps, commits a whole preset, and undoes that batch", async () => {
  const { act, container, root, window } = await mountChips()
  const saved = container.querySelectorAll("button")[1]!
  await act(async () => { saved.click(); saved.click() })
  expect(calls).toHaveLength(1)
  expect(calls[0].args.entries).toHaveLength(2)
  expect(saved.disabled).toBe(true)
  await act(async () => release?.())
  expect(saved.disabled).toBe(false)
  await act(async () => undo?.())
  expect(calls[1]).toEqual({ name: "logs/foodLogs:removeEntries", args: { date: "2026-10-01", entryIds: calls[0].args.entries.map((entry: { id: string }) => entry.id) } })
  fail = true
  await act(async () => saved.click())
  expect(saved.disabled).toBe(false)
  await act(async () => root.unmount())
  window.happyDOM.abort()
})

test("a repeat is logged under the current meal and time, not its source entry's", async () => {
  fail = false
  const { act, container, root, window } = await mountChips()
  const before = calls.length
  // Repeated foods lead the list; the saved meal follows them.
  const repeated = container.querySelectorAll("button")[0]!
  await act(async () => repeated.click())
  expect(calls).toHaveLength(before + 1)
  expect(calls[before].name).toBe("logs/foodLogs:addEntries")
  expect(calls[before].args.date).toBe("2026-10-01")
  // The entry the repeat was copied from: a breakfast, 08:00, on its own day.
  expect(entry.meal).toBe("breakfast")
  expect(entry.loggedAt).toBe("2026-09-30T08:00:00Z")
  const logged = calls[before].args.entries[0]
  expect(logged.name).toBe(entry.name)
  expect(logged.calories).toBe(entry.calories)
  expect(logged.meal).toBe(CURRENT_MEAL)
  const at = new Date(logged.loggedAt)
  // The day being viewed, at the current meal's own time.
  expect([
    at.getFullYear(),
    at.getMonth() + 1,
    at.getDate(),
    at.getHours(),
    at.getMinutes(),
  ]).toEqual([2026, 10, 1, 20, 0])
  await act(async () => release?.())
  await act(async () => root.unmount())
  window.happyDOM.abort()
})
