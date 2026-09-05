import { describe, expect, test } from "vitest";
import {
  APPLE_AUTO_RENEW_ON,
  APPLE_MANAGEMENT_URL,
  APPLE_STATUS_ACTIVE,
  APPLE_STATUS_BILLING_RETRY,
  APPLE_STATUS_EXPIRED,
  APPLE_STATUS_GRACE_PERIOD,
  APPLE_STATUS_REVOKED,
  appleEnvironmentFor,
  appleNotificationIsActionable,
  appleStateFor,
  applySubscriptionFacts,
} from "../billing/appleState";
import {
  appleProductGrantsPro,
  parseAppleAppId,
  stateGrantsAccess,
  type BillingState,
} from "../billing/types";

/**
 * Table-driven coverage of every status the App Store Server API can report,
 * and whether it grants the entitlement.
 *
 * The same reasoning as the Stripe table next door: this mapping is the part
 * of the billing stack that costs money when it is wrong in either direction —
 * revoke too eagerly and a customer in a billing retry loses access over a card
 * that is about to work; revoke too late and a refunded purchase keeps paying
 * for inference we are buying by the request.
 */

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const FUTURE = NOW + 7 * DAY;
const PAST = NOW - 7 * DAY;

describe("Apple product allowlist", () => {
  test("only the configured OneRep Pro subscription grants Pro", () => {
    expect(appleProductGrantsPro("onerep_pro_monthly")).toBe(true);
    expect(appleProductGrantsPro("another_subscription")).toBe(false);
  });
});

describe("Apple app identifier", () => {
  test("accepts only a complete positive numeric App Store ID", () => {
    expect(parseAppleAppId("1234567890")).toBe(1234567890);
    expect(parseAppleAppId("123abc")).toBeUndefined();
    expect(parseAppleAppId("0")).toBeUndefined();
    expect(parseAppleAppId(undefined)).toBeUndefined();
  });
});

describe("Apple subscription status", () => {
  test.each<[string, number, number | null, BillingState, boolean]>([
    [
      "active, renewing",
      APPLE_STATUS_ACTIVE,
      APPLE_AUTO_RENEW_ON,
      "active",
      true,
    ],
    ["active, auto-renew off", APPLE_STATUS_ACTIVE, 0, "canceled", true],
    [
      "billing retry",
      APPLE_STATUS_BILLING_RETRY,
      APPLE_AUTO_RENEW_ON,
      "billing_retry",
      true,
    ],
    [
      "grace period",
      APPLE_STATUS_GRACE_PERIOD,
      APPLE_AUTO_RENEW_ON,
      "grace_period",
      true,
    ],
    ["expired", APPLE_STATUS_EXPIRED, 0, "expired", false],
    ["revoked", APPLE_STATUS_REVOKED, 0, "refunded", false],
    ["a status Apple has not invented yet", 99, 0, "expired", false],
  ])(
    "%s -> %s (grants: %s)",
    (_label, status, autoRenewStatus, expected, grants) => {
      const state = appleStateFor({ status, autoRenewStatus });
      expect(state).toBe(expected);
      expect(stateGrantsAccess(state, FUTURE, NOW, FUTURE)).toBe(grants);
    },
  );

  test("a refund revokes even while the paid period is still running", () => {
    // The money went back. Honouring the remaining period would be paying for
    // somebody's inference out of a refund we already granted.
    const state = appleStateFor({
      status: APPLE_STATUS_ACTIVE,
      autoRenewStatus: APPLE_AUTO_RENEW_ON,
      revocationDate: NOW - 1,
    });
    expect(state).toBe("refunded");
    expect(stateGrantsAccess(state, FUTURE, NOW)).toBe(false);
  });

  test("auto-renew off keeps access until the period actually ends", () => {
    expect(stateGrantsAccess("canceled", FUTURE, NOW)).toBe(true);
    expect(stateGrantsAccess("canceled", PAST, NOW)).toBe(false);
  });
});

describe("environment", () => {
  test.each([
    ["Production", "production"],
    ["Sandbox", "sandbox"],
    [undefined, "sandbox"],
    ["something new", "sandbox"],
  ])("%s -> %s", (input, expected) => {
    // Anything unrecognised is sandbox on purpose: mislabelling a sandbox row
    // as production would point the next refresh at the wrong API host, and a
    // real purchase mislabelled sandbox merely costs one failed lookup and a
    // retry against the other host.
    expect(appleEnvironmentFor(input)).toBe(expected);
  });
});

describe("subscription facts", () => {
  const transaction = {
    originalTransactionId: "2000000000000001",
    productId: "onerep_pro_monthly",
    expiresDate: FUTURE,
    environment: "Production",
    signedDate: NOW,
  };

  test("carries Apple's own timestamps into the row", () => {
    const facts = applySubscriptionFacts(transaction, {
      status: APPLE_STATUS_ACTIVE,
      autoRenewStatus: APPLE_AUTO_RENEW_ON,
      expiresDate: FUTURE,
    });

    expect(facts).toMatchObject({
      platform: "apple",
      platformSubscriptionId: "2000000000000001",
      productId: "onerep_pro_monthly",
      state: "active",
      autoRenew: true,
      expiresAt: FUTURE,
      environment: "production",
      managementUrl: APPLE_MANAGEMENT_URL,
      // The monotonicity guard. Without it, a renewal notification overtaken by
      // the expiry it superseded would roll the row backwards.
      sourceUpdatedAt: NOW,
    });
  });

  test("the status response wins over the transaction's own expiry", () => {
    // `getAllSubscriptionStatuses` describes now; the transaction describes the
    // moment money changed hands. When they disagree, now is the answer.
    const facts = applySubscriptionFacts(transaction, {
      status: APPLE_STATUS_ACTIVE,
      autoRenewStatus: APPLE_AUTO_RENEW_ON,
      expiresDate: FUTURE + DAY,
    });
    expect(facts.expiresAt).toBe(FUTURE + DAY);
  });

  test("a revoked purchase with no expiry does not land in the future", () => {
    const facts = applySubscriptionFacts(
      { ...transaction, expiresDate: null },
      { status: APPLE_STATUS_REVOKED, revocationDate: PAST },
    );
    expect(facts.state).toBe("refunded");
    expect(facts.expiresAt).toBe(PAST);
    expect(stateGrantsAccess(facts.state, facts.expiresAt, NOW)).toBe(false);
  });

  test("a grace period extends past the paid expiry", () => {
    const facts = applySubscriptionFacts(transaction, {
      status: APPLE_STATUS_GRACE_PERIOD,
      autoRenewStatus: APPLE_AUTO_RENEW_ON,
      expiresDate: PAST,
      gracePeriodExpiresDate: FUTURE,
    });
    expect(facts.state).toBe("grace_period");
    expect(
      stateGrantsAccess(
        facts.state,
        facts.expiresAt,
        NOW,
        facts.gracePeriodExpiresAt,
      ),
    ).toBe(true);
  });
});

describe("notification triage", () => {
  test.each([
    ["SUBSCRIBED", true],
    ["DID_RENEW", true],
    ["REFUND", true],
    ["REVOKE", true],
    ["EXPIRED", true],
    // Recorded and ignored: nothing here changes a subscription's state, and a
    // round trip to Apple to confirm that would be a request sent to learn
    // nothing.
    ["CONSUMPTION_REQUEST", false],
    ["ONE_TIME_CHARGE", false],
    ["TEST", false],
  ])("%s is actionable: %s", (notificationType, actionable) => {
    expect(appleNotificationIsActionable(notificationType)).toBe(actionable);
  });
});
