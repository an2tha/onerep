import { registerPlugin } from "@capacitor/core"

/**
 * Bridge to the app-local StoreKit 2 / Play Billing plugin.
 *
 * The plugin deliberately exposes only the store primitives. It never reports
 * entitlement: `receipt` (an Apple JWS or a Play purchase token) is the single
 * field the server trusts, and everything else here is for display, logging, or
 * finishing the transaction once the server has accepted it.
 */

export type BillingProduct = {
  id: string
  title: string
  description: string
  displayPrice: string
  priceMicros: number
  currency: string
  /** Android only: the subscription offer the purchase will use. */
  offerToken?: string
}

export type BillingPurchase = {
  /** Apple: the numeric transaction id. Android: the purchase token. */
  transactionId: string
  /** Apple only; Android identity is the purchase token itself. */
  originalTransactionId?: string
  productId?: string
  /** Apple: signed JWS. Android: purchase token. The only trusted field. */
  receipt: string
  expiresAt?: number
  acknowledged?: boolean
  orderId?: string
}

export type BillingPurchaseResult = {
  status: "purchased" | "cancelled" | "pending" | "unknown"
  purchase?: BillingPurchase
}

export type BillingPluginApi = {
  getProducts(options: {
    productIds: string[]
  }): Promise<{ products: BillingProduct[] }>
  purchase(options: {
    productId: string
    appAccountToken?: string
  }): Promise<BillingPurchaseResult>
  getPurchases(): Promise<{ purchases: BillingPurchase[] }>
  finishTransaction(options: {
    transactionId: string
  }): Promise<{ finished: boolean }>
  openManagementUrl(options: {
    productId?: string
  }): Promise<{ opened: boolean }>
  addListener(
    eventName: "purchasesUpdated",
    listener: (event: { purchases: BillingPurchase[] }) => void
  ): Promise<{ remove: () => Promise<void> }>
}

export const BillingPlugin = registerPlugin<BillingPluginApi>("Billing")
