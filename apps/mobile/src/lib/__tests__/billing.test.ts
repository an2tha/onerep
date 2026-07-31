import { describe, expect, test } from "bun:test"
import {
  billingErrorMessage,
  hasActiveSubscription,
  hasHydratedWebSubscription,
  hasOneRepPro,
  subscriptionDiagnosticCopy,
  type BillingSubscriptionStatus,
} from "@/lib/billing"

function status(
  overrides: Partial<BillingSubscriptionStatus>
): BillingSubscriptionStatus {
  return {
    activeSubscriptions: [],
    autoRenew: null,
    expiresAt: null,
    fetchedAt: 0,
    hasActiveSubscription: false,
    isActive: false,
    managementUrl: null,
    productIdentifier: null,
    source: "apple_api",
    state: null,
    store: null,
    ...overrides,
  }
}

describe("billing subscription helpers", () => {
  test("keeps hydrated web subscriptions out of the loading state", () => {
    expect(hasHydratedWebSubscription(false, { isActive: true })).toBe(true)
    expect(hasHydratedWebSubscription(false, null)).toBe(false)
    expect(hasHydratedWebSubscription(true, { isActive: true })).toBe(false)
  })

  test("unlocks Pro from the server's entitlement verdict", () => {
    expect(hasOneRepPro(status({ isActive: true }))).toBe(true)
    expect(hasOneRepPro(status({ isActive: false }))).toBe(false)
    expect(hasOneRepPro(null)).toBe(false)
  })

  test("detects a purchase that has not yet resolved to an entitlement", () => {
    // A restore in flight: a subscription exists but Pro is not granted yet.
    const pending = status({
      isActive: false,
      activeSubscriptions: ["onerep_pro_monthly"],
    })
    expect(hasOneRepPro(pending)).toBe(false)
    expect(hasActiveSubscription(pending)).toBe(true)
  })
})

describe("subscriptionDiagnosticCopy", () => {
  const base = {
    error: null,
    isConfigured: true,
    isNative: true,
    isWeb: false,
    status: "ready" as const,
  }

  test("reports Pro as active with its origin", () => {
    const copy = subscriptionDiagnosticCopy({
      ...base,
      customerInfo: status({
        isActive: true,
        source: "apple_api",
        store: "app_store",
      }),
    })
    expect(copy.tone).toBe("success")
    expect(copy.title).toBe("Pro active")
    expect(copy.detail).toContain("App Store")
  })

  test("warns about a failed payment while access still holds", () => {
    for (const state of ["grace_period", "billing_retry"]) {
      const copy = subscriptionDiagnosticCopy({
        ...base,
        customerInfo: status({ isActive: true, state, store: "play_store" }),
      })
      expect(copy.tone).toBe("attention")
      expect(copy.title).toBe("Payment needs attention")
      expect(copy.canRetry).toBe(true)
    }
  })

  test("explains that a cancelled subscription runs to the period end", () => {
    const copy = subscriptionDiagnosticCopy({
      ...base,
      customerInfo: status({
        isActive: true,
        state: "canceled",
        store: "app_store",
      }),
    })
    expect(copy.tone).toBe("success")
    expect(copy.detail).toContain("until the end of your current period")
  })

  test("surfaces a network failure as retryable", () => {
    const copy = subscriptionDiagnosticCopy({
      ...base,
      customerInfo: null,
      error: "Loading products timed out",
    })
    expect(copy.tone).toBe("attention")
    expect(copy.canRetry).toBe(true)
    expect(copy.detail).toContain("Check your connection")
  })

  test("does not offer retry while the check is still running", () => {
    const copy = subscriptionDiagnosticCopy({
      ...base,
      customerInfo: null,
      status: "loading",
    })
    expect(copy.tone).toBe("pending")
    expect(copy.canRetry).toBe(false)
  })

  test("reports the free plan when nothing is active", () => {
    const copy = subscriptionDiagnosticCopy({ ...base, customerInfo: null })
    expect(copy.tone).toBe("muted")
    expect(copy.title).toBe("Free plan")
  })

  test("marks unsupported platforms as non-retryable", () => {
    const copy = subscriptionDiagnosticCopy({
      ...base,
      customerInfo: null,
      isNative: false,
      status: "unsupported",
    })
    expect(copy.tone).toBe("muted")
    expect(copy.canRetry).toBe(false)
  })
})

describe("billingErrorMessage", () => {
  test("prefers a message from the thrown value", () => {
    expect(billingErrorMessage(new Error("Card declined"), "fallback")).toBe(
      "Card declined"
    )
    expect(billingErrorMessage({ message: "Network down" }, "fallback")).toBe(
      "Network down"
    )
  })

  test("falls back when there is nothing usable", () => {
    expect(billingErrorMessage(null, "Purchase failed")).toBe("Purchase failed")
    expect(billingErrorMessage({ message: "  " }, "Purchase failed")).toBe(
      "Purchase failed"
    )
  })
})
