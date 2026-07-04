import { describe, expect, test } from "bun:test"
import {
  hasActiveSubscription,
  hasOneRepPro,
  ONEREP_PRO_ENTITLEMENT,
  revenueCatErrorMessage,
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
})
