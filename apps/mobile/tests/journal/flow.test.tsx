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
  "HTMLTextAreaElement",
  "Event",
  "MouseEvent",
  "MutationObserver",
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

const { TrackerHistory, summarizeReadings } =
  await import("../../src/pages/journal/tracker-history")
test("history summaries count zero, exclude missing days and respect the calendar window", () => {
  const readings = {
    ...metric,
    entries: [
      { date: "2026-09-24", value: 0 },
      { date: "2026-09-22", value: 10 },
      { date: "2026-09-01", value: 20 },
      { date: "2026-09-25", value: 999 },
    ],
  } as never
  expect(summarizeReadings(readings, "2026-09-24", 7)).toMatchObject({
    count: 2,
    value: 10,
  })
  expect(
    summarizeReadings(
      {
        ...metric,
        kind: "number",
        entries: [
          { date: "2026-09-24", value: 0 },
          { date: "2026-09-22", value: 10 },
        ],
      } as never,
      "2026-09-24",
      7
    )
  ).toMatchObject({ count: 2, value: 5 })
  expect(summarizeReadings(readings, "2026-09-24", 28)).toMatchObject({
    count: 3,
    value: 30,
  })
  expect(summarizeReadings(readings, "2026-08-01", 7)).toMatchObject({
    count: 0,
    value: undefined,
  })
})
test("history switches periods and opens the exact missing day for backfilling", async () => {
  const edit = mock(() => {})
  await act(async () =>
    root.render(
      <TrackerHistory
        metric={{ ...metric, entries: [] } as never}
        date="2026-09-24"
        onClose={close}
        onEdit={edit}
      />
    )
  )
  expect(
    container.querySelectorAll(".journal-history-rows button")
  ).toHaveLength(7)
  await click("Last 28 days")
  expect(
    container.querySelectorAll(".journal-history-rows button")
  ).toHaveLength(28)
  const oldest = container.querySelector<HTMLButtonElement>(
    '[aria-label="Edit Mobility on 2026-08-28"]'
  )!
  await act(async () => oldest.click())
  expect(edit).toHaveBeenCalledWith("2026-08-28")
  expect(calls).toHaveLength(0)
})

const { PageBarActions } = await import("../../src/components/page-bar-actions")
test("page actions stay in the top bar before and after scrolling, without duplicates", async () => {
  const bar = document.createElement("header")
  bar.className = "collapsing-page-bar"
  bar.dataset.collapsed = "false"
  bar.innerHTML = '<div class="page-bar-actions"></div>'
  document.body.append(bar)
  const clicked = mock(() => {})
  try {
    await act(async () =>
      root.render(
        <PageBarActions>
          <button onClick={clicked}>Add reading</button>
        </PageBarActions>
      )
    )
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(bar.querySelectorAll("button")).toHaveLength(1)
    await act(async () => {
      bar.dataset.collapsed = "true"
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(bar.querySelectorAll("button")).toHaveLength(1)
    await act(async () => bar.querySelector("button")!.click())
    expect(clicked).toHaveBeenCalledTimes(1)
    await act(async () => {
      bar.dataset.collapsed = "false"
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(bar.querySelectorAll("button")).toHaveLength(1)
    expect(container.querySelectorAll("button")).toHaveLength(0)
  } finally {
    await act(async () => root.render(null))
    bar.remove()
  }
})

const { captureRouteSnapshot, restoreSnapshotScroll } =
  await import("../../src/lib/route-snapshot")
test("outgoing snapshots preserve edited controls and nested scroll instead of remounting a page", () => {
  const frame = document.createElement("div")
  frame.dataset.pageBar = "true"
  frame.innerHTML =
    '<input value="original"><textarea>original</textarea><select><option>A</option><option>B</option></select><div class="scroller">Content</div>'
  frame.querySelector("input")!.value = "edited reading"
  frame.querySelector("textarea")!.value = "Unsubmitted note"
  frame.querySelector("select")!.selectedIndex = 1
  frame.querySelector<HTMLElement>(".scroller")!.scrollTop = 140
  const snapshot = captureRouteSnapshot(frame)
  const copy = document.createElement("div")
  copy.innerHTML = snapshot.html
  restoreSnapshotScroll(copy, snapshot.scroll)
  expect(snapshot.pageBar).toBe("true")
  expect(copy.querySelector("input")!.value).toBe("edited reading")
  expect(copy.querySelector("textarea")!.value).toBe("Unsubmitted note")
  expect(copy.querySelector("select")!.value).toBe("B")
  expect(copy.querySelector<HTMLElement>(".scroller")!.scrollTop).toBe(140)
})
