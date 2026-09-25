import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { getFunctionName } from "convex/server"

const testWindow = new Window({ url: "http://localhost/settings" })
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Event",
  "MouseEvent",
] as const) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? testWindow : testWindow[key],
    configurable: true,
  })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const product = {
  id: "onerep_pro_monthly",
  displayName: "OneRep Pro",
  description: "Monthly Pro",
  displayPrice: "$4.99",
  period: "month",
}
const transaction = {
  signedTransaction: "signed-by-apple",
  transactionId: "42",
}
const verifiedStatus = {
  isActive: true,
  hasActiveSubscription: true,
  source: "apple_api",
  store: "app_store",
}
let platform = "ios"
let pluginAvailable = true
let active = false
let store = "app_store"
let appleProvider = true
let outcome: Record<string, unknown>
let redemption: Record<string, unknown>
let transactions: (typeof transaction)[] = []
let updated: ((value: typeof transaction) => void) | undefined
const calls: string[] = []
const purchase = mock(async (_options: unknown) => {
  calls.push("purchase")
  return outcome
})
const finish = mock(async (_options: unknown) => {
  calls.push("finish")
  return { finished: true }
})
const restore = mock(async () => ({ transactions }))
const openBrowser = mock(async (_options: unknown) => {})
const loadProduct = mock(async (_id: string) => product)
let nativeUpgradesEnabled = true

// Preserve coverage of the dormant StoreKit flow, then separately verify the pause.
mock.module("../../src/lib/billing-policy", () => ({
  canOfferProUpgrade: (native: boolean) => !native || nativeUpgradesEnabled,
}))
const actions = {
  "billing/public:getStoreIdentity": mock(async () => {
    calls.push("identity")
    return { appAccountToken: "f44cb4f0-d3e3-450d-b99a-cc42571914d2" }
  }),
  "billing/public:redeemAppleTransaction": mock(async (_args: unknown) => {
    calls.push("redeem")
    return redemption
  }),
  "billing/public:refreshStatus": mock(async () => ({ refreshed: 1 })),
  "billing/public:createCheckout": mock(async () => {
    calls.push("stripe")
    return { url: "https://checkout.stripe.com/test" }
  }),
  "billing/public:createManagementSession": mock(async () => {
    calls.push("portal")
    return { kind: "none" }
  }),
  "billing/public:cancelSubscription": mock(async () => {
    calls.push("cancel")
    return { canceled: false }
  }),
}
mock.module("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platform !== "web",
    getPlatform: () => platform,
    isPluginAvailable: () => pluginAvailable,
  },
  registerPlugin: () => ({
    purchase,
    finishTransaction: finish,
    restore,
    currentEntitlements: async () => ({ transactions: [] }),
    addListener: async (_event: string, handler: typeof updated) => {
      updated = handler
      return { remove: async () => {} }
    },
  }),
  WebPlugin: class {},
}))
mock.module("@capacitor/browser", () => ({ Browser: { open: openBrowser } }))
mock.module("../../src/lib/billing-catalogue", () => ({
  loadStoreProduct: loadProduct,
}))
mock.module("../../src/lib/haptics", () => ({
  hapticTap: () => {},
  hapticMedium: () => {},
}))
mock.module("../../src/lib/subscription-celebration", () => ({
  celebrateSubscription: () => {},
}))
mock.module("convex/react", () => ({
  useQuery: () => ({
    status: {
      isActive: active,
      hasActiveSubscription: active,
      source: store === "stripe" ? "stripe" : "apple_api",
      store,
    },
    webProvider: "stripe",
    appleProvider,
    offering: { monthlyProductId: product.id },
    monthlyPriceLabel: "€99 / month",
  }),
  useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
    actions[getFunctionName(reference) as keyof typeof actions],
}))
const React = await import("react")
const { act } = React
const { createRoot } = await import("react-dom/client")
const { useBilling, NATIVE_SUBSCRIPTION_MESSAGE } =
  await import("../../src/lib/billing")
const { BillingSubscriptionPanel, AiAccessRequiredModal } =
  await import("../../src/components/billing/_private/payment-ui")
let billing: ReturnType<typeof useBilling>
const noop = () => {}
function Harness() {
  billing = useBilling({ userId: "test-user" })
  return (
    <>
      <BillingSubscriptionPanel billing={billing} />
      <AiAccessRequiredModal
        open
        busy={false}
        price={billing.monthlyPrice ?? "Monthly"}
        error={billing.error}
        notice={billing.purchaseNotice}
        isNative={billing.isNative}
        plansLoading={billing.catalogueLoading}
        canPurchase={billing.canPurchase}
        canRestore={billing.canRestore}
        onRetry={() => void billing.reloadProducts()}
        onClose={noop}
        onOpenPaywall={() => void billing.purchaseMonthly()}
        onOpenSettings={noop}
        onRestore={() => void billing.restorePurchases()}
      />
    </>
  )
}
let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement
async function mount() {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<Harness />))
}
beforeEach(() => {
  nativeUpgradesEnabled = true
  platform = "ios"
  pluginAvailable = true
  active = false
  store = "app_store"
  appleProvider = true
  outcome = { status: "purchased", ...transaction }
  redemption = { redeemed: true, status: verifiedStatus }
  transactions = []
  updated = undefined
  for (const fn of [
    purchase,
    finish,
    restore,
    openBrowser,
    loadProduct,
    ...Object.values(actions),
  ])
    fn.mockClear()
  loadProduct.mockImplementation(async () => product)
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  root = undefined
  calls.length = 0
})

test("iOS purchase flow remains functional when native upgrades are enabled", async () => {
  await mount()
  expect(billing.canPurchase).toBe(true)
  expect(billing.canRestore).toBe(true)
  expect(container.textContent).toContain("$4.99 / month")
  expect(container.textContent).not.toContain("€99")
  expect(container.textContent).not.toContain("Stripe")
  expect(container.textContent).not.toContain(NATIVE_SUBSCRIPTION_MESSAGE)
  expect(container.querySelector(".ai-hint-cta")?.textContent).toContain(
    "Subscribe with Apple"
  )
  expect(container.querySelector(".ai-hint-restore")?.textContent).toContain(
    "Restore purchases"
  )
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".profile-pro-primary-action")!
      .click()
  )
  expect(purchase).toHaveBeenCalledWith({
    productId: product.id,
    appAccountToken: "f44cb4f0-d3e3-450d-b99a-cc42571914d2",
  })
  expect(actions["billing/public:redeemAppleTransaction"]).toHaveBeenCalledWith(
    { signedTransaction: transaction.signedTransaction }
  )
  expect(calls).toEqual(["identity", "purchase", "redeem", "finish"])
  expect(billing.hasOneRepPro).toBe(false)
})

test("the AI paywall also starts the Apple purchase", async () => {
  await mount()
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".ai-hint-cta")!.click()
  )
  expect(calls).toEqual(["identity", "purchase", "redeem", "finish"])
})

test("cancellation is quiet and never verifies or finishes a transaction", async () => {
  outcome = { status: "cancelled" }
  await mount()
  await act(async () => {
    await expect(billing.purchaseMonthly()).rejects.toThrow("Purchase canceled")
  })
  expect(billing.error).toBeNull()
  expect(calls).toEqual(["identity", "purchase"])
})

test("pending approval stays locked until the later transaction is verified", async () => {
  outcome = { status: "pending" }
  await mount()
  await act(async () => {
    expect(await billing.purchaseMonthly()).toBeNull()
  })
  expect(billing.hasOneRepPro).toBe(false)
  expect(billing.error).toBeNull()
  expect(container.textContent).toContain("awaiting Apple approval")
  expect(calls).toEqual(["identity", "purchase"])
  await act(async () => {
    updated?.(transaction)
  })
  expect(calls).toEqual(["identity", "purchase", "redeem", "finish"])
})

for (const failure of ["rejected", "offline"]) {
  test(`verification ${failure} leaves the transaction unfinished`, async () => {
    redemption = { redeemed: false }
    if (failure === "offline")
      actions["billing/public:redeemAppleTransaction"].mockImplementationOnce(
        async () => {
          throw new Error("Network offline")
        }
      )
    await mount()
    await act(async () => {
      await expect(billing.purchaseMonthly()).rejects.toThrow()
    })
    expect(finish).not.toHaveBeenCalled()
    expect(billing.error).toBeTruthy()
    expect(billing.hasOneRepPro).toBe(false)
  })
}

test("restore redeems existing Apple purchases before finishing", async () => {
  transactions = [transaction]
  await mount()
  await act(async () => {
    expect(await billing.restorePurchases()).toEqual({
      restored: 1,
      status: verifiedStatus,
    })
  })
  expect(restore).toHaveBeenCalledTimes(1)
  expect(calls).toEqual(["redeem", "finish"])
})

test("empty restore explains that no purchases were found", async () => {
  await mount()
  await act(async () => {
    expect((await billing.restorePurchases()).restored).toBe(0)
  })
  expect(billing.error).toContain("No previous purchases")
})

test("catalogue failure offers retry without falling back to a web price", async () => {
  loadProduct.mockImplementationOnce(async () => {
    throw new Error("App Store unavailable")
  })
  await mount()
  expect(billing.canPurchase).toBe(false)
  expect(container.textContent).not.toContain("€99")
  expect(container.textContent).toContain("Retry loading plans")
  await act(async () => {
    await billing.reloadProducts()
  })
  expect(billing.canPurchase).toBe(true)
  expect(billing.error).toBeNull()
})

test("purchase stays disabled until the catalogue arrives", async () => {
  let resolveProduct!: (value: typeof product) => void
  loadProduct.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveProduct = resolve
      })
  )
  await mount()
  expect(billing.canPurchase).toBe(false)
  expect(container.textContent).toContain("Loading subscription price")
  await act(async () => {
    resolveProduct(product)
  })
  expect(billing.canPurchase).toBe(true)
})

test("missing Apple server configuration cannot start a purchase", async () => {
  appleProvider = false
  await mount()
  expect(billing.canPurchase).toBe(false)
  expect(billing.error).toContain("unavailable")
  await expect(billing.purchaseMonthly()).rejects.toThrow("not ready")
  expect(purchase).not.toHaveBeenCalled()
})

test("missing native plugin cannot fall back to Stripe", async () => {
  pluginAvailable = false
  await mount()
  expect(billing.canPurchase).toBe(false)
  await expect(billing.purchaseMonthly()).rejects.toThrow(
    NATIVE_SUBSCRIPTION_MESSAGE
  )
  expect(calls).toEqual([])
})

test("duplicate taps open only one Apple payment sheet", async () => {
  await mount()
  await act(async () => {
    await Promise.all([billing.purchaseMonthly(), billing.purchaseMonthly()])
  })
  expect(purchase).toHaveBeenCalledTimes(1)
})

test("App Store subscribers manage subscriptions with Apple", async () => {
  active = true
  await mount()
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".profile-pro-primary-action")!
      .click()
  )
  expect(openBrowser).toHaveBeenCalledWith({
    url: "https://apps.apple.com/account/subscriptions",
  })
  expect(calls).toEqual([])
})

test("web subscribers retain Pro on iOS without opening Stripe", async () => {
  active = true
  store = "stripe"
  await mount()
  expect(billing.hasOneRepPro).toBe(true)
  expect(
    container.querySelector<HTMLButtonElement>(".profile-pro-primary-action")!
      .disabled
  ).toBe(true)
  await expect(billing.openBillingManagement()).rejects.toThrow(
    NATIVE_SUBSCRIPTION_MESSAGE
  )
  expect(calls).toEqual([])
})

for (const subscribed of [false, true]) {
  test(`Android ${subscribed ? "Pro" : "free"} keeps native purchases disabled`, async () => {
    platform = "android"
    active = subscribed
    await mount()
    expect(
      container.textContent?.split(NATIVE_SUBSCRIPTION_MESSAGE)
    ).toHaveLength(2)
    expect(container.textContent).toContain(
      "Subscription management isn’t available in this app."
    )
    expect(billing.canPurchase).toBe(false)
    expect(billing.canRestore).toBe(false)
    await expect(billing.purchaseMonthly()).rejects.toThrow(
      NATIVE_SUBSCRIPTION_MESSAGE
    )
    expect(calls).toEqual([])
  })
}

test("web keeps subscription checkout available", async () => {
  platform = "web"
  await mount()
  expect(container.querySelector(".ai-hint-cta")?.textContent).toContain(
    "Continue"
  )
  expect(billing.canPurchase).toBe(true)
  await act(async () => {
    await billing.purchaseMonthly()
  })
  expect(calls).toEqual(["stripe"])
  expect(purchase).not.toHaveBeenCalled()
})

for (const nativePlatform of ["ios", "android"]) {
  test(`${nativePlatform} pause removes offers and catalogue loading without granting Pro`, async () => {
    nativeUpgradesEnabled = false
    platform = nativePlatform
    await mount()
    expect(billing.canUpgrade).toBe(false)
    expect(billing.canPurchase).toBe(false)
    expect(billing.hasOneRepPro).toBe(false)
    expect(loadProduct).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(
      /Upgrade|Subscribe with Apple|OneRep Pro raises|4\.99|Retry loading plans/
    )
    expect(container.textContent).toContain("Monthly AI allowance")
    await expect(billing.purchaseMonthly()).rejects.toThrow(
      "Upgrade unavailable"
    )
    expect(purchase).not.toHaveBeenCalled()
    expect(openBrowser).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
}

test("paused iOS upgrades retain restore for existing purchases", async () => {
  nativeUpgradesEnabled = false
  transactions = [transaction]
  await mount()
  const restoreButton = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent?.includes("Restore purchases"))!
  expect(restoreButton).toBeDefined()
  await act(async () => restoreButton.click())
  expect(calls).toEqual(["redeem", "finish"])
  expect(restore).toHaveBeenCalledTimes(1)
  expect(loadProduct).not.toHaveBeenCalled()
})

test("paused upgrades retain App Store management for subscribers", async () => {
  nativeUpgradesEnabled = false
  active = true
  await mount()
  expect(billing.hasOneRepPro).toBe(true)
  expect(container.textContent).toContain("Manage in the App Store")
  expect(container.textContent).not.toContain("Upgrade to Pro")
  await act(async () => billing.openBillingManagement())
  expect(openBrowser).toHaveBeenCalledWith({
    url: "https://apps.apple.com/account/subscriptions",
  })
  expect(purchase).not.toHaveBeenCalled()
})
