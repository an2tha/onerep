import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { subscriptionGrantsAccess } from "./entitlement";
import { recomputeRollupFor } from "./store";

/**
 * Scheduled revalidation.
 *
 * Webhooks are the fast path, but they can be dropped, mis-routed, or silently
 * disabled in a store console. These sweeps are the safety net that makes such
 * a loss a delay rather than an outage — which is precisely why the webhook
 * handlers are allowed to be simple.
 */

const REVALIDATION_BATCH = 50;
/** Stagger platform calls so a batch does not trip store rate limits. */
const STAGGER_MS = 250;

export const findDueSubscriptions = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_revalidateAfter", (q) => q.lte("revalidateAfter", now))
      .take(args.limit);
  },
});

export const listLiveSubscriptions = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) =>
    await ctx.db.query("billingSubscriptions").take(args.limit),
});

/** Re-read one subscription from its platform, whichever that is. */
export const revalidateOne = internalAction({
  args: {
    platform: v.union(
      v.literal("apple"),
      v.literal("google"),
      v.literal("stripe"),
    ),
    platformSubscriptionId: v.string(),
    productId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.platform === "stripe") {
      await ctx.runAction(internal.billing.stripe.refreshSubscription, {
        platformSubscriptionId: args.platformSubscriptionId,
        userId: args.userId,
      });
      return;
    }
    if (args.platform === "apple") {
      await ctx.runAction(internal.billing.apple.refreshSubscription, {
        originalTransactionId: args.platformSubscriptionId,
        userId: args.userId,
      });
      return;
    }
    await ctx.runAction(internal.billing.google.refreshSubscription, {
      purchaseToken: args.platformSubscriptionId,
      productId: args.productId,
      userId: args.userId,
    });
  },
});

/**
 * Revalidate subscriptions that are due — those about to lapse, plus anything
 * whose 24h polling window has elapsed.
 */
export const revalidateDue = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    // Annotated because this calls a query in the same file, which TypeScript
    // cannot resolve without help.
    const due: Doc<"billingSubscriptions">[] = await ctx.runQuery(
      internal.billing.crons.findDueSubscriptions,
      { limit: REVALIDATION_BATCH },
    );

    due.forEach((subscription, index) => {
      void ctx.scheduler.runAfter(
        index * STAGGER_MS,
        internal.billing.crons.revalidateOne,
        {
          platform: subscription.platform,
          platformSubscriptionId: subscription.platformSubscriptionId,
          productId: subscription.productId,
          userId: subscription.userId,
        },
      );
    });

    return { scheduled: due.length };
  },
});

/**
 * Recompute every rollup from stored platform rows.
 *
 * Costs no store API calls and catches the case that matters most: a
 * subscription that simply elapsed while nothing was there to notice.
 */
export const reconcileRollups = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const subscriptions = await ctx.db
      .query("billingSubscriptions")
      .take(args.limit ?? 500);

    const userIds = new Set(
      subscriptions.map((subscription) => subscription.userId),
    );
    for (const userId of userIds) {
      await recomputeRollupFor(ctx, userId);
    }

    const stale = subscriptions.filter(
      (subscription) => !subscriptionGrantsAccess(subscription, now),
    ).length;
    return { users: userIds.size, notGranting: stale };
  },
});
