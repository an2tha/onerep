import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";
import { calculateCalories } from "../lib/calculateCalories";
import { estimateOnboardingCalories } from "../lib/estimateOnboardingCalories";
import { deleteUserDataBatch } from "../lib/deleteUserData";

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

    if (args.goalMl <= 0) {
      throw new Error("water goal must be a positive number");
    }

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

export const setWidgetLayout = mutation({
  args: {
    layout: v.array(
      v.object({
        id: v.string(),
        size: v.union(v.literal("full"), v.literal("small")),
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
        widgetLayout: args.layout,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        widgetLayout: args.layout,
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

export const setMacroCycling = mutation({
  args: {
    enabled: v.boolean(),
    targets: v.optional(
      v.object({
        restDay: v.object({
          calories: v.number(),
          protein: v.number(),
          carbs: v.number(),
          fat: v.number(),
        }),
        trainingDay: v.object({
          calories: v.number(),
          protein: v.number(),
          carbs: v.number(),
          fat: v.number(),
        }),
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
        macroCyclingEnabled: args.enabled,
        macroCyclingTargets: args.targets ?? existing.macroCyclingTargets,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        macroCyclingEnabled: args.enabled,
        macroCyclingTargets: args.targets,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setWorkoutAdjustment = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        workoutAdjustmentEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        workoutAdjustmentEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    }
  },
});

const reminderValidator = v.object({
  enabled: v.boolean(),
  hour: v.number(),
  minute: v.number(),
});

export const setPushReminders = mutation({
  args: {
    reminders: v.object({
      water: reminderValidator,
      meal: reminderValidator,
      workout: reminderValidator,
      body: reminderValidator,
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        pushReminders: args.reminders,
        bodyReminder: args.reminders.body,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        pushReminders: args.reminders,
        bodyReminder: args.reminders.body,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setPrivacySettings = mutation({
  args: {
    analyticsEnabled: v.boolean(),
    personalizedInsightsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        privacySettings: args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        privacySettings: args,
        updatedAt: Date.now(),
      });
    }
  },
});

export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");


    const [
      preferences,
      recipes,
      onboardingProfiles,
      healthProfiles,
      presets,
      schedules,
      workoutLogs,
      foodLogs,
      waterLogs,
      bodyMeasurements,
      dailyCheckIns,
      activeWorkouts,
      customExercises,
    ] = await Promise.all([
      ctx.db.query("userPreferences").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("recipes").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("onboardingProfiles").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("healthProfiles").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("presets").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("schedules").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("workoutLogs").withIndex("by_userId_date", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("foodLogs").withIndex("by_userId_date", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("waterLogs").withIndex("by_userId_date", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("bodyMeasurements").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("dailyCheckIns").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("activeWorkouts").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
      ctx.db.query("exercises").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect(),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user._id,
        email: user.email ?? null,
        name: user.name ?? null,
      },
      data: {
        preferences,
        recipes,
        onboardingProfiles,
        healthProfiles,
        presets,
        schedules,
        workoutLogs,
        foodLogs,
        waterLogs,
        bodyMeasurements,
        dailyCheckIns,
        activeWorkouts,
        customExercises,
      },
    };
  },
});

export const deleteMyDataBatch = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await deleteUserDataBatch(ctx, user._id, args.batchSize ?? 100);
  },
});

export const getEffectiveGoals = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
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
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      bmr: number;
      tdee: number;
      source: "healthProfile" | "onboarding";
    } | null = null;

    if (healthProfile) {
      const result = calculateCalories(healthProfile);
      healthGoals = {
        calories: result.targetCalories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        bmr: result.bmr,
        tdee: result.tdee,
        source: "healthProfile",
      };
    } else if (onboarding) {
      const result = estimateOnboardingCalories(onboarding);
      healthGoals = {
        calories: result.targetCalories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        bmr: result.bmr,
        tdee: result.tdee,
        source: "onboarding",
      };
    }

    let effective = {
      calories: customGoals?.calories ?? healthGoals?.calories ?? 2000,
      protein: customGoals?.protein ?? healthGoals?.protein ?? 150,
      carbs: customGoals?.carbs ?? healthGoals?.carbs ?? 200,
      fat: customGoals?.fat ?? healthGoals?.fat ?? 65,
    };

    // 1. Handle Macro Cycling
    const isTrainingDay = args.date
      ? await ctx.db
          .query("workoutLogs")
          .withIndex("by_userId_date", (q) =>
            q.eq("userId", user._id).eq("date", args.date!),
          )
          .unique()
          .then((l) => !!l)
      : false;

    if (prefs?.macroCyclingEnabled && prefs.macroCyclingTargets) {
      const target = isTrainingDay
        ? prefs.macroCyclingTargets.trainingDay
        : prefs.macroCyclingTargets.restDay;
      effective = { ...target };
    }

    // 2. Handle Workout Adjustment
    let burnedCalories = 0;
    if (prefs?.workoutAdjustmentEnabled && args.date) {
      const log = await ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", user._id).eq("date", args.date!),
        )
        .unique();

      if (log) {
        // MET (5) * weight_kg * duration_hours
        const weightKg = healthProfile?.weightKg ?? 75;
        const hours = (log.durationSeconds || 0) / 3600;
        burnedCalories = Math.round(5 * weightKg * hours);
        effective.calories += burnedCalories;
      }
    }

    return {
      custom: customGoals ?? null,
      health: healthGoals,
      effective,
      burnedCalories,
      isTrainingDay,
      macroCyclingEnabled: !!prefs?.macroCyclingEnabled,
      workoutAdjustmentEnabled: !!prefs?.workoutAdjustmentEnabled,
    };
  },
});
