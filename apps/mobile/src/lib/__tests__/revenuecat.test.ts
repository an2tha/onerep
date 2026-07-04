import { describe, expect, test } from "bun:test"
import {
  buildRevenueCatWebCheckoutUrl,
  hasActiveSubscription,
  hasOneRepPro,
  ONEREP_PRO_ENTITLEMENT,
  revenueCatErrorMessage,
} from "@/lib/revenuecat"

function customerInfo(overrides: Record<string, unknown>) {
  return overrides as never
}

describe("RevenueCat subscription helpers", () => {
  test("builds direct web checkout URL for monthly package", () => {
    const url = new URL(
      buildRevenueCatWebCheckoutUrl({
        appUserId: "user_456",
      })
    )

    expect(url.origin).toBe("https://pay.rev.cat")
    expect(url.pathname).toBe("/sandbox/mqvkhnnxqaxmwfms/user_456")
    expect(url.searchParams.get("package_id")).toBe("monthly")
    expect(url.searchParams.get("hide_back_button")).toBe("true")
  })

  test("adds email to direct web checkout URL", () => {
    const url = new URL(
      buildRevenueCatWebCheckoutUrl({
        appUserId: "user with spaces",
        email: "test+checkout@example.com",
      })
    )

    expect(url.pathname).toBe("/sandbox/mqvkhnnxqaxmwfms/user%20with%20spaces")
    expect(url.searchParams.get("email")).toBe("test+checkout@example.com")
  })

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
})
