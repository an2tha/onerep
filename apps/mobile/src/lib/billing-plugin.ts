import { Capacitor, registerPlugin } from "@capacitor/core"
import type { PluginListenerHandle } from "@capacitor/core"

/**
 * The JS face of `ios/App/App/BillingPlugin.swift`.
 *
 * Everything here returns a signed transaction or nothing. No price, no state,
 * no entitlement decision crosses this boundary in a form the app is allowed
 * to act on — the app's job is to carry Apple's signature to Convex and then
 * re-read the entitlement the server wrote. Anything else would mean a
 * subscription the phone could talk itself into.
 */

export type StoreProduct = {
  id: string
  displayName: string
  description: string
  /** Localised and currency-correct, straight from StoreKit. */
  displayPrice: string
  period?: string
}

export type SignedTransaction = {
  signedTransaction: string
  transactionId: string
  productId?: string
}

export type PurchaseOutcome =
  | ({ status: "purchased" } & SignedTransaction)
  | { status: "pending" }
  | { status: "cancelled" }
  | { status: "unknown" }

type BillingPluginApi = {
  isAvailable(): Promise<{ available: boolean; platform: string }>
  getProducts(options: {
    productIds: string[]
  }): Promise<{ products: StoreProduct[] }>
  purchase(options: {
    productId: string
    appAccountToken?: string
  }): Promise<PurchaseOutcome>
  restore(): Promise<{ transactions: SignedTransaction[] }>
  currentEntitlements(): Promise<{ transactions: SignedTransaction[] }>
  finishTransaction(options: {
    transactionId: string
  }): Promise<{ finished: boolean }>
  addListener(
    event: "transactionUpdated",
    handler: (payload: SignedTransaction) => void
  ): Promise<PluginListenerHandle>
}

const Billing = registerPlugin<BillingPluginApi>("Billing")

/**
 * Read per call, never into a module-scope constant: whichever module imports
 * this one first would otherwise freeze the answer for the whole test process.
 */
function pluginAvailable() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("Billing")
  )
}

/** Whether this build can take money at all. False on web, and on Android. */
export function storeKitSupported() {
  return pluginAvailable()
}

/**
 * Whether the device will actually let a purchase happen.
 *
 * Distinct from `storeKitSupported`: a managed device with purchases
 * restricted has the plugin and no way to use it, and the paywall should say
 * so instead of offering a button that opens a system alert.
 */
export async function storeKitAvailable() {
  if (!pluginAvailable()) return false
  try {
    const { available } = await Billing.isAvailable()
    return available
  } catch {
    return false
  }
}

export async function fetchStoreProducts(productIds: string[]) {
  if (!pluginAvailable() || productIds.length === 0) return []
  try {
    const { products } = await Billing.getProducts({ productIds })
    return products
  } catch {
    // An empty catalogue is a legitimate state — App Store Connect propagation
    // takes hours, and a build running against products that do not exist yet
    // should show "unavailable", not an error dialog.
    return []
  }
}

export async function purchaseStoreProduct(options: {
  productId: string
  appAccountToken?: string
}): Promise<PurchaseOutcome> {
  if (!pluginAvailable()) return { status: "unknown" }
  return await Billing.purchase(options)
}

/** Explicit restore. Prompts for the Apple Account password; tap-only. */
export async function restoreStorePurchases() {
  if (!pluginAvailable()) return []
  const { transactions } = await Billing.restore()
  return transactions
}

/** What this Apple Account owns, without prompting. Safe to call on launch. */
export async function currentStoreEntitlements() {
  if (!pluginAvailable()) return []
  try {
    const { transactions } = await Billing.currentEntitlements()
    return transactions
  } catch {
    return []
  }
}

export async function finishStoreTransaction(transactionId: string) {
  if (!pluginAvailable()) return false
  try {
    const { finished } = await Billing.finishTransaction({ transactionId })
    return finished
  } catch {
    return false
  }
}

/**
 * Renewals, refunds, and Ask to Buy approvals that land while the app is open.
 *
 * Returns a no-op unsubscribe off-platform so callers can wire this up in an
 * effect without branching.
 */
export function onStoreTransaction(
  handler: (payload: SignedTransaction) => void
) {
  if (!pluginAvailable()) return () => {}
  const handle = Billing.addListener("transactionUpdated", handler)
  return () => {
    void handle.then((listener) => listener.remove()).catch(() => {})
  }
}
