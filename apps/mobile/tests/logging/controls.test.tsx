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
mock.module("@/lib/food-log", () => ({
  defaultMeal: () => "breakfast",
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
mock.module("@repo/ui", () => ({
  cn: (...values: string[]) => values.join(" "),
  toast: { error: () => {}, success: (_message: string, options: { action: { onClick: () => void } }) => { undo = options.action.onClick } },
  energyDisplay: (value: number) => value,
}))
const { RepeatChips } = await import("../../src/dashboard/repeat-chips")
const { VoiceLogButton } = await import("../../src/dashboard/voice-log-button")
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
