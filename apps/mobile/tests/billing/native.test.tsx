import { afterEach, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { getFunctionName } from "convex/server"

const testWindow = new Window({ url: "http://localhost/settings" })
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"] as const) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? testWindow : testWindow[key], configurable: true })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let platform = "ios"
let active = false
const calls: string[] = []
mock.module("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform !== "web",
    getPlatform: () => platform,
    isPluginAvailable: () => false,
  },
  registerPlugin: () => ({}),
  WebPlugin: class {},
}))
mock.module("convex/react", () => ({
  useQuery: () => ({ status: { isActive: active, hasActiveSubscription: active, source: "stripe", store: "stripe" }, webProvider: "stripe" }),
  useAction: (reference: Parameters<typeof getFunctionName>[0]) => async () => { calls.push(getFunctionName(reference)); return {} },
}))
const React = await import("react")
const { act } = React
const { createRoot } = await import("react-dom/client")
const { useBilling, NATIVE_SUBSCRIPTION_MESSAGE } = await import("../../src/lib/billing")
const { BillingSubscriptionPanel, AiAccessRequiredModal } = await import("../../src/components/billing/_private/payment-ui")
let billing: ReturnType<typeof useBilling>
const noop = () => {}
function Harness() {
  billing = useBilling({ userId: "test-user" })
  return <>
    <BillingSubscriptionPanel billing={billing} />
    <AiAccessRequiredModal open busy={false} price="$5 / month" isNative={billing.isNative}
      canPurchase={billing.canPurchase} canRestore={billing.canRestore}
      onClose={noop} onOpenPaywall={noop} onOpenSettings={noop} onRestore={noop} />
  </>
}
let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  calls.length = 0
})
for (const device of ["ios", "android"]) {
  for (const subscribed of [false, true]) {
    test(`${device} ${subscribed ? "Pro" : "free"} shows status without purchase or management controls`, async () => {
      platform = device
      active = subscribed
      container = document.createElement("div")
      document.body.append(container)
      root = createRoot(container)
      await act(async () => root!.render(<Harness />))
      expect(container.textContent?.split(NATIVE_SUBSCRIPTION_MESSAGE)).toHaveLength(3)
      expect(container.querySelector(".profile-pro-status")?.textContent).toBe(subscribed ? "Active" : "Free")
      const buttons = [...container.querySelectorAll("button")].map((button) => button.textContent)
      expect(buttons.some((text) => /Upgrade|Continue|Manage|Restore|Retry/.test(text ?? ""))).toBe(false)
      expect(container.querySelector(".ai-hint-price")).toBeNull()
      expect(billing.canPurchase).toBe(false)
      expect(billing.canRestore).toBe(false)
      await expect(billing.purchaseMonthly()).rejects.toThrow(NATIVE_SUBSCRIPTION_MESSAGE)
      await expect(billing.openBillingManagement()).rejects.toThrow(NATIVE_SUBSCRIPTION_MESSAGE)
      await expect(billing.cancelSubscription()).rejects.toThrow(NATIVE_SUBSCRIPTION_MESSAGE)
      expect(calls).toEqual([])
    })
  }
}

test("web keeps subscription checkout available", async () => {
  platform = "web"
  active = false
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<Harness />))
  expect(container.textContent).not.toContain(NATIVE_SUBSCRIPTION_MESSAGE)
  expect(container.querySelector(".ai-hint-cta")?.textContent).toContain("Continue")
  expect(container.querySelector(".profile-pro-primary-action")?.textContent).toContain("Upgrade to Pro")
  expect(billing.canPurchase).toBe(true)
})
