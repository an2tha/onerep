import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

// ── get ───────────────────────────────────────────────────────────────────────

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("schedules")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

// ── set ───────────────────────────────────────────────────────────────────────

export const set = mutation({
  args: {
    routine: v.any(),
    presetOrder: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        routine: args.routine,
        presetOrder: args.presetOrder,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("schedules", {
        userId: user._id,
        routine: args.routine,
        presetOrder: args.presetOrder,
        updatedAt: now,
      });
    }
  },
});
