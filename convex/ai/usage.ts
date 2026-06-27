import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, query, type ActionCtx } from "../_generated/server";
import { safeGetAuthUser } from "../lib/auth";

export const AI_MONTHLY_REQUEST_LIMIT = 150;

const AI_USAGE_SOURCES = [
  "progress_metrics",
  "workout_preset",
  "food_snap",
] as const;

export type AiUsageSource = (typeof AI_USAGE_SOURCES)[number];

export type AiUsageQuota = {
  allowed: boolean;
  count: number;
  remaining: number;
  limit: number;
  month: string;
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
        remaining: AI_MONTHLY_REQUEST_LIMIT,
        limit: AI_MONTHLY_REQUEST_LIMIT,
        month,
      };
    }

    const existing = await ctx.db
      .query("aiUsage")
      .withIndex("by_userId_month", (q) =>
        q.eq("userId", user._id).eq("month", month),
      )
      .unique();
    const count = existing?.count ?? 0;

    return {
      count,
      remaining: Math.max(0, AI_MONTHLY_REQUEST_LIMIT - count),
      limit: AI_MONTHLY_REQUEST_LIMIT,
      month,
    };
  },
});

export const consumeMonthlyQuota = internalMutation({
  args: {
    userId: v.string(),
    source: v.union(
      v.literal("progress_metrics"),
      v.literal("workout_preset"),
      v.literal("food_snap"),
    ),
  },
  handler: async (ctx, args): Promise<AiUsageQuota> => {
    const month = utcMonthKey();
    const existing = await ctx.db
      .query("aiUsage")
      .withIndex("by_userId_month", (q) =>
        q.eq("userId", args.userId).eq("month", month),
      )
      .unique();

    if (existing && existing.count >= AI_MONTHLY_REQUEST_LIMIT) {
      return {
        allowed: false,
        count: existing.count,
        remaining: 0,
        limit: AI_MONTHLY_REQUEST_LIMIT,
        month,
      };
    }

    const nextCount = (existing?.count ?? 0) + 1;
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
      remaining: Math.max(0, AI_MONTHLY_REQUEST_LIMIT - nextCount),
      limit: AI_MONTHLY_REQUEST_LIMIT,
      month,
    };
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
    throw new Error(
      `Monthly AI request limit reached (${quota.limit}/month). Try again next month.`,
    );
  }

  return quota;
}
