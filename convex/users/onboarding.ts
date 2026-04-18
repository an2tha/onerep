import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

async function requireUser(ctx: any) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const save = mutation({
  args: {
    age: v.number(),
    heightCm: v.number(),
    goal: v.union(
      v.literal("lose"),
      v.literal("build"),
      v.literal("health"),
      v.literal("performance"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("onboardingProfiles", {
        userId: user._id,
        ...args,
        updatedAt: now,
      });
    }
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) await ctx.db.delete(existing._id);
  },
});
