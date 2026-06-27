import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const mealPresetBodyArgs = {
  name: v.string(),
  meal: v.string(),
  signature: v.string(),
  entries: v.array(v.any()),
};

// ── list ──────────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("mealPresets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);

    return docs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

// ── create ────────────────────────────────────────────────────────────────────

export const create = mutation({
  args: mealPresetBodyArgs,
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("mealPresets")
      .withIndex("by_userId_meal_and_signature", (q) =>
        q
          .eq("userId", user._id)
          .eq("meal", args.meal)
          .eq("signature", args.signature),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        entries: args.entries,
        updatedAt: now,
      });
      return { id: existing._id };
    }

    const id = await ctx.db.insert("mealPresets", {
      userId: user._id,
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("mealPresets") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const preset = await ctx.db.get(args.id);

    if (!preset || preset.userId !== user._id) {
      throw new Error("Meal preset not found or access denied");
    }

    await ctx.db.delete(args.id);
  },
});
