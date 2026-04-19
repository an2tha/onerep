import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";
import { calculateCalories } from "../lib/calculateCalories";
import { estimateOnboardingCalories } from "../lib/estimateOnboardingCalories";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function requireUser(ctx: any) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;
    return await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const syncTimezone = mutation({
  args: { timeZone: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (!isValidTimeZone(args.timeZone)) {
      return { timeZone: "UTC" };
    }

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastActiveTimezone: args.timeZone,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: args.timeZone,
        updatedAt: Date.now(),
      });
    }

    return { timeZone: args.timeZone };
  },
});

export const setBodyReminder = mutation({
  args: {
    enabled: v.boolean(),
    hour: v.number(),
    minute: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        bodyReminder: args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        bodyReminder: args,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setCustomMealCategories = mutation({
  args: {
    categories: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        color: v.string(),
        bg: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        customMealCategories: args.categories,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        customMealCategories: args.categories,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setDashboardSettings = mutation({
  args: {
    workoutFocus: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        dashboardSettings: args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        dashboardSettings: args,
        updatedAt: Date.now(),
      });
    }
  },
});
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const setWeightUnit = mutation({
  args: { unit: v.union(v.literal("kg"), v.literal("lbs")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        weightUnit: args.unit,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        weightUnit: args.unit,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setWaterGoal = mutation({
  args: { goalMl: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        waterGoalMl: args.goalMl,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        waterGoalMl: args.goalMl,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setCustomGoals = mutation({
  args: {
    calories: v.optional(v.number()),
    protein: v.optional(v.number()),
    carbs: v.optional(v.number()),
    fat: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const customGoals = {
      ...(existing?.customGoals ?? {}),
      ...args,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        customGoals,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        customGoals,
        updatedAt: Date.now(),
      });
    }
  },
});

export const getEffectiveGoals = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;

    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const customGoals = prefs?.customGoals;

    const healthProfile = await ctx.db
      .query("healthProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const onboarding = await ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    let healthGoals: {
      calories: number
      protein: number
      carbs: number
      fat: number
    } | null = null

    if (healthProfile) {
      healthGoals = calculateCalories(healthProfile)
    } else if (onboarding) {
      healthGoals = estimateOnboardingCalories(onboarding)
    }

    return {
      custom: customGoals ?? null,
      health: healthGoals,
      effective: {
        calories: customGoals?.calories ?? healthGoals?.calories ?? 2000,
        protein: customGoals?.protein ?? healthGoals?.protein ?? 150,
        carbs: customGoals?.carbs ?? healthGoals?.carbs ?? 200,
        fat: customGoals?.fat ?? healthGoals?.fat ?? 65,
      },
    }
  },
})
