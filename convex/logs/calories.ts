import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";
import { calculateCalories, type CaloricGoals } from "../lib/calculateCalories";
import { estimateOnboardingCalories } from "../lib/estimateOnboardingCalories";

const healthProfileArgs = {
  sex: v.union(v.literal("male"), v.literal("female")),
  age: v.number(),
  weightKg: v.number(),
  heightCm: v.number(),
  activityLevel: v.union(
    v.literal("sedentary"),
    v.literal("lightly_active"),
    v.literal("moderately_active"),
    v.literal("very_active"),
    v.literal("extra_active"),
  ),
  goal: v.union(v.literal("lose"), v.literal("maintain"), v.literal("gain")),
};

// ── getGoals ──────────────────────────────────────────────────────────────────

export const getGoals = query({
  args: {},
  handler: async (ctx): Promise<CaloricGoals | null> => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;

    const profile = await ctx.db
      .query("healthProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (profile) return calculateCalories(profile);

    const onboarding = await ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!onboarding) return null;
    return estimateOnboardingCalories(onboarding);
  },
});

// ── setProfile ────────────────────────────────────────────────────────────────

export const setProfile = mutation({
  args: healthProfileArgs,
  handler: async (ctx, args): Promise<CaloricGoals> => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("healthProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("healthProfiles", {
        userId: user._id,
        ...args,
        updatedAt: now,
      });
    }

    return calculateCalories(args);
  },
});

// ── calculate (pure, no db) ───────────────────────────────────────────────────

export const calculate = query({
  args: healthProfileArgs,
  handler: (_, args): CaloricGoals => calculateCalories(args),
});
