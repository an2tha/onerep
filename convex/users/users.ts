import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { calculateCalories } from "../lib/calculateCalories";
import { estimateOnboardingCalories } from "../lib/estimateOnboardingCalories";
import { deleteUserDataBatch } from "../lib/deleteUserData";
import { getLatestOnboardingProfile } from "../lib/onboardingProfiles";
import { buildNutritionPlan } from "../lib/nutritionPlan";

// ── Auth helper ───────────────────────────────────────────────────────────────

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return safeGetAuthUser(ctx);
  },
});

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
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
    const timeZone = isValidTimeZone(args.timeZone) ? args.timeZone : "UTC";
    const user = await safeGetAuthUser(ctx);
    if (!user) return { timeZone };

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastActiveTimezone: timeZone,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: timeZone,
        updatedAt: Date.now(),
      });
    }

    return { timeZone };
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
    simpleMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        dashboardSettings: {
          ...args,
          trendMetric: existing.dashboardSettings?.trendMetric,
          simpleMode: args.simpleMode ?? existing.dashboardSettings?.simpleMode,
        },
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

export const setDashboardTrendMetric = mutation({
  args: {
    metric: v.union(
      v.literal("bodyFatPct"),
      v.literal("waistCm"),
      v.literal("chestCm"),
      v.literal("armsCm"),
      v.literal("thighsCm"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const dashboardSettings = {
      workoutFocus: existing?.dashboardSettings?.workoutFocus ?? "strength",
      trendMetric: args.metric,
      simpleMode: existing?.dashboardSettings?.simpleMode,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        dashboardSettings,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        dashboardSettings,
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

export const setFoodSearchLanguage = mutation({
  args: {
    language: v.union(
      v.literal("en"),
      v.literal("es"),
      v.literal("fr"),
      v.literal("de"),
      v.literal("it"),
      v.literal("pt"),
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
        foodSearchLanguage: args.language,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        foodSearchLanguage: args.language,
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
      supplement: v.optional(reminderValidator),
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
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const [
      preferences,
      recipes,
      mealPresets,
      onboardingProfiles,
      healthProfiles,
      presets,
      schedules,
      workoutLogs,
      foodLogs,
      waterLogs,
      supplementLogs,
      supplementItems,
      supplementIntakeLogs,
      bodyMeasurements,
      dailyCheckIns,
      coachMemories,
      coachCheckIns,
      coachActionEvents,
      coachWeeklyPlans,
      coachGoals,
      coachGoalTasks,
      coachUploads,
      aiUsage,
      snapUsage,
      activeWorkouts,
      customExercises,
    ] = await Promise.all([
      ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("recipes")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("mealPresets")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("onboardingProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("healthProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("presets")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("schedules")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("foodLogs")
        .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("waterLogs")
        .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("supplementLogs")
        .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("supplementItems")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("supplementIntakeLogs")
        .withIndex("by_userId_and_date", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("bodyMeasurements")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("dailyCheckIns")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachMemories")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachCheckIns")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachActionEvents")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachWeeklyPlans")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachGoals")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachGoalTasks")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachUploads")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("aiUsage")
        .withIndex("by_userId_month", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("snapUsage")
        .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("activeWorkouts")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("exercises")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
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
        mealPresets,
        onboardingProfiles,
        healthProfiles,
        presets,
        schedules,
        workoutLogs,
        foodLogs,
        waterLogs,
        supplementLogs,
        supplementItems,
        supplementIntakeLogs,
        bodyMeasurements,
        dailyCheckIns,
        coachMemories,
        coachCheckIns,
        coachActionEvents,
        coachWeeklyPlans,
        coachGoals,
        coachGoalTasks,
        coachUploads,
        aiUsage,
        snapUsage,
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
    const user = await safeGetAuthUser(ctx);
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

    const onboarding = await getLatestOnboardingProfile(ctx, user._id);

    let healthGoals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      bmr: number;
      tdee: number;
      fiber?: number;
      saturatedFatLimit?: number;
      sodiumLimit?: number;
      calorieStrategy?: string;
      safetyMode?: string;
      trackingMode?: string;
      guidance?: string[];
      source: "healthProfile" | "onboarding";
    } | null = null;

    if (healthProfile) {
      const result = calculateCalories(healthProfile, onboarding);
      healthGoals = {
        calories: result.targetCalories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        bmr: result.bmr,
        tdee: result.tdee,
        fiber: result.fiber,
        saturatedFatLimit: result.saturatedFatLimit,
        sodiumLimit: result.sodiumLimit,
        calorieStrategy: result.calorieStrategy,
        safetyMode: result.safetyMode,
        trackingMode: result.trackingMode,
        guidance: result.guidance,
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
        fiber: result.fiber,
        saturatedFatLimit: result.saturatedFatLimit,
        sodiumLimit: result.sodiumLimit,
        calorieStrategy: result.calorieStrategy,
        safetyMode: result.safetyMode,
        trackingMode: result.trackingMode,
        guidance: result.guidance,
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
    const workoutLogs = args.date
      ? await ctx.db
          .query("workoutLogs")
          .withIndex("by_userId_date", (q) =>
            q.eq("userId", user._id).eq("date", args.date!),
          )
          .take(2)
      : [];
    const isTrainingDay = workoutLogs.length > 0;

    if (prefs?.macroCyclingEnabled && prefs.macroCyclingTargets) {
      const target = isTrainingDay
        ? prefs.macroCyclingTargets.trainingDay
        : prefs.macroCyclingTargets.restDay;
      effective = { ...target };
    }

    // 2. Handle Workout Adjustment
    let burnedCalories = 0;
    if (workoutLogs.length > 0) {
      // Conservative general-training estimate: MET (5) * kg * hours.
      const weightKg = healthProfile?.weightKg ?? 75;
      const durationSeconds = workoutLogs.reduce(
        (total, log) => total + Math.max(0, log.durationSeconds),
        0,
      );
      const hours = durationSeconds / 3600;
      burnedCalories = Math.round(5 * weightKg * hours);
      if (prefs?.workoutAdjustmentEnabled) {
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

export const getNutritionPlan = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    const date = args.date ?? "9999-12-31";
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const customGoals = prefs?.customGoals;
    const healthProfile = await ctx.db
      .query("healthProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const onboarding = await getLatestOnboardingProfile(ctx, user._id);

    let healthGoals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      bmr: number;
      tdee: number;
      fiber?: number;
      saturatedFatLimit?: number;
      sodiumLimit?: number;
      calorieStrategy?: string;
      safetyMode?: string;
      trackingMode?: string;
      guidance?: string[];
      source: "healthProfile" | "onboarding";
    } | null = null;

    if (healthProfile) {
      const result = calculateCalories(healthProfile, onboarding);
      healthGoals = {
        calories: result.targetCalories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        bmr: result.bmr,
        tdee: result.tdee,
        fiber: result.fiber,
        saturatedFatLimit: result.saturatedFatLimit,
        sodiumLimit: result.sodiumLimit,
        calorieStrategy: result.calorieStrategy,
        safetyMode: result.safetyMode,
        trackingMode: result.trackingMode,
        guidance: result.guidance,
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
        fiber: result.fiber,
        saturatedFatLimit: result.saturatedFatLimit,
        sodiumLimit: result.sodiumLimit,
        calorieStrategy: result.calorieStrategy,
        safetyMode: result.safetyMode,
        trackingMode: result.trackingMode,
        guidance: result.guidance,
        source: "onboarding",
      };
    }

    const effective = {
      calories: customGoals?.calories ?? healthGoals?.calories ?? 2000,
      protein: customGoals?.protein ?? healthGoals?.protein ?? 150,
      carbs: customGoals?.carbs ?? healthGoals?.carbs ?? 200,
      fat: customGoals?.fat ?? healthGoals?.fat ?? 65,
    };

    const [foodLogs, bodyMeasurements, workoutLogs, recipes, mealPresets] =
      await Promise.all([
        ctx.db
          .query("foodLogs")
          .withIndex("by_userId_date", (q) =>
            q.eq("userId", user._id).lte("date", date),
          )
          .order("desc")
          .take(21),
        ctx.db
          .query("bodyMeasurements")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect(),
        ctx.db
          .query("workoutLogs")
          .withIndex("by_userId_date", (q) =>
            q.eq("userId", user._id).lte("date", date),
          )
          .order("desc")
          // Keep roughly three weeks of training-day context now that a day
          // can contain two independently logged sessions.
          .take(42),
        ctx.db
          .query("recipes")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(10),
        ctx.db
          .query("mealPresets")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(10),
      ]);

    return buildNutritionPlan({
      effective,
      health: healthGoals,
      onboarding,
      foodLogs,
      bodyMeasurements,
      workoutLogs,
      recipes,
      mealPresets,
    });
  },
});

export const applyNutritionCalibration = mutation({
  args: {
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const customGoals = {
      calories: Math.round(args.calories),
      protein: Math.round(args.protein),
      carbs: Math.round(args.carbs),
      fat: Math.round(args.fat),
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

    return customGoals;
  },
});
