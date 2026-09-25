import { readLocalizedSource as readFileSync } from "../../../tests/helpers/localized-source"
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

/**
 * The plugin wrapper's job is to be inert off-platform and honest on it.
 *
 * Worth testing because every one of these functions is called from a React
 * effect that runs on web too — the settings screen, the paywall, the sign-in
 * catch-up — and a wrapper that threw or resolved to `undefined` on web would
 * take those screens down for everyone who is not on an iPhone.
 */

const platform = { name: "web", native: false, plugins: true }

const purchaseMock = mock(async () => ({ status: "purchased" }) as const)
const productsMock = mock(async () => ({ products: [] }))
const restoreMock = mock(async () => ({ transactions: [] }))
const entitlementsMock = mock(async () => ({ transactions: [] }))
const finishMock = mock(async () => ({ finished: true }))
const availableMock = mock(async () => ({ available: true, platform: "ios" }))
const addListenerMock = mock(async () => ({ remove: async () => {} }))

describe("native bridge", () => {
  test("registers the local StoreKit plugin", () => {
    const bridge = readFileSync(
      new URL(
        "../../../ios/App/App/BridgeViewController.swift",
        import.meta.url
      ),
      "utf8"
    )
    expect(bridge).toContain("registerPluginInstance(BillingPlugin())")
  })
})

/**
 * `mock.module` is process-wide and the whole mobile suite shares one process,
 * so this mock has to behave like the real module for every other file that
 * has already imported it — hence the name check rather than handing the
 * Billing API to whoever asks, and the `afterAll` that puts the platform back
 * to web. Getting this wrong takes down unrelated tests two directories away.
 */
mock.module("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => platform.name,
    isNativePlatform: () => platform.native,
    isPluginAvailable: () => platform.plugins,
  },
  registerPlugin: (name: string) =>
    name === "Billing"
      ? {
          isAvailable: availableMock,
          getProducts: productsMock,
          purchase: purchaseMock,
          restore: restoreMock,
          currentEntitlements: entitlementsMock,
          finishTransaction: finishMock,
          addListener: addListenerMock,
        }
      : {},
  WebPlugin: class {},
}))

const {
  currentStoreEntitlements,
  fetchStoreProducts,
  finishStoreTransaction,
  onStoreTransaction,
  purchaseStoreProduct,
  restoreStorePurchases,
  storeKitAvailable,
  storeKitSupported,
} = await import("../billing-plugin")

const { loadStoreProduct } = await import("../billing-catalogue")

function onIos() {
  platform.name = "ios"
  platform.native = true
  platform.plugins = true
}

function onWeb() {
  platform.name = "web"
  platform.native = false
  platform.plugins = true
}

function onAndroid() {
  platform.name = "android"
  platform.native = true
  platform.plugins = true
}

afterAll(onWeb)

describe("platform gate", () => {
  beforeEach(() => {
    purchaseMock.mockClear()
    productsMock.mockClear()
    restoreMock.mockClear()
  })

  test("StoreKit is iOS only", () => {
    onIos()
    expect(storeKitSupported()).toBe(true)
    onWeb()
    expect(storeKitSupported()).toBe(false)
    // Play billing is gone; an Android build must not reach for a plugin it
    // does not carry.
    onAndroid()
    expect(storeKitSupported()).toBe(false)
  })

  test("a missing plugin is the same as no support", () => {
    onIos()
    platform.plugins = false
    expect(storeKitSupported()).toBe(false)
    // An older shell running a newer web bundle over the air is exactly this
    // case, and it must degrade rather than throw.
    expect(storeKitAvailable()).resolves.toBe(false)
  })

  test("every call is a no-op off-platform", async () => {
    onWeb()

    expect(await storeKitAvailable()).toBe(false)
    expect(await fetchStoreProducts(["onerep_pro_monthly"])).toEqual([])
    expect(await restoreStorePurchases()).toEqual([])
    expect(await currentStoreEntitlements()).toEqual([])
    expect(await finishStoreTransaction("1")).toBe(false)
    expect(await purchaseStoreProduct({ productId: "x" })).toEqual({
      status: "unknown",
    })

    expect(purchaseMock).not.toHaveBeenCalled()
    expect(productsMock).not.toHaveBeenCalled()
    expect(restoreMock).not.toHaveBeenCalled()
  })

  test("the transaction listener unsubscribes cleanly off-platform", () => {
    onWeb()
    const unsubscribe = onStoreTransaction(() => {})
    expect(() => unsubscribe()).not.toThrow()
  })
})

describe("on iOS", () => {
  beforeEach(() => {
    onIos()
    purchaseMock.mockClear()
    productsMock.mockClear()
  })

  test("preserves catalogue errors for recovery", async () => {
    productsMock.mockImplementationOnce(async () => {
      throw new Error("store offline")
    })
    await expect(fetchStoreProducts(["onerep_pro_monthly"])).rejects.toThrow(
      "store offline"
    )
  })

  test("retries an empty catalogue and a transient error before recovering", async () => {
    const product = {
      id: "onerep_pro_monthly",
      displayName: "Pro",
      description: "Pro",
      displayPrice: "€4.99",
    }
    productsMock.mockImplementationOnce(async () => ({ products: [] }))
    productsMock.mockImplementationOnce(async () => {
      throw new Error("offline")
    })
    productsMock.mockImplementationOnce(async () => ({ products: [product] }))
    expect(await loadStoreProduct(product.id, { retryDelayMs: 0 })).toEqual(
      product
    )
    expect(productsMock).toHaveBeenCalledTimes(3)
  })

  test("stops after three empty responses and allows a later retry", async () => {
    await expect(
      loadStoreProduct("onerep_pro_monthly", { retryDelayMs: 0 })
    ).rejects.toThrow("couldn’t load")
    expect(productsMock).toHaveBeenCalledTimes(3)
    const product = {
      id: "onerep_pro_monthly",
      displayName: "Pro",
      description: "Pro",
      displayPrice: "$4.99",
    }
    productsMock.mockImplementationOnce(async () => ({ products: [product] }))
    expect(await loadStoreProduct(product.id, { retryDelayMs: 0 })).toEqual(
      product
    )
  })

  test("a hung StoreKit request times out and recovers", async () => {
    productsMock.mockImplementationOnce(() => new Promise(() => {}))
    const product = {
      id: "onerep_pro_monthly",
      displayName: "Pro",
      description: "Pro",
      displayPrice: "$4.99",
    }
    productsMock.mockImplementationOnce(async () => ({ products: [product] }))
    expect(
      await loadStoreProduct(product.id, { retryDelayMs: 0, timeoutMs: 5 })
    ).toEqual(product)
    expect(productsMock).toHaveBeenCalledTimes(2)
  })

  test("does not accept a different product", async () => {
    for (let i = 0; i < 3; i += 1)
      productsMock.mockImplementationOnce(async () => ({
        products: [{ id: "wrong" }],
      }))
    await expect(
      loadStoreProduct("onerep_pro_monthly", { retryDelayMs: 0 })
    ).rejects.toThrow("couldn’t load")
  })

  test("asking for nothing does not call the store", async () => {
    expect(await fetchStoreProducts([])).toEqual([])
    expect(productsMock).not.toHaveBeenCalled()
  })

  test("the account token is passed through to the purchase", async () => {
    await purchaseStoreProduct({
      productId: "onerep_pro_monthly",
      appAccountToken: "0f1b3c1e-0000-4000-8000-000000000001",
    })
    expect(purchaseMock).toHaveBeenCalledWith({
      productId: "onerep_pro_monthly",
      appAccountToken: "0f1b3c1e-0000-4000-8000-000000000001",
    })
  })

  test("restore failures surface, because a tap is waiting on them", async () => {
    restoreMock.mockImplementationOnce(async () => {
      throw new Error("network")
    })
    // Unlike the catch-up read, this one was asked for. Swallowing it would
    // leave the button spinning and the user none the wiser.
    await expect(restoreStorePurchases()).rejects.toThrow("network")
  })
})
