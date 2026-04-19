import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

// ── getDay ────────────────────────────────────────────────────────────────────

export const getDay = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return [];

    const doc = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    return doc?.entries ?? [];
  },
});

// ── setDay ────────────────────────────────────────────────────────────────────

export const setDay = mutation({
  args: {
    date: v.string(),
    entries: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        entries: args.entries,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("waterLogs", {
        userId: user._id,
        date: args.date,
        entries: args.entries,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});
