import { expect, mock, test } from "bun:test"
import { getFunctionName } from "convex/server"
import { Window } from "happy-dom"

let preferences: { aiSharingConsent?: { granted: boolean; version: number } } | null | undefined
let hasPro = true
let remaining = 10
const notices: string[] = []
mock.module("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === "users/users:getPreferences" ? preferences : {
      count: 10 - remaining, remaining, limit: 10, isPro: false, byok: false, unlimited: false,
    },
}))
mock.module("@/lib/auth-client", () => ({ useAppAuth: () => ({ user: {}, userId: "test" }) }))
mock.module("@/lib/billing", () => ({
  useBilling: () => ({ hasOneRepPro: hasPro, status: "ready" }),
  hasOneRepPro: () => hasPro,
}))
mock.module("@/lib/navigation", () => ({ useSmoothNavigate: () => () => {} }))
mock.module("@/lib/analytics", () => ({ trackUmami: () => {} }))
mock.module("@/lib/subscription-celebration", () => ({ celebrateSubscription: () => {} }))
mock.module("@repo/ui", () => ({ toast: { message: (message: string) => notices.push(message) } }))
mock.module("@/components/ai-sharing-consent", () => ({
  AiSharingConsentSheet: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Keep AI off</button>,
}))
mock.module("@/components/billing", () => ({
  AiAccessRequiredModal: ({ open }: { open: boolean }) => open ? <p>Monthly allowance reached</p> : null,
}))
const { useAiFeatureGate } = await import("../../src/lib/ai-access")

test("the gate waits for saved choices, honors opt-out for Pro, defaults on, and keeps quota checks", async () => {
  const window = new Window({ url: "http://localhost" })
  for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"] as const) {
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true })
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const { act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  let requests = 0
  function Harness() {
    const gate = useAiFeatureGate("typesafe")
    return <><button onClick={() => { if (gate.requireAiAccess()) requests++ }}>Use AI</button>{gate.aiAccessModal}</>
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const render = () => act(async () => root.render(<Harness />))
  const run = () => act(async () => container.querySelector("button")!.click())
  try {
    await render()
    await run()
    expect(requests).toBe(0)
    expect(notices).toContain("Checking your access…")
    expect(container.textContent).not.toContain("Keep AI off")

    preferences = null
    await render()
    await run()
    expect(requests).toBe(1)
    expect(container.textContent).not.toContain("Keep AI off")

    preferences = { aiSharingConsent: { granted: false, version: 2 } }
    await render()
    await run()
    expect(requests).toBe(1)
    expect(container.textContent).toContain("Keep AI off")
    await act(async () => container.querySelectorAll("button")[1]!.click())
    expect(container.textContent).not.toContain("Keep AI off")

    preferences = { aiSharingConsent: { granted: true, version: 2 } }
    await render()
    await run()
    expect(requests).toBe(2)

    hasPro = false
    remaining = 0
    await render()
    await run()
    expect(requests).toBe(2)
    expect(container.textContent).toContain("Monthly allowance reached")
  } finally {
    await act(async () => root.unmount())
    window.happyDOM.abort()
  }
})
