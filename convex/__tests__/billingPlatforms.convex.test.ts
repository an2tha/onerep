import { describe, expect, test } from "vitest";
import { stripeStateFor } from "../billing/stripe";
import { stateGrantsAccess, type BillingState } from "../billing/types";

/**
 * Table-driven coverage of every status Stripe can report, and whether it
 * grants the entitlement. Stripe is the only platform OneRep Pro is sold on,
 * and this mapping is the part of the billing stack that silently costs money
 * when it is wrong in either direction.
 */

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const FUTURE = NOW + 7 * DAY;

function granted(state: BillingState, gracePeriodExpiresAt?: number) {
  return stateGrantsAccess(state, FUTURE, NOW, gracePeriodExpiresAt);
}

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
