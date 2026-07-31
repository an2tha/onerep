import { describe, expect, test } from "vitest";
import { appleStateFor } from "../billing/apple";
import { googleStateFor } from "../billing/google";
import { stripeStateFor } from "../billing/stripe";
import { stateGrantsAccess, type BillingState } from "../billing/types";

/**
 * Table-driven coverage of every status each store can report, and whether it
 * grants the entitlement. These mappings are the part of the billing stack that
 * silently costs money when it is wrong in either direction.
 */

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const FUTURE = NOW + 7 * DAY;

function granted(state: BillingState, gracePeriodExpiresAt?: number) {
  return stateGrantsAccess(state, FUTURE, NOW, gracePeriodExpiresAt);
}

describe("Apple subscription status codes", () => {
  const transaction = {};
  const renewing = { autoRenewStatus: 1 };
  const notRenewing = { autoRenewStatus: 0 };

  test.each<[number, object, BillingState, boolean]>([
    [1, renewing, "active", true],
    [1, notRenewing, "canceled", true],
    [2, renewing, "expired", false],
    [3, renewing, "billing_retry", true],
    [4, renewing, "grace_period", true],
    [5, renewing, "refunded", false],
  ])("status %d -> %s (grants: %s)", (status, renewal, expected, grants) => {
    const state = appleStateFor(status, transaction, renewal);
    expect(state).toBe(expected);
    expect(granted(state, FUTURE)).toBe(grants);
  });

  test("a revoked transaction is a refund regardless of status", () => {
    expect(
      appleStateFor(1, { revocationDate: NOW - DAY }, { autoRenewStatus: 1 }),
    ).toBe("refunded");
  });
});

describe("Google subscriptionState", () => {
  test.each<[string, BillingState, boolean]>([
    ["SUBSCRIPTION_STATE_ACTIVE", "active", true],
    ["SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "grace_period", true],
    ["SUBSCRIPTION_STATE_CANCELED", "canceled", true],
    ["SUBSCRIPTION_STATE_ON_HOLD", "billing_retry", true],
    ["SUBSCRIPTION_STATE_PAUSED", "paused", false],
    ["SUBSCRIPTION_STATE_EXPIRED", "expired", false],
    ["SUBSCRIPTION_STATE_UNSPECIFIED", "expired", false],
  ])("%s -> %s (grants: %s)", (playState, expected, grants) => {
    const state = googleStateFor(playState);
    expect(state).toBe(expected);
    expect(granted(state, FUTURE)).toBe(grants);
  });
});

describe("Stripe subscription status", () => {
  function subscription(status: string, cancelAtPeriodEnd = false) {
    return {
      status,
      cancel_at_period_end: cancelAtPeriodEnd,
    } as never;
  }

  test.each<[string, boolean, BillingState, boolean]>([
    ["active", false, "active", true],
    ["active", true, "canceled", true],
    ["trialing", false, "active", true],
    ["past_due", false, "billing_retry", true],
    ["paused", false, "paused", false],
    ["canceled", false, "expired", false],
    ["unpaid", false, "expired", false],
    ["incomplete", false, "expired", false],
    ["incomplete_expired", false, "expired", false],
  ])(
    "%s (cancel_at_period_end=%s) -> %s (grants: %s)",
    (status, cancelAtPeriodEnd, expected, grants) => {
      const state = stripeStateFor(subscription(status, cancelAtPeriodEnd));
      expect(state).toBe(expected);
      expect(granted(state, FUTURE)).toBe(grants);
    },
  );
});

describe("grace and retry boundaries", () => {
  test("access ends when the grace period itself lapses", () => {
    expect(stateGrantsAccess("grace_period", NOW - DAY, NOW, NOW + DAY)).toBe(
      true,
    );
    expect(stateGrantsAccess("grace_period", NOW - DAY, NOW, NOW - 1)).toBe(
      false,
    );
  });

  test("billing retry without a configured grace period falls back to the paid period", () => {
    expect(stateGrantsAccess("billing_retry", NOW + DAY, NOW, undefined)).toBe(
      true,
    );
    expect(stateGrantsAccess("billing_retry", NOW - DAY, NOW, undefined)).toBe(
      false,
    );
  });

  test("a cancelled subscription keeps access until the period it paid for ends", () => {
    expect(stateGrantsAccess("canceled", NOW + DAY, NOW)).toBe(true);
    expect(stateGrantsAccess("canceled", NOW - 1, NOW)).toBe(false);
  });
});
