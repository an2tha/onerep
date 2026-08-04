import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, query, type ActionCtx } from "../_generated/server";
import { safeGetAuthUser } from "../lib/auth";
import { hasActiveProEntitlement } from "../billing/entitlement";

/** Monthly AI requests included without a OneRep Pro subscription. */
export const AI_FREE_MONTHLY_REQUEST_LIMIT = 10;
/** Monthly AI requests included with OneRep Pro. */
export const AI_PRO_MONTHLY_REQUEST_LIMIT = 500;

export function aiMonthlyRequestLimit(isPro: boolean) {
  return isPro ? AI_PRO_MONTHLY_REQUEST_LIMIT : AI_FREE_MONTHLY_REQUEST_LIMIT;
}

const AI_USAGE_SOURCES = [
  "progress_metrics",
  "workout_preset",
  "workout_log",
  "food_snap",
  "form_coach",
] as const;

export type AiUsageSource = (typeof AI_USAGE_SOURCES)[number];

/**
 * What one request of each kind spends from the monthly allowance.
 *
 * Not every request costs the same to serve. Form analysis runs a multi-step
 * tool loop over a motion capture rather than a single completion, so it is
 * priced at two, and the allowance keeps meaning roughly the same amount of
 * inference regardless of which feature spends it.
 */
export const AI_USAGE_COST: Record<AiUsageSource, number> = {
  progress_metrics: 1,
  workout_preset: 1,
  workout_log: 1,
  food_snap: 1,
  form_coach: 2,
};

export function aiUsageCost(source: AiUsageSource) {
  return AI_USAGE_COST[source] ?? 1;
}

export type AiUsageQuota = {
  allowed: boolean;
  count: number;
  remaining: number;
  limit: number;
  month: string;
  isPro: boolean;
  /** Advertised so clients can show the upgrade value without hardcoding it. */
  proLimit: number;
};

function utcMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export const getMonthlyUsage = query({
  args: {},
  handler: async (ctx): Promise<Omit<AiUsageQuota, "allowed">> => {
    const month = utcMonthKey();
    const user = await safeGetAuthUser(ctx);
    if (!user) {
      return {
        count: 0,
        remaining: AI_FREE_MONTHLY_REQUEST_LIMIT,
        limit: AI_FREE_MONTHLY_REQUEST_LIMIT,
        month,
        isPro: false,
        proLimit: AI_PRO_MONTHLY_REQUEST_LIMIT,
      };
    }

    const [existing, isPro] = await Promise.all([
      ctx.db
        .query("aiUsage")
        .withIndex("by_userId_month", (q) =>
          q.eq("userId", user._id).eq("month", month),
        )
        .unique(),
      hasActiveProEntitlement(ctx, user._id),
    ]);
    const count = existing?.count ?? 0;
    const limit = aiMonthlyRequestLimit(isPro);

    return {
      count,
      remaining: Math.max(0, limit - count),
      limit,
      month,
      isPro,
      proLimit: AI_PRO_MONTHLY_REQUEST_LIMIT,
    };
  },
});

export const consumeMonthlyQuota = internalMutation({
  args: {
    userId: v.string(),
    source: v.union(
      v.literal("progress_metrics"),
      v.literal("workout_preset"),
      v.literal("workout_log"),
      v.literal("food_snap"),
      v.literal("form_coach"),
    ),
  },
  handler: async (ctx, args): Promise<AiUsageQuota> => {
    const month = utcMonthKey();
    const [existing, isPro] = await Promise.all([
      ctx.db
        .query("aiUsage")
        .withIndex("by_userId_month", (q) =>
          q.eq("userId", args.userId).eq("month", month),
        )
        .unique(),
      hasActiveProEntitlement(ctx, args.userId),
    ]);
    const limit = aiMonthlyRequestLimit(isPro);
    const cost = aiUsageCost(args.source);
    const count = existing?.count ?? 0;

    // Rejected rather than clamped: a request that cannot be paid for in full
    // must not run at all, or a user with one left would get a two-cost
    // analysis for the price of one.
    if (count + cost > limit) {
      return {
        allowed: false,
        count,
        remaining: Math.max(0, limit - count),
        limit,
        month,
        isPro,
        proLimit: AI_PRO_MONTHLY_REQUEST_LIMIT,
      };
    }

    const nextCount = count + cost;
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: nextCount,
        lastSource: args.source,
        updatedAt,
      });
    } else {
      await ctx.db.insert("aiUsage", {
        userId: args.userId,
        month,
        count: nextCount,
        lastSource: args.source,
        updatedAt,
      });
    }

    return {
      allowed: true,
      count: nextCount,
      remaining: Math.max(0, limit - nextCount),
      limit,
      month,
      isPro,
      proLimit: AI_PRO_MONTHLY_REQUEST_LIMIT,
    };
  },
});

const USAGE_RESET_MIGRATION = "aiUsage:reset-for-tiered-limits";
const USAGE_RESET_BATCH_SIZE = 100;

/**
 * Clears every account's current AI usage counter exactly once.
 *
 * The monthly limit moved from a flat 150 to 10 free / 500 Pro. Without this,
 * a free user who had already spent more than 10 requests this month would be
 * locked out the moment the new limits deployed, through no action of theirs.
 *
 * Guarded by a marker row, so re-running it is a no-op rather than a way to
 * hand everyone a fresh allowance mid-month.
 */
export const resetMonthlyUsageOnce = internalMutation({
  args: {
    force: v.optional(v.boolean()),
    clearedSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const marker = await ctx.db
      .query("migrationRuns")
      .withIndex("by_name", (q) => q.eq("name", USAGE_RESET_MIGRATION))
      .unique();

    if (marker && !args.force) {
      return {
        alreadyRan: true,
        ranAt: marker.ranAt,
        cleared: 0,
      };
    }

    const rows = await ctx.db.query("aiUsage").take(USAGE_RESET_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);

    const cleared = (args.clearedSoFar ?? 0) + rows.length;
    if (rows.length === USAGE_RESET_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.ai.usage.resetMonthlyUsageOnce, {
        force: args.force,
        clearedSoFar: cleared,
      });
      return {
        alreadyRan: false,
        ranAt: null,
        cleared,
        continuing: true,
      };
    }

    const ranAt = Date.now();
    const detail = `Cleared ${cleared} aiUsage rows`;
    if (marker) {
      await ctx.db.patch(marker._id, { ranAt, detail });
    } else {
      await ctx.db.insert("migrationRuns", {
        name: USAGE_RESET_MIGRATION,
        ranAt,
        detail,
      });
    }

    return { alreadyRan: false, ranAt, cleared, continuing: false };
  },
});

export async function consumeAiUsageOrThrow(
  ctx: ActionCtx,
  userId: string,
  source: AiUsageSource,
) {
  const quota: AiUsageQuota = await ctx.runMutation(
    internal.ai.usage.consumeMonthlyQuota,
    { userId, source },
  );

  if (!quota.allowed) {
    const cost = aiUsageCost(source);
    // Saying "limit reached" to someone staring at a remaining count above zero
    // reads as a bug, so a request too expensive for what is left says so.
    const reason =
      quota.remaining > 0
        ? `This one costs ${cost} of your monthly AI requests and you have ${quota.remaining} left`
        : `Monthly AI request limit reached (${quota.limit}/month${quota.isPro ? "" : " on the free plan"})`;

    throw new Error(
      quota.isPro
        ? `${reason}. Try again next month.`
        : `${reason}. Upgrade to OneRep Pro for ${AI_PRO_MONTHLY_REQUEST_LIMIT} a month, or try again next month.`,
    );
  }

  return quota;
}
