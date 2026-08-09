import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

/** Nobody is training thirteen times a week, and nobody is aiming for zero. */
const MIN_SESSIONS = 1;
const MAX_SESSIONS = 12;

/**
 * The last handful of weekly targets, newest first.
 *
 * The report needs two of them — the target set for the week being reported
 * on, and whatever is already set for the week ahead — so it asks for a few
 * rather than making two round trips.
 */
export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("weeklyTargets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(8);

    return rows.map((row) => ({
      weekKey: row.weekKey,
      sessions: row.sessions,
      updatedAt: row.updatedAt,
    }));
  },
});

/** Sets, or changes, the number of sessions the user is aiming at. */
export const set = mutation({
  args: { weekKey: v.string(), sessions: v.number() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const sessions = Math.round(args.sessions);
    if (
      !Number.isFinite(sessions) ||
      sessions < MIN_SESSIONS ||
      sessions > MAX_SESSIONS
    ) {
      throw new Error("That is not a week anybody trains.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("weeklyTargets")
      .withIndex("by_userId_and_week", (q) =>
        q.eq("userId", user._id).eq("weekKey", args.weekKey),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { sessions, updatedAt: now });
      return { ok: true };
    }

    await ctx.db.insert("weeklyTargets", {
      userId: user._id,
      weekKey: args.weekKey,
      sessions,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

/** Takes the commitment back, for the week that turned out differently. */
export const clear = mutation({
  args: { weekKey: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const existing = await ctx.db
      .query("weeklyTargets")
      .withIndex("by_userId_and_week", (q) =>
        q.eq("userId", user._id).eq("weekKey", args.weekKey),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});
