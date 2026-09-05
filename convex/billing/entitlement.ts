import type { Doc } from "../_generated/dataModel";
import { env, type QueryCtx } from "../_generated/server";
import {
  PRO_ENTITLEMENT,
  appleProductGrantsPro,
  isoDateFromMs,
  stateGrantsAccess,
  storeLabelForPlatform,
  type BillingPlatform,
  type NormalizedSubscriptionStatus,
  type SubscriptionSource,
} from "./types";

export function isProCompedForEveryone() {
  return env.BILLING_COMP_ALL_USERS !== "false";
}

/**
 * Platforms whose rows can grant the entitlement.
 *
 * Google Play is not among them. Play billing was removed in 2026-08 and has
 * not come back, so a `google` row is a historical record of a charge we no
 * longer have credentials to verify, refund, or cancel — honouring it would
 * mean granting access on the strength of a number in a table.
 *
 * Apple rows are honoured again, old ones included. Anyone still carrying a
 * pre-2026-08 App Store subscription has been paying Apple every month
 * throughout, and the restore path re-verifies the row against the App Store
 * Server API the first time they open Settings anyway.
 */
const GRANTING_PLATFORMS = new Set<BillingPlatform>(["stripe", "apple"]);

export function subscriptionGrantsAccess(
  subscription: Doc<"billingSubscriptions">,
  now: number,
): boolean {
  if (!GRANTING_PLATFORMS.has(subscription.platform)) return false;
  // Signed Apple transactions are bundle-scoped; OneRep Pro is product-scoped.
  // Keep a second guard here so even a legacy or manually inserted row cannot
  // grant the wrong entitlement.
  if (
    subscription.platform === "apple" &&
    !appleProductGrantsPro(subscription.productId)
  ) {
    return false;
  }
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
