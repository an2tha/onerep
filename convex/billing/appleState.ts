import type {
  BillingEnvironment,
  BillingState,
  PlatformSubscriptionFacts,
} from "./types";

/**
 * Apple's subscription vocabulary, reduced to ours.
 *
 * Pure and dependency-free on purpose. `apple.ts` needs the Node runtime for
 * certificate work, and Node modules in Convex cannot host queries or
 * mutations — but the mapping below is the part that decides whether somebody
 * keeps access, so it lives out here where the V8 runtime and the tests can
 * both reach it without a signing key.
 *
 * The vocabulary itself is the App Store Server API's, spelled out rather than
 * imported so the meaning survives a library upgrade:
 *   status 1 active · 2 expired · 3 billing retry · 4 grace period · 5 revoked
 */

export const APPLE_STATUS_ACTIVE = 1;
export const APPLE_STATUS_EXPIRED = 2;
export const APPLE_STATUS_BILLING_RETRY = 3;
export const APPLE_STATUS_GRACE_PERIOD = 4;
export const APPLE_STATUS_REVOKED = 5;

/** `autoRenewStatus`: 0 off, 1 on. */
export const APPLE_AUTO_RENEW_ON = 1;

/**
 * A subscription is `expirationIntent`-marked when Apple has given up. We do
 * not branch on the intent itself — the status already says what happened —
 * but a refund does not look like an expiry and must not be treated as one.
 */
export type AppleStatusFacts = {
  status: number;
  autoRenewStatus?: number | null;
  expiresDate?: number | null;
  gracePeriodExpiresDate?: number | null;
  revocationDate?: number | null;
};

/**
 * Map one Apple subscription status onto our entitlement state machine.
 *
 * `revocationDate` wins over everything: a refunded purchase is money returned,
 * and the state machine revokes on `refunded` without honouring the paid
 * period. Status 5 means the same thing from the other direction.
 *
 * Auto-renew off with time left on the clock is `canceled`, not `expired` —
 * the customer paid for a period and gets it, the same courtesy Stripe's
 * `cancel_at_period_end` earns.
 */
export function appleStateFor(facts: AppleStatusFacts): BillingState {
  if (facts.revocationDate) return "refunded";

  switch (facts.status) {
    case APPLE_STATUS_ACTIVE:
      return facts.autoRenewStatus === APPLE_AUTO_RENEW_ON
        ? "active"
        : "canceled";
    case APPLE_STATUS_BILLING_RETRY:
      return "billing_retry";
    case APPLE_STATUS_GRACE_PERIOD:
      return "grace_period";
    case APPLE_STATUS_REVOKED:
      return "refunded";
    case APPLE_STATUS_EXPIRED:
      return "expired";
    default:
      // An unknown status is not an excuse to hand out access, and not an
      // excuse to take it away either — but one of the two has to be picked,
      // and Apple only ever adds statuses for subscriptions that have stopped
      // paying.
      return "expired";
  }
}

export function appleEnvironmentFor(
  environment: string | null | undefined,
): BillingEnvironment {
  return environment === "Production" ? "production" : "sandbox";
}

/** Where an App Store subscriber goes to cancel. Apple owns that screen. */
export const APPLE_MANAGEMENT_URL =
  "https://apps.apple.com/account/subscriptions";

export type AppleTransactionFacts = {
  originalTransactionId: string;
  productId: string;
  expiresDate?: number | null;
  environment?: string | null;
  signedDate?: number | null;
  appAccountToken?: string | null;
};

/**
 * Build the row `store.upsertPlatformSubscription` expects from what Apple
 * signed.
 *
 * `expiresDate` can be absent on a transaction Apple has already revoked; the
 * fallback keeps the row's clock in the past rather than defaulting it to now
 * and briefly granting a second of access to a refunded purchase.
 */
export function applySubscriptionFacts(
  transaction: AppleTransactionFacts,
  status: AppleStatusFacts,
  raw?: unknown,
): PlatformSubscriptionFacts {
  const state = appleStateFor(status);
  const expiresAt =
    status.expiresDate ??
    transaction.expiresDate ??
    (state === "refunded" ? (status.revocationDate ?? 0) : 0);

  return {
    platform: "apple",
    platformSubscriptionId: transaction.originalTransactionId,
    productId: transaction.productId,
    state,
    autoRenew: status.autoRenewStatus === APPLE_AUTO_RENEW_ON,
    expiresAt,
    gracePeriodExpiresAt: status.gracePeriodExpiresDate ?? undefined,
    environment: appleEnvironmentFor(transaction.environment),
    managementUrl: APPLE_MANAGEMENT_URL,
    // Apple stamps every signed payload. Feeding it to the store layer is what
    // makes out-of-order notification delivery a non-event: a renewal that
    // arrives after the expiry it superseded is dropped on the timestamp.
    sourceUpdatedAt: transaction.signedDate ?? undefined,
    latestRaw: raw,
  };
}

/**
 * Notification types that say something about a subscription's state.
 *
 * We do not act on the notification body — every one of these ends in a
 * re-read from the App Store Server API — so the list is only used to decide
 * whether an inbound notification is worth the round trip. Anything not listed
 * is recorded and ignored, which is the correct handling for
 * CONSUMPTION_REQUEST and the one-time-purchase types we do not sell.
 */
export const APPLE_SUBSCRIPTION_NOTIFICATIONS = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "DID_CHANGE_RENEWAL_STATUS",
  "DID_CHANGE_RENEWAL_PREF",
  "DID_FAIL_TO_RENEW",
  "EXPIRED",
  "GRACE_PERIOD_EXPIRED",
  "OFFER_REDEEMED",
  "PRICE_INCREASE",
  "REFUND",
  "REFUND_REVERSED",
  "REVOKE",
  "RENEWAL_EXTENDED",
]);

export function appleNotificationIsActionable(notificationType: string) {
  return APPLE_SUBSCRIPTION_NOTIFICATIONS.has(notificationType);
}
