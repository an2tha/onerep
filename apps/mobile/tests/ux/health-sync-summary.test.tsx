import { Window } from "happy-dom"
import { expect, test } from "bun:test"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { HealthSyncSummary } from "../../src/components/health-sync-summary"
import type { HealthSyncStatus } from "../../src/lib/health-sync-status"

const window = new Window({ url: "http://localhost" })
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "CustomEvent",
] as const)
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import("react-dom/client")

const idle: HealthSyncStatus = {
  running: false,
  phase: null,
  startedAt: null,
  lastDurationMs: null,
  lastError: null,
  recent: [],
}

type Props = Parameters<typeof HealthSyncSummary>[0]

function render(overrides: Partial<Props> = {}) {
  return renderToStaticMarkup(
    <HealthSyncSummary
      providerLabel="Health Connect"
      providerAvailable
      consentMissing={false}
      enabled
      lastSyncedAt={null}
      status={idle}
      onAction={() => {}}
      {...overrides}
    />
  )
}

const actionCount = (html: string) => html.match(/<button/g)?.length ?? 0

/**
 * The card this replaces was five places at once — a label, a floating progress
 * bar, an always-present repair card, a raw error paragraph and a journal — so
 * "how is sync doing?" had no single answer. These pin the answer down: a state
 * in a word, and exactly one thing to do about it.
 */
test("each state offers exactly one action, and only one", () => {
  const off = render({ enabled: false })
  expect(off).toContain("Off")
  expect(actionCount(off)).toBe(1)
  expect(off).toContain("Turn on")

  const connected = render({
    lastSyncedAt: Date.now() - 2 * 60 * 60 * 1000,
    status: {
      ...idle,
      recent: [{ at: Date.now(), label: "Imported 3 workouts" }],
    },
  })
  expect(connected).toContain("Connected")
  expect(connected).toContain("2 h ago")
  expect(connected).toContain("Imported 3 workouts")
  expect(actionCount(connected)).toBe(1)
  expect(connected).toContain("Sync now")

  const ready = render({ lastSyncedAt: null })
  expect(ready).toContain("Ready")
  expect(actionCount(ready)).toBe(1)
})

test("a device without a health store gets no action to press", () => {
  const html = render({ providerAvailable: false })
  expect(html).toContain("Unavailable")
  // The install row beneath the card is the fix; a button here would do nothing.
  expect(actionCount(html)).toBe(0)
})

test("a refusal asks for a grant rather than a retry", () => {
  const html = render({
    needsPermission: true,
    error: "Permission was denied. You can grant it in the Health Connect app.",
  })
  expect(html).toContain("Needs permission")
  expect(html).toContain("Grant access")
  expect(html).not.toContain("Try again")
  // The refusal is not reported twice: the state already says it.
  expect(actionCount(html)).toBe(1)
})

test("a failure carries its message, its icon and the retry", () => {
  const html = render({ error: "Couldn't reach OneRep's server." })
  expect(html).toContain("Needs attention")
  expect(html).toContain("Try again")
  expect(html).toContain("Couldn&#x27;t reach OneRep&#x27;s server.")
  expect(html).toContain("text-destructive")
})

test("progress is inside the card and the action is disabled while it runs", () => {
  const running = render({
    status: { ...idle, running: true, phase: "Reading workouts from Health Connect…" },
  })
  expect(running).toContain("Syncing…")
  expect(running).toContain("Reading workouts from Health Connect…")
  expect(running).toContain("animate-pulse")
  expect(running).toContain("disabled")
})

test("the action reaches the handler with the state's own action", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const actions: string[] = []
  await act(async () => {
    root.render(
      <HealthSyncSummary
        providerLabel="Health Connect"
        providerAvailable
        consentMissing={false}
        enabled
        lastSyncedAt={null}
        status={idle}
        onAction={(action) => actions.push(action)}
      />
    )
  })
  const button = container.querySelector("button")
  expect(button?.textContent).toContain("Sync now")
  await act(async () => {
    button!.click()
  })
  expect(actions).toEqual(["sync"])

  await act(async () => {
    root.unmount()
  })
})
