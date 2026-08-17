import { v } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import {
  clampRangeToScope,
  NO_ACCESS_MESSAGE,
  resolveDiaryOwner,
  safeResolveDiaryOwner,
} from "../lib/diaryAccess";

const MAX_RANGE_DAYS = 400;

/**
 * Read-only views of another user's diary.
 *
 * Deliberately separate from `convex/logs/foodLogs.ts`: the owner's queries
 * keep their existing `userId === user._id` filter and their signatures, so the
 * security review for sharing is a diff of this directory plus diaryAccess.ts.
 */

async function readFoodDay(ctx: QueryCtx, userId: string, date: string) {
  return await ctx.db
    .query("foodLogs")
    .withIndex("by_userId_date", (q) => q.eq("userId", userId).eq("date", date))
    .unique();
}

export const getSharedDay = query({
  args: { ownerUserId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const access = await resolveDiaryOwner(ctx, {
      ownerUserId: args.ownerUserId,
    });
    if (!access.canReadDiary) throw new Error(NO_ACCESS_MESSAGE);
    // A single out-of-window day is a hard error rather than an empty result:
    // silently returning nothing would read as "they logged nothing that day".
    if (!access.isOwner) {
      if (access.startDate && args.date < access.startDate) {
        throw new Error(NO_ACCESS_MESSAGE);
      }
      if (access.endDate && args.date > access.endDate) {
        throw new Error(NO_ACCESS_MESSAGE);
      }
    }

    const doc = await readFoodDay(ctx, access.ownerUserId, args.date);
    return doc ? { date: doc.date, entries: doc.entries ?? [] } : null;
  },
});

export const getSharedRange = query({
  args: { ownerUserId: v.string(), start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    const access = await resolveDiaryOwner(ctx, {
      ownerUserId: args.ownerUserId,
    });
    if (!access.canReadReport && !access.canReadDiary) {
      throw new Error(NO_ACCESS_MESSAGE);
    }

    // Clamped, not rejected: a viewer asking for more than their window gets
    // their window, never a day outside it.
    const window = clampRangeToScope(access, args.start, args.end);
    if (window.empty) return [];

    const docs = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q
          .eq("userId", access.ownerUserId)
          .gte("date", window.start)
          .lte("date", window.end),
      )
      .take(MAX_RANGE_DAYS);

    return docs.map((doc) => ({ date: doc.date, entries: doc.entries ?? [] }));
  },
});

/** The owner's calorie and macro targets, so a shared report has a baseline. */
export const getSharedGoals = query({
  args: { ownerUserId: v.string() },
  handler: async (ctx, args) => {
    const access = await resolveDiaryOwner(ctx, {
      ownerUserId: args.ownerUserId,
    });
    if (!access.canReadDiary && !access.canReadReport) {
      throw new Error(NO_ACCESS_MESSAGE);
    }

    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", access.ownerUserId))
      .unique();

    // Only the four targets — not the health profile behind them, which would
    // leak weight, height and age to a viewer who was granted diary access.
    return {
      calories: prefs?.customGoals?.calories ?? 2000,
      protein: prefs?.customGoals?.protein ?? 150,
      carbs: prefs?.customGoals?.carbs ?? 200,
      fat: prefs?.customGoals?.fat ?? 65,
      netCarbsEnabled: !!prefs?.netCarbsEnabled,
    };
  },
});

/**
 * Just enough to title the viewer's screen.
 *
 * Returns null rather than throwing when there is no grant: this is the query
 * the day view gates everything else on, and a revoked or mistyped link should
 * land on a "no longer shared" state, not the error boundary.
 */
export const getSharedProfile = query({
  args: { ownerUserId: v.string() },
  handler: async (ctx, args) => {
    const access = await safeResolveDiaryOwner(ctx, {
      ownerUserId: args.ownerUserId,
    });
    if (!access) return null;
    return {
      ownerUserId: access.ownerUserId,
      name: access.share?.ownerName,
      email: access.share?.ownerEmail,
      scope: access.share?.scope ?? {
        diary: true,
        report: true,
        comments: true,
      },
      startDate: access.startDate,
      endDate: access.endDate,
    };
  },
});
