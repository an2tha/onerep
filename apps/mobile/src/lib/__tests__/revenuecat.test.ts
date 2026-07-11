import { describe, expect, test } from "bun:test"
import {
  hasActiveSubscription,
  hasOneRepPro,
  ONEREP_PRO_ENTITLEMENT,
  revenueCatErrorMessage,
  subscriptionDiagnosticCopy,
} from "@/lib/revenuecat"

function customerInfo(overrides: Record<string, unknown>) {
  return overrides as never
}

describe("RevenueCat subscription helpers", () => {
  test("unlocks OneRep Pro from active entitlement map", () => {
    const info = customerInfo({
      entitlements: {
        active: {
          [ONEREP_PRO_ENTITLEMENT]: { identifier: ONEREP_PRO_ENTITLEMENT },
        },
      },
    })

    expect(hasOneRepPro(info)).toBe(true)
    expect(hasActiveSubscription(info)).toBe(true)
  })

  test("unlocks OneRep Pro from entitlement isActive fallback", () => {
    const info = customerInfo({
      entitlements: {
        all: {
          [ONEREP_PRO_ENTITLEMENT]: { isActive: true },
        },
      },
    })

    expect(hasOneRepPro(info)).toBe(true)
  })

  test("recognizes active subscriptions even without Pro entitlement", () => {
    const info = customerInfo({
      entitlements: { active: {}, all: {} },
      activeSubscriptions: new Set(["monthly"]),
    })

    expect(hasOneRepPro(info)).toBe(false)
    expect(hasActiveSubscription(info)).toBe(true)
  })

  test("treats missing subscription data as inactive", () => {
    expect(hasOneRepPro(null)).toBe(false)
    expect(hasActiveSubscription(null)).toBe(false)
    expect(hasActiveSubscription(customerInfo({ entitlements: {} }))).toBe(
      false
    )
  })

  test("keeps purchase cancellation non-error user copy", () => {
    expect(revenueCatErrorMessage({ userCancelled: true }, "Fallback")).toBe(
      "Purchase canceled"
    )
  })

  test("shows a compact recovery state when a purchase exists before Pro unlocks", () => {
    expect(
      subscriptionDiagnosticCopy({
        customerInfo: customerInfo({
          activeSubscriptions: ["monthly"],
          entitlements: { active: {}, all: {} },
        }),
        error: null,
        isConfigured: true,
        isNative: false,
        isWeb: true,
        status: "ready",
      })
    ).toEqual({
      title: "Restoring Pro access",
      detail: "A purchase was found. Refresh to finish checking access.",
      tone: "attention",
      canRetry: true,
    })
  })

  test("reports an active subscription source without exposing billing internals", () => {
    expect(
      subscriptionDiagnosticCopy({
        customerInfo: customerInfo({
          isActive: true,
          source: "revenuecat_webhook",
          store: "app_store",
        }),
        error: null,
        isConfigured: true,
        isNative: false,
        isWeb: true,
        status: "ready",
      })
    ).toEqual({
      title: "Pro active",
      detail: "Status confirmed via RevenueCat sync · App Store.",
      tone: "success",
      canRetry: false,
    })
  })

  test("makes failed subscription checks actionable", () => {
    expect(
      subscriptionDiagnosticCopy({
        customerInfo: null,
        error:
          "Subscription status request timed out while checking the account",
        isConfigured: true,
        isNative: false,
        isWeb: true,
        status: "error",
      })
    ).toMatchObject({
      title: "Subscription needs attention",
      tone: "attention",
      canRetry: true,
    })
  })

  test("does not expose billing configuration details in user-facing diagnostics", () => {
    expect(
      subscriptionDiagnosticCopy({
        customerInfo: null,
        error: "RevenueCat native SDK key is not configured in Convex",
        isConfigured: false,
        isNative: true,
        isWeb: false,
        status: "error",
      }).detail
    ).toBe("Purchases are temporarily unavailable. Try again later.")
  })
})
