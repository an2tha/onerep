import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

/** A stretch marked in one go. Longer than this is a hiatus, not a rest. */
const MAX_RANGE = 31;

/**
 * Rest days, newest first, back to `since`.
 *
 * The lapse nudge is the only caller today: without this it reads a planned
 * deload as a user quietly falling off, and says so.
 */
export const listSince = query({
  args: { since: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("restDays")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", user._id).gte("date", args.since),
      )
      .collect();

    return rows.map((row) => row.date);
  },
});

/** Marks one or more days as deliberate rest. Marking twice is a no-op. */
export const mark = mutation({
  args: {
    dates: v.array(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();
    const source = args.source ?? "manual";

    const dates = [...new Set(args.dates)].slice(0, MAX_RANGE);
    let marked = 0;

    for (const date of dates) {
      const existing = await ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).eq("date", date),
        )
        .unique();
      if (existing) continue;

      await ctx.db.insert("restDays", {
        userId: user._id,
        date,
        source,
        createdAt: now,
      });
      marked++;
    }

    return { marked };
  },
});

/** Undoes the above, for the day the user changed their mind about. */
export const unmark = mutation({
  args: { dates: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    let removed = 0;
    for (const date of [...new Set(args.dates)].slice(0, MAX_RANGE)) {
      const existing = await ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).eq("date", date),
        )
        .unique();
      if (!existing) continue;
      await ctx.db.delete(existing._id);
      removed++;
    }

    return { removed };
  },
});
