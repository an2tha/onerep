import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { act, type ReactNode } from "react"
import { getFunctionName } from "convex/server"

const globalKeys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "localStorage",
  "IS_REACT_ACT_ENVIRONMENT",
] as const
const originalGlobals = new Map(
  globalKeys.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ])
)
const browser = new Window({ url: "http://localhost" })
for (const key of [
  "document",
  "navigator",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "localStorage",
] as const)
  Object.defineProperty(globalThis, key, {
    value: browser[key],
    configurable: true,
  })
Object.defineProperty(globalThis, "window", {
  value: browser,
  configurable: true,
})
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const originalUi = { ...(await import("@repo/ui")) }
const originalConvex = { ...(await import("convex/react")) }
const originalEvents = { ...(await import("@/lib/full-screen-events")) }
let account = "alice"
let allowed = true
let preferences: { relaxedWorkoutLoggingIntroducedAt?: number } | undefined = {}
const acknowledge = mock(async () => {
  preferences = { relaxedWorkoutLoggingIntroducedAt: 100 }
})
const enable = mock(async () => {})
const close = mock(() => {})
mock.module("convex/react", () => ({
  ...originalConvex,
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: (fn: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(fn).endsWith("getCurrentUser")
      ? { _id: account }
      : preferences,
  useMutation: (fn: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(fn).endsWith("acknowledgeRelaxedWorkoutLogging")
      ? acknowledge
      : enable,
}))
mock.module("@/lib/full-screen-events", () => ({
  ...originalEvents,
  useFullScreenEvent: ({ key }: { key: string | null }) => ({
    active: allowed && key !== null,
    close,
  }),
  useSuppressFullScreenEvents: () => {},
}))
mock.module("@repo/ui", () => ({
  ...originalUi,
  MobileSheet: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}))
const { RelaxedWorkoutIntro } = await import("./relaxed-workout-intro")
const { createRoot } = await import("react-dom/client")
afterAll(() => {
  mock.module("@repo/ui", () => originalUi)
  mock.module("convex/react", () => originalConvex)
  mock.module("@/lib/full-screen-events", () => originalEvents)
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})
beforeEach(() => {
  preferences = {}
  account = "alice"
  allowed = true
  browser.localStorage.clear()
  acknowledge.mockClear()
  enable.mockClear()
  close.mockClear()
})
function mount() {
  const container = document.createElement("div")
  document.body.append(container)
  return { container, root: createRoot(container) }
}
test("waits for first visible introduction, keeps it open, and never repeats after relaunch", async () => {
  const { root, container } = mount()
  allowed = false
  await act(async () => root.render(<RelaxedWorkoutIntro />))
  expect(container.querySelector('[role="dialog"]')).toBeNull()
  expect(acknowledge).not.toHaveBeenCalled()
  allowed = true
  await act(async () => root.render(<RelaxedWorkoutIntro />))
  expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  expect(acknowledge).toHaveBeenCalledTimes(1)
  await act(async () => root.render(<RelaxedWorkoutIntro />))
  expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  const dismiss = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Keep current logging"
  )!
  await act(async () => dismiss.click())
  expect(enable).not.toHaveBeenCalled()
  await act(async () => root.unmount())
  // No browser storage on a second device: the account acknowledgment wins.
  browser.localStorage.clear()
  const next = mount()
  await act(async () => next.root.render(<RelaxedWorkoutIntro />))
  expect(next.container.querySelector('[role="dialog"]')).toBeNull()
  expect(acknowledge).toHaveBeenCalledTimes(1)
  await act(async () => next.root.unmount())
})
test("an account that has not seen the feature gets its own introduction", async () => {
  browser.localStorage.setItem(
    "onerep:relaxed-workout-introduced:alice",
    "seen"
  )
  account = "bob"
  const { root, container } = mount()
  await act(async () => root.render(<RelaxedWorkoutIntro />))
  expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  expect(acknowledge).toHaveBeenCalledTimes(1)
  await act(async () => root.unmount())
})
