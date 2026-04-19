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
      .query("foodLogs")
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
    entries: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        calories: v.number(),
        protein: v.number(),
        carbs: v.number(),
        fat: v.number(),
        meal: v.string(),
        loggedAt: v.string(),
        // Optional micronutrients
        fiber: v.optional(v.number()),
        sugar: v.optional(v.number()),
        saturatedFat: v.optional(v.number()),
        transFat: v.optional(v.number()),
        cholesterol: v.optional(v.number()),
        sodium: v.optional(v.number()),
        potassium: v.optional(v.number()),
        calcium: v.optional(v.number()),
        iron: v.optional(v.number()),
        magnesium: v.optional(v.number()),
        phosphorus: v.optional(v.number()),
        zinc: v.optional(v.number()),
        vitaminC: v.optional(v.number()),
        vitaminA: v.optional(v.number()),
        vitaminD: v.optional(v.number()),
        vitaminB12: v.optional(v.number()),
        caffeine: v.optional(v.number()),
        alcohol: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("foodLogs")
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
      await ctx.db.insert("foodLogs", {
        userId: user._id,
        date: args.date,
        entries: args.entries,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});