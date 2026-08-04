import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { rollupForUser } from "./entitlement";
import {
  billingEnvironment,
  billingPlatform,
  billingState,
  convexSafeJson,
  subscriptionSource,
  type NormalizedSubscriptionStatus,
} from "./types";

/** Poll healthy subscriptions at most daily, and always before they lapse. */
const MAX_REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

function nextRevalidateAfter(expiresAt: number, now: number) {
  return Math.min(expiresAt, now + MAX_REVALIDATION_INTERVAL_MS);
}

/**
 * Claim an inbound billing notification.
 *
 * Returns `false` when the event has already been seen, which is how the
 * webhook route stays idempotent under Stripe's 3-day retry policy.
 */
export const claimEvent = internalMutation({
  args: {
    platform: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    platformSubscriptionId: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    raw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingEvents")
      .withIndex("by_platform_and_eventId", (q) =>
        q.eq("platform", args.platform).eq("eventId", args.eventId),
      )
      .unique();
    if (existing) return { claimed: false as const, eventDocId: existing._id };

    const eventDocId = await ctx.db.insert("billingEvents", {
      platform: args.platform,
      eventId: args.eventId,
      eventType: args.eventType,
      platformSubscriptionId: args.platformSubscriptionId,
      signedAt: args.signedAt,
      processedAt: Date.now(),
      status: "received",
      raw: convexSafeJson(args.raw),
    });
    return { claimed: true as const, eventDocId };
  },
});

export const finishEvent = internalMutation({
  args: {
    eventDocId: v.id("billingEvents"),
    status: v.union(
      v.literal("processed"),
      v.literal("ignored"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    platformSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { eventDocId, ...patch } = args;
    await ctx.db.patch(eventDocId, {
      ...patch,
      processedAt: Date.now(),
    });
  },
});

export const getSubscriptionByPlatformId = internalQuery({
  args: { platform: billingPlatform, platformSubscriptionId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_platform_and_platformSubscriptionId", (q) =>
        q
          .eq("platform", args.platform)
          .eq("platformSubscriptionId", args.platformSubscriptionId),
      )
      .unique(),
});

export const listSubscriptionsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(20),
});

export const findCheckoutBySessionId = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("billingCheckouts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique(),
});

/** Last-resort attribution for a Stripe subscription with no metadata. */
export const findUserIdByStripeCustomer = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_platform_and_platformCustomerId", (q) =>
        q
          .eq("platform", "stripe")
          .eq("platformCustomerId", args.stripeCustomerId),
      )
      .first();
    if (existing) return existing.userId;

    const checkout = await ctx.db
      .query("billingCheckouts")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId),
      )
      .first();
    return checkout?.userId ?? null;
  },
});

export const recordCheckout = internalMutation({
  args: {
    userId: v.string(),
    sessionId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingCheckouts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        stripeCustomerId: args.stripeCustomerId ?? existing.stripeCustomerId,
      });
      return existing._id;
    }
    return await ctx.db.insert("billingCheckouts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Insert or update the row for one platform subscription, then recompute the
 * user's rollup.
 *
 * `sourceUpdatedAt` is the platform's own timestamp for the state being
 * written. When it predates what we already stored, the write is dropped —
 * that is what makes out-of-order webhook delivery harmless.
 */
export const upsertPlatformSubscription = internalMutation({
  args: {
    userId: v.string(),
    platform: billingPlatform,
    platformSubscriptionId: v.string(),
    platformCustomerId: v.optional(v.string()),
    productId: v.string(),
    state: billingState,
    autoRenew: v.boolean(),
    expiresAt: v.number(),
    gracePeriodExpiresAt: v.optional(v.number()),
    environment: billingEnvironment,
    originRevenueCat: v.optional(v.boolean()),
    grandfatheredUntil: v.optional(v.number()),
    sourceUpdatedAt: v.optional(v.number()),
    latestRaw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_platform_and_platformSubscriptionId", (q) =>
        q
          .eq("platform", args.platform)
          .eq("platformSubscriptionId", args.platformSubscriptionId),
      )
      .unique();

    if (
      existing &&
      args.sourceUpdatedAt !== undefined &&
      existing.sourceUpdatedAt !== undefined &&
      args.sourceUpdatedAt < existing.sourceUpdatedAt
    ) {
      return { skipped: "stale" as const, userId: existing.userId };
    }

    const fields = {
      userId: args.userId,
      platform: args.platform,
      platformSubscriptionId: args.platformSubscriptionId,
      platformCustomerId: args.platformCustomerId,
      productId: args.productId,
      state: args.state,
      autoRenew: args.autoRenew,
      expiresAt: args.expiresAt,
      gracePeriodExpiresAt: args.gracePeriodExpiresAt,
      environment: args.environment,
      originRevenueCat: args.originRevenueCat ?? existing?.originRevenueCat,
      grandfatheredUntil:
        args.grandfatheredUntil ?? existing?.grandfatheredUntil,
      sourceUpdatedAt: args.sourceUpdatedAt ?? existing?.sourceUpdatedAt,
      revalidateAfter: nextRevalidateAfter(args.expiresAt, now),
      latestRaw: convexSafeJson(args.latestRaw),
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("billingSubscriptions", {
        ...fields,
        createdAt: now,
      });
    }

    // A subscription can move to a different account when support re-attributes
    // it; recompute both rollups so the loser loses access too.
    await recomputeRollupFor(ctx, args.userId);
    if (existing && existing.userId !== args.userId) {
      await recomputeRollupFor(ctx, existing.userId);
    }

    return { skipped: null, userId: args.userId };
  },
});

export const recomputeRollup = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await recomputeRollupFor(ctx, args.userId);
  },
});

export async function recomputeRollupFor(ctx: MutationCtx, userId: string) {
  const now = Date.now();
  const subscriptions = await ctx.db
    .query("billingSubscriptions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(20);

  const existing = await ctx.db
    .query("subscriptionStates")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  const appUserId = existing?.appUserId ?? userId;
  const status = rollupForUser(appUserId, subscriptions, now);
  await writeStatus(ctx, userId, status, existing);
  return status;
}

/**
 * Persist the per-user rollup, skipping no-op writes.
 *
 * Store callbacks, webhook delivery, and the revalidation cron routinely report
 * the same entitlement within seconds of each other. Without this guard those
 * observations become competing writes to the single status document.
 */
export async function writeStatus(
  ctx: MutationCtx,
  userId: string,
  status: NormalizedSubscriptionStatus,
  existing?: Doc<"subscriptionStates"> | null,
) {
  const current =
    existing !== undefined
      ? existing
      : await ctx.db
          .query("subscriptionStates")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique();

  if (current && sameSubscriptionStatus(current, status)) return;

  const now = Date.now();
  const patch = {
    userId,
    appUserId: status.appUserId,
    entitlementId: status.entitlementId,
    isActive: status.isActive,
    hasActiveSubscription: status.hasActiveSubscription,
    activeSubscriptions: status.activeSubscriptions,
    managementUrl: status.managementUrl,
    productIdentifier: status.productIdentifier,
    store: status.store,
    expiresAt: status.expiresAt,
    source: status.source,
    platform: status.platform,
    state: status.state,
    autoRenew: status.autoRenew,
    gracePeriodExpiresAt: status.gracePeriodExpiresAt,
    fetchedAt: status.fetchedAt,
    updatedAt: now,
    ...(status.rawCustomerInfo !== undefined
      ? { rawCustomerInfo: convexSafeJson(status.rawCustomerInfo) }
      : {}),
  };

  if (current) {
    await ctx.db.patch(current._id, patch);
  } else {
    await ctx.db.insert("subscriptionStates", patch);
  }
}

export function sameSubscriptionStatus(
  existing: Doc<"subscriptionStates">,
  incoming: NormalizedSubscriptionStatus,
) {
  return (
    existing.appUserId === incoming.appUserId &&
    existing.entitlementId === incoming.entitlementId &&
    existing.isActive === incoming.isActive &&
    existing.hasActiveSubscription === incoming.hasActiveSubscription &&
    sameStringSet(existing.activeSubscriptions, incoming.activeSubscriptions) &&
    existing.managementUrl === incoming.managementUrl &&
    existing.productIdentifier === incoming.productIdentifier &&
    existing.store === incoming.store &&
    existing.expiresAt === incoming.expiresAt &&
    existing.state === incoming.state &&
    existing.autoRenew === incoming.autoRenew
  );
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

/** Manual override reserved for support tooling. */
export const upsertStatus = internalMutation({
  args: {
    userId: v.string(),
    appUserId: v.string(),
    entitlementId: v.string(),
    isActive: v.boolean(),
    hasActiveSubscription: v.boolean(),
    activeSubscriptions: v.array(v.string()),
    managementUrl: v.union(v.string(), v.null()),
    productIdentifier: v.union(v.string(), v.null()),
    store: v.union(v.string(), v.null()),
    expiresAt: v.union(v.string(), v.null()),
    rawCustomerInfo: v.optional(v.any()),
    source: subscriptionSource,
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, ...status } = args;
    await writeStatus(ctx, userId, status);
  },
});
