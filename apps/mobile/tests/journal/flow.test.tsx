import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { getFunctionName } from "convex/server"
const window = new Window({ url: "http://localhost/journal" })
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
let calls: { name: string; args: Record<string, unknown> }[] = []
let failNext = false
mock.module("convex/react", () => ({
  useMutation:
    (reference: Parameters<typeof getFunctionName>[0]) =>
    async (args: Record<string, unknown>) => {
      calls.push({ name: getFunctionName(reference), args })
      if (failNext) {
        failNext = false
        throw new Error("Connection lost. Try again.")
      }
      return "metric-1"
    },
}))
mock.module("@/components/mobile-sheet", () => ({
  MobileSheet: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}))
const { TrackerStudio } = await import("../../src/pages/journal/tracker-studio")
const metric = {
  _id: "metric-1",
  title: "Mobility",
  description: "Move every day",
  kind: "counter",
  tab: "training",
  unit: "min",
  step: 5,
  target: 20,
  accent: "workout",
  entries: [],
} as const
let root: ReturnType<typeof createRoot>
let container: HTMLElement
const choose = mock(() => {})
const close = mock(() => {})
async function render(editing = false) {
  await act(async () =>
    root.render(
      <TrackerStudio
        metrics={[]}
        editing={editing ? (metric as never) : undefined}
        onClose={close}
        onChoose={choose}
      />
    )
  )
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}
async function input(label: string, value: string) {
  const element = [...container.querySelectorAll("label")]
    .find((element) => element.textContent?.includes(label))
    ?.querySelector("input")
  expect(element).toBeDefined()
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!.call(element, value)
    element!.dispatchEvent(new window.Event("input", { bubbles: true }))
  })
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true })
      )
  })
}
beforeEach(() => {
  calls = []
  failNext = false
  choose.mockClear()
  close.mockClear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
test("preset creates a real metric without sending its icon to Convex", async () => {
  await render()
  await click("Mobility")
  expect(calls[0]).toMatchObject({
    name: "customProgressMetrics:saveDefinition",
    args: { title: "Mobility", kind: "counter", step: 5, unit: "min" },
  })
  expect(calls[0].args).not.toHaveProperty("icon")
  expect(choose).toHaveBeenCalledTimes(1)
})
test("custom tracker creation retains values after failure and retries", async () => {
  await render()
  await click("Create a custom tracker")
  await input("Name", "Climbing time")
  await input("Unit", "min")
  failNext = true
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Connection lost"
  )
  expect(container.querySelector("input")?.value).toBe("Climbing time")
  expect(choose).not.toHaveBeenCalled()
  await submit()
  expect(calls.at(-1)?.args).toMatchObject({
    title: "Climbing time",
    unit: "min",
  })
  expect(choose).toHaveBeenCalledTimes(1)
})
test("clearing a target edits the tracker without deleting its history", async () => {
  await render(true)
  await input("Daily target", "")
  await submit()
  expect(calls[0]).toMatchObject({
    name: "customProgressMetrics:updateDefinition",
    args: { metricId: "metric-1", target: null },
  })
  expect(calls).toHaveLength(1)
})
test("removing a tracker requires a separate explicit confirmation", async () => {
  await render(true)
  await click("Remove tracker…")
  expect(calls).toHaveLength(0)
  await click("Keep tracker")
  expect(calls).toHaveLength(0)
  await click("Remove tracker…")
  await click("Remove tracker and history")
  expect(calls[0]).toMatchObject({
    name: "customProgressMetrics:remove",
    args: { metricId: "metric-1" },
  })
  expect(close).toHaveBeenCalledTimes(1)
})
