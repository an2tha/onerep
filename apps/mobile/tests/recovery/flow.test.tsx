import { NudgeIllustration } from "../../../../packages/ui/src/components/nudge-illustration"
import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { getFunctionName } from "convex/server"

const window = new Window({ url: "http://localhost/recovery" })
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "Event",
  "MouseEvent",
] as const) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const React = await import("react")
const { act } = React
const { createRoot } = await import("react-dom/client")
const today = "2026-09-21"
const originalEpisode = {
  _id: "episode-1",
  _creationTime: 1,
  userId: "user-1",
  active: true,
  startedOn: today,
  updatedAt: 1,
  symptoms: "Tired",
  manageable: "Rest",
  energy: "low",
  phase: "resting",
  deferTraining: true,
  quietTraining: true,
  simpleFood: true,
  checkInFrequency: "daily",
}
let data: {
  active: typeof originalEpisode | null
  episodes: (typeof originalEpisode)[]
  checkIns: unknown[]
}
let calls: Array<{ name: string; args: Record<string, unknown> }>
let failNext = false
const navigate = mock(() => {})
mock.module("@repo/ui/mobile", () => ({ NudgeIllustration }))
mock.module("@repo/ui", () => ({ cn: (...values: string[]) => values.filter(Boolean).join(" "), toast: { success: mock(() => {}) } }))
mock.module("@/lib/use-recovery", () => ({
  useRecovery: () => data,
  useRecoveryToday: () => today,
}))
mock.module("@/lib/food-log", () => ({ currentDateKey: () => today }))
mock.module("@/lib/navigation", () => ({ useSmoothNavigate: () => navigate }))
mock.module("convex/react", () => ({
  useMutation:
    (reference: Parameters<typeof getFunctionName>[0]) =>
    async (args: Record<string, unknown>) => {
      const name = getFunctionName(reference)
      calls.push({ name, args })
      if (failNext) {
        failNext = false
        throw new Error("Connection lost. Try again.")
      }
      if (name === "recovery:update") {
        const allowed = [
          "episodeId",
          "phase",
          "deferTraining",
          "quietTraining",
          "simpleFood",
          "checkInFrequency",
        ]
        if (Object.keys(args).some((key) => !allowed.includes(key)))
          throw new Error("Unexpected database fields in update")
        data.active = { ...data.active!, ...args }
      }
      if (name === "recovery:start")
        data.active = { ...originalEpisode, ...args }
      if (name === "recovery:finish") data.active = null
    },
}))
const { RecoveryBanner } = await import("../../src/components/recovery/recovery-banner")
const { default: Recovery } = await import("../../src/pages/Recovery")
let root: ReturnType<typeof createRoot>
let container: HTMLElement
async function render() {
  await act(async () => {
    root.render(<Recovery />)
  })
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === text
  )
  expect(button).toBeDefined()
  await act(async () => {
    button!.click()
  })
  await render()
}
async function select(label: string, value: string) {
  const control = [...container.querySelectorAll("label")]
    .find((node) => node.textContent?.includes(label))
    ?.querySelector("select")
  expect(control).toBeDefined()
  await act(async () => {
    control!.value = value
    control!.dispatchEvent(new window.Event("change", { bubbles: true }))
  })
}
beforeEach(async () => {
  calls = []
  failNext = false
  navigate.mockClear()
  data = { active: { ...originalEpisode }, episodes: [], checkIns: [] }
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await render()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

test("adjustments save only editable fields and show success", async () => {
  await click("Adjust my plan")
  await select("Recovery check-ins", "off")
  await click("Save adjustments")
  expect(container.textContent).toContain(
    "Your recovery preferences are saved."
  )
  expect(calls.at(-1)?.args.checkInFrequency).toBe("off")
  expect(calls.at(-1)?.args).not.toHaveProperty("_id")
})
test("failed saves retain edits and can be retried", async () => {
  await click("Adjust my plan")
  await select("Recovery check-ins", "off")
  failNext = true
  await click("Save adjustments")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Connection lost"
  )
  expect(container.querySelector("select")?.value).toBe("off")
  await click("Save adjustments")
  expect(container.textContent).toContain(
    "Your recovery preferences are saved."
  )
})
test("resting and easing back are reversible; finishing needs its own confirmation", async () => {
  await click("Explore easing back")
  expect(calls).toHaveLength(0)
  await click("Use the easing-back plan")
  expect(data.active?.phase).toBe("easing_back")
  await click("I need to rest again")
  expect(data.active?.phase).toBe("resting")
  await click("Finish recovery mode")
  expect(data.active).not.toBeNull()
  await click("Keep my current plan")
  expect(data.active).not.toBeNull()
  await click("Finish recovery mode")
  await click("Finish and restore my usual plan")
  expect(data.active).toBeNull()
  expect(navigate).toHaveBeenCalledWith("/")
})
test("warning signs show urgent guidance instead of activating recovery", async () => {
  data.active = null
  await render()
  await select("Any trouble breathing", "yes")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Get medical help now"
  )
  expect(container.textContent).not.toContain("Review my plan")
  expect(calls).toHaveLength(0)
})
test("setup requires a preview and applies the choices shown", async () => {
  data.active = null
  await render()
  await select("Any trouble breathing", "no")
  await click("Review my plan")
  expect(calls).toHaveLength(0)
  await select("Recovery check-ins", "every_other_day")
  await click("Start recovery mode")
  expect(calls[0]?.args).toMatchObject({
    checkInFrequency: "every_other_day",
    deferTraining: true,
    simpleFood: true,
  })
  expect(container.textContent).toContain("Today, keep it simple")
})

test("an implicit form submission cannot bypass warning signs", async () => {
  data.active = null
  await render()
  await select("Any trouble breathing", "yes")
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true })
      )
  })
  expect(container.textContent).toContain("Get medical help now")
  expect(container.textContent).not.toContain("Here’s what will change")
  expect(calls).toHaveLength(0)
})

test("check-ins and finish refer to the displayed episode", async () => {
  await click("A gentle check-in")
  await select("Compared with your last check-in", "worse")
  await click("Save check-in")
  expect(calls.at(-1)?.args).toMatchObject({
    episodeId: "episode-1",
    date: today,
    trend: "worse",
  })
  await click("Finish recovery mode")
  await click("Finish and restore my usual plan")
  expect(calls.at(-1)?.args).toEqual({ episodeId: "episode-1", endedOn: today })
})


test("banner dismissal ends recovery today and hides the suggestion", async () => {
  await act(async () => root.render(<RecoveryBanner />))
  const dismiss = container.querySelector<HTMLButtonElement>('[aria-label="Dismiss recovery mode"]')
  expect(dismiss).not.toBeNull()
  await act(async () => dismiss!.click())
  expect(calls).toEqual([{ name: "recovery:finish", args: { episodeId: "episode-1", endedOn: today } }])
  await act(async () => root.render(<RecoveryBanner />))
  expect(container.querySelector('[aria-label="Recovery mode"]')).toBeNull()
})

test("failed banner dismissal leaves recovery active and allows retry", async () => {
  await act(async () => root.render(<RecoveryBanner />))
  failNext = true
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss recovery mode"]')!.click())
  expect(data.active).not.toBeNull()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Try again")
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss recovery mode"]')!.click())
  expect(data.active).toBeNull()
})
