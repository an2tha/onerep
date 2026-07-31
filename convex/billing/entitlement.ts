import type { Doc } from "../_generated/dataModel";
import { env, type QueryCtx } from "../_generated/server";
import {
  PRO_ENTITLEMENT,
  isoDateFromMs,
  stateGrantsAccess,
  storeLabelForPlatform,
  type BillingPlatform,
  type NormalizedSubscriptionStatus,
  type SubscriptionSource,
} from "./types";

/**
 * Whether OneRep Pro is currently comped for everyone.
 *
 * A single switch rather than a per-user backfill, deliberately: app tables key
 * on `tokenIdentifier` while the Better Auth component keys on `subject`, so
 * enumerating accounts and mapping them across that boundary would risk missing
 * exactly the users a comp is meant to protect. A flag covers every account
 * with certainty, costs no writes, and is reverted by unsetting the variable.
 *
 * Note this also covers accounts created *after* it is set. Set it to `false`
 * or remove it to restore normal store-backed entitlement checks.
 */
export function isProCompedForEveryone() {
  return env.BILLING_COMP_ALL_USERS === "true";
}

/**
 * Whether a stored platform subscription currently grants the entitlement.
 *
 * Rows imported from the previous billing provider carry a
 * `grandfatheredUntil` timestamp. Inside that window they grant access even if
 * the platform now reports otherwise — wrongly revoking a paying customer is
 * far more expensive than a month of free access to a handful of ghost rows.
 */
export function subscriptionGrantsAccess(
  subscription: Doc<"billingSubscriptions">,
  now: number,
): boolean {
  if (
    stateGrantsAccess(
      subscription.state,
      subscription.expiresAt,
      now,
      subscription.gracePeriodExpiresAt,
    )
  ) {
    return true;
  }
  // Refunds are never grandfathered: the money went back.
  if (subscription.state === "refunded") return false;
  return (subscription.grandfatheredUntil ?? 0) > now;
}

/** Platform whose state should win when a user holds several subscriptions. */
function rankSubscription(
  subscription: Doc<"billingSubscriptions">,
  now: number,
) {
  return [
    subscriptionGrantsAccess(subscription, now) ? 1 : 0,
    subscription.state === "active" ? 1 : 0,
    subscription.expiresAt,
  ] as const;
}

function pickPrimary(
  subscriptions: Doc<"billingSubscriptions">[],
  now: number,
) {
  return subscriptions.slice().sort((a, b) => {
    const left = rankSubscription(a, now);
    const right = rankSubscription(b, now);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return right[index] - left[index];
    }
    return 0;
  })[0];
}

/** Deep link a user follows to manage or cancel where they actually bought. */
export function managementUrlForPlatform(
  platform: BillingPlatform,
  productId?: string,
): string | null {
  switch (platform) {
    case "apple":
      return "https://apps.apple.com/account/subscriptions";
    case "google":
      return productId
        ? `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}`
        : "https://play.google.com/store/account/subscriptions";
    case "stripe":
      // Stripe cancellation is handled in-app; the portal URL is minted on
      // demand because it is short-lived and cannot be cached here.
      return null;
  }
}

function sourceForPlatform(platform: BillingPlatform): SubscriptionSource {
  switch (platform) {
    case "apple":
      return "apple_api";
    case "google":
      return "google_api";
    case "stripe":
      return "stripe_api";
  }
}

/**
 * Reduce every platform subscription a user holds into the single per-user
 * status document the client and quota enforcement read.
 */
export function rollupForUser(
  appUserId: string,
  subscriptions: Doc<"billingSubscriptions">[],
  now: number,
): NormalizedSubscriptionStatus {
  const granting = subscriptions.filter((subscription) =>
    subscriptionGrantsAccess(subscription, now),
  );
  const primary = pickPrimary(subscriptions, now);
  const isActive = granting.length > 0;

  if (!primary) {
    return {
      appUserId,
      entitlementId: PRO_ENTITLEMENT,
      isActive: false,
      hasActiveSubscription: false,
      activeSubscriptions: [],
      managementUrl: null,
      productIdentifier: null,
      store: null,
      expiresAt: null,
      source: "manual",
      fetchedAt: now,
    };
  }

  return {
    appUserId,
    entitlementId: PRO_ENTITLEMENT,
    isActive,
    hasActiveSubscription: isActive,
    activeSubscriptions: granting.map((subscription) => subscription.productId),
    managementUrl: managementUrlForPlatform(
      primary.platform,
      primary.productId,
    ),
    productIdentifier: primary.productId,
    store: storeLabelForPlatform(primary.platform),
    expiresAt: isoDateFromMs(primary.expiresAt),
    source: sourceForPlatform(primary.platform),
    platform: primary.platform,
    state: primary.state,
    autoRenew: primary.autoRenew,
    gracePeriodExpiresAt: primary.gracePeriodExpiresAt,
    fetchedAt: now,
  };
}

/**
 * Whether a user currently holds the OneRep Pro entitlement, resolved from a
 * read-only context so quota enforcement can call it from a mutation.
 *
 * Reads the `billingSubscriptions` rows directly rather than the
 * `subscriptionStates` rollup, so a stale rollup can never grant or revoke
 * access. Never issues an HTTP request.
 */
export async function hasActiveProEntitlement(
  ctx: QueryCtx,
  userId: string,
): Promise<boolean> {
  if (isProCompedForEveryone()) return true;

  const now = Date.now();
  const subscriptions = await ctx.db
    .query("billingSubscriptions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(20);

  if (
    subscriptions.some((subscription) =>
      subscriptionGrantsAccess(subscription, now),
    )
  ) {
    return true;
  }

  return false;
}
