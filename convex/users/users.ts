import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { calculateCalories } from "../lib/calculateCalories";
import { estimateOnboardingCalories } from "../lib/estimateOnboardingCalories";
import { deleteUserDataBatch } from "../lib/deleteUserData";
import { getLatestOnboardingProfile } from "../lib/onboardingProfiles";
import {
  HEALTH_DIAL_KEYS,
  HEALTH_METRIC_KEYS,
} from "../lib/healthMetricCatalog";
import { getHealthProfile } from "../lib/healthProfiles";
import { buildNutritionPlan } from "../lib/nutritionPlan";
import { applyNutritionTargets } from "../lib/nutritionTargets";
import {
  DEFAULT_MEAL_IDS,
  DEFAULT_MEAL_SHARES,
  normalizeMealShares,
  resolveMealCalorieTargets,
} from "../lib/mealTargets";

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

/**
 * When this account first showed up, for the retention cohort.
 *
 * `userPreferences` is written on the first `syncTimezone`, which the app fires
 * on its first authenticated render — so the row's creation time is the first
 * session, which is what a retention curve actually wants to count from. The
 * auth identity carries no timestamp, and adding a second one to the schema
 * would mean two answers to the same question.
 *
 * Returns a millisecond epoch and nothing else. The client turns it into a
 * bucket before it goes anywhere.
 */
export const getSignupAt = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const preferences = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    return preferences?._creationTime ?? null;
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
      // Category ids only ever change here, so this is the one place a stored
      // per-meal budget can go stale. Re-normalise it against the new id set.
      const existingTargets = existing.mealCalorieTargets;
      const mealCalorieTargets = existingTargets
        ? {
            ...existingTargets,
            shares: normalizeMealShares(existingTargets.shares, [
              ...DEFAULT_MEAL_IDS,
              ...args.categories.map((category) => category.id),
            ]),
            updatedAt: Date.now(),
          }
        : undefined;

      await ctx.db.patch(existing._id, {
        customMealCategories: args.categories,
        ...(mealCalorieTargets ? { mealCalorieTargets } : {}),
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
    // Every measurable field on `bodyMeasurements`. Hips, calves, and neck were
    // loggable long before they were trendable.
    metric: v.union(
      v.literal("bodyFatPct"),
      v.literal("waistCm"),
      v.literal("hipsCm"),
      v.literal("chestCm"),
      v.literal("armsCm"),
      v.literal("thighsCm"),
      v.literal("calvesCm"),
      v.literal("neckCm"),
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

export const setEnergyUnit = mutation({
  args: {
    unit: v.union(v.literal("kcal"), v.literal("Cal"), v.literal("kJ")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        energyUnit: args.unit,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        energyUnit: args.unit,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Records what build the user is actually running. Called on launch and
 * whenever the active bundle changes, so a bug report can be matched against
 * the code that produced it instead of a guess.
 */
export const recordAppVersion = mutation({
  args: {
    appVersion: v.string(),
    bundleVersion: v.optional(v.string()),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const patch = {
      lastAppVersion: args.appVersion.slice(0, 64),
      lastBundleVersion: args.bundleVersion?.slice(0, 64),
      lastPlatform: args.platform.slice(0, 16),
      lastAppVersionAt: Date.now(),
    };

    if (existing) {
      // No updatedAt bump: this is telemetry about the client, not a
      // preference the user changed.
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
        ...patch,
      });
    }
  },
});

export const setShowCalorieNumbers = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        showCalorieNumbers: args.enabled,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        showCalorieNumbers: args.enabled,
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
        hidden: v.optional(v.boolean()),
        pinned: v.optional(v.boolean()),
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

/**
 * The whole daily target sheet in one write: calories, macros, water.
 *
 * Coach, MCP and the REST API all land here rather than each patching
 * `userPreferences` their own way, and every one of them needs the previous
 * values back — an undo that cannot tell "was 2,400" from "was never set"
 * restores a number the user never chose. Omitted fields are left alone;
 * passing null clears an override and hands the field back to the calculator.
 */
export const setNutritionTargets = mutation({
  args: {
    calories: v.optional(v.union(v.number(), v.null())),
    protein: v.optional(v.union(v.number(), v.null())),
    carbs: v.optional(v.union(v.number(), v.null())),
    fat: v.optional(v.union(v.number(), v.null())),
    waterMl: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await applyNutritionTargets(ctx, user._id, args);
  },
});

export const setMealCalorieTargets = mutation({
  args: {
    enabled: v.boolean(),
    shares: v.optional(
      v.array(
        v.object({
          meal: v.string(),
          percent: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const knownMeals = [
      ...DEFAULT_MEAL_IDS,
      ...(existing?.customMealCategories ?? []).map((category) => category.id),
    ];
    // Normalise on write so a client that sends 87% (or a stale category) can
    // never persist a budget that does not add up.
    const shares = normalizeMealShares(
      args.shares ??
        existing?.mealCalorieTargets?.shares ??
        DEFAULT_MEAL_SHARES,
      knownMeals,
    );

    const mealCalorieTargets = {
      enabled: args.enabled,
      shares,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        mealCalorieTargets,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        mealCalorieTargets,
        updatedAt: Date.now(),
      });
    }
  },
});

export const setNetCarbsEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        netCarbsEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        netCarbsEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * The ongoing workout notification on Android.
 *
 * Defaults on, but exposed because an Android ongoing notification sits in the
 * shade for the entire session — far more intrusive than the iOS Live Activity
 * it mirrors, and users will want to turn it off.
 */
export const setLiveWorkoutStatus = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        liveWorkoutStatusEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        liveWorkoutStatusEnabled: args.enabled,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Whether Coach may speak first, and when.
 *
 * Kept apart from `setPushReminders`: those are alarms the user set for
 * themselves, this is permission for the app to start a conversation. Merging
 * the two switches would mean silencing an unwanted Sunday review also
 * silences the 9am supplement reminder somebody actually wanted.
 */
export const setCoachOutreach = mutation({
  args: {
    enabled: v.boolean(),
    weeklyReview: v.boolean(),
    nudges: v.boolean(),
    quietHours: v.optional(
      v.object({ startMinutes: v.number(), endMinutes: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const clampMinutes = (value: number) =>
      Math.min(1439, Math.max(0, Math.trunc(value)));
    const coachOutreach = {
      enabled: args.enabled,
      weeklyReview: args.weeklyReview,
      nudges: args.nudges,
      ...(args.quietHours
        ? {
            quietHours: {
              startMinutes: clampMinutes(args.quietHours.startMinutes),
              endMinutes: clampMinutes(args.quietHours.endMinutes),
            },
          }
        : {}),
    };

    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        coachOutreach,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        coachOutreach,
        updatedAt: Date.now(),
      });
    }

    return coachOutreach;
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
      healthMetrics,
      dailyCheckIns,
      coachMemories,
      coachCheckIns,
      coachActionEvents,
      coachWeeklyPlans,
      coachMonthlySummaries,
      coachTouches,
      coachReviews,
      coachGoals,
      coachGoalTasks,
      coachUploads,
      aiUsage,
      snapUsage,
      activeWorkouts,
      customExercises,
      customFoods,
      mealPrepBatches,
      fastingSessions,
      groceryLists,
      diaryShares,
      diaryComments,
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
        .query("healthMetrics")
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
        .query("coachMonthlySummaries")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachTouches")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("coachReviews")
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
        .query("customExercises")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("customFoods")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("mealPrepBatches")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("fastingSessions")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("groceryLists")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect(),
      // Shares this account granted, and comments left on its diary.
      ctx.db
        .query("diaryShares")
        .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", user._id))
        .collect(),
      ctx.db
        .query("diaryComments")
        .withIndex("by_ownerUserId_and_createdAt", (q) =>
          q.eq("ownerUserId", user._id),
        )
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
        healthMetrics,
        dailyCheckIns,
        coachMemories,
        coachCheckIns,
        coachActionEvents,
        coachWeeklyPlans,
        coachMonthlySummaries,
        coachTouches,
        coachReviews,
        coachGoals,
        coachGoalTasks,
        coachUploads,
        aiUsage,
        snapUsage,
        activeWorkouts,
        customExercises,
        customFoods,
        mealPrepBatches,
        fastingSessions,
        groceryLists,
        diaryShares,
        diaryComments,
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

const PURGE_BATCH_SIZE = 100;

/**
 * Finish deleting an account's data after Better Auth has removed the login.
 *
 * Scheduled from the `afterDelete` hook in `convex/lib/auth.ts`, which is the
 * only caller and the only moment it is safe: the user row, its accounts and
 * its sessions are already gone by then, so there is no one left who could be
 * signed in to the rows this is about to remove.
 *
 * It has to run here rather than in the client, because the client loses its
 * session the instant the account goes and cannot finish what it started. The
 * old flow wiped the data first and asked Better Auth second, which meant a
 * failure at the second step — and for anyone signed in with Google or Apple,
 * that step failed every time — left the data destroyed and the login intact.
 * Now the login is the gate, and this is the part that cannot be interrupted:
 * a batch that finds more work reschedules itself, so the purge outlives the
 * request, the phone, and whatever the network was doing.
 */
export const purgeDeletedUserData = internalMutation({
  args: {
    userId: v.string(),
    deletedSoFar: v.optional(v.number()),
    passes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { deleted, remaining } = await deleteUserDataBatch(
      ctx,
      args.userId,
      PURGE_BATCH_SIZE,
    );
    const deletedSoFar = (args.deletedSoFar ?? 0) + deleted;
    const passes = (args.passes ?? 0) + 1;

    // A pass that clears nothing and still reports work left cannot be fixed
    // by running it again. Stopping loudly beats a mutation that reschedules
    // itself forever, one document short of done.
    if (remaining && deleted === 0) {
      throw new Error(
        `Purge for ${args.userId} stalled after ${passes} passes with ${deletedSoFar} rows deleted`,
      );
    }

    if (remaining) {
      await ctx.scheduler.runAfter(0, internal.users.users.purgeDeletedUserData, {
        userId: args.userId,
        deletedSoFar,
        passes,
      });
    }

    return { deleted: deletedSoFar, done: !remaining, passes };
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

    const healthProfile = await getHealthProfile(ctx, user._id);

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

    // 3. Per-meal calorie budget, resolved against the *final* calorie number
    // so it inherits macro cycling and the workout adjustment for free.
    const knownMeals = [
      ...DEFAULT_MEAL_IDS,
      ...(prefs?.customMealCategories ?? []).map((category) => category.id),
    ];
    const mealShares = normalizeMealShares(
      prefs?.mealCalorieTargets?.shares,
      knownMeals,
    );

    return {
      custom: customGoals ?? null,
      health: healthGoals,
      effective,
      burnedCalories,
      isTrainingDay,
      macroCyclingEnabled: !!prefs?.macroCyclingEnabled,
      workoutAdjustmentEnabled: !!prefs?.workoutAdjustmentEnabled,
      mealTargetsEnabled: !!prefs?.mealCalorieTargets?.enabled,
      mealTargets: resolveMealCalorieTargets(mealShares, effective.calories),
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
    const healthProfile = await getHealthProfile(ctx, user._id);
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

    const [foodLogs, bodyMeasurements, recipes, mealPresets] =
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
      recipes,
      mealPresets,
    });
  },
});

/**
 * Folds a partial switch change over what is already stored, dropping keys the
 * catalogue does not define so a typo or a stale client cannot park unreachable
 * entries in the document forever.
 */
function mergeHealthMetricSelection(
  stored: Record<string, boolean> | undefined,
  patch: Record<string, boolean> | undefined,
) {
  if (!patch) return stored;
  const merged: Record<string, boolean> = { ...(stored ?? {}) };
  for (const [key, enabled] of Object.entries(patch)) {
    if (!HEALTH_METRIC_KEYS.includes(key)) continue;
    merged[key] = enabled === true;
  }
  return merged;
}

function mergeDialSelection(
  stored: Record<string, boolean> | undefined,
  patch: Record<string, boolean> | undefined,
) {
  if (!patch) return stored;
  const merged: Record<string, boolean> = { ...(stored ?? {}) };
  for (const [key, enabled] of Object.entries(patch)) {
    if (!HEALTH_DIAL_KEYS.includes(key)) continue;
    merged[key] = enabled === true;
  }
  return merged;
}

export const setHealthSync = mutation({
  args: {
    healthSyncEnabled: v.optional(v.boolean()),
    autoSyncOnForeground: v.optional(v.boolean()),
    writeEnabled: v.optional(v.boolean()),
    /**
     * A partial patch, not a replacement: Settings sends the one switch that
     * moved. Sending the whole map would let a client built against an older
     * catalogue silently switch off metrics it had never heard of.
     */
    metrics: v.optional(v.record(v.string(), v.boolean())),
    /** Same partial-patch contract as `metrics`. */
    dials: v.optional(v.record(v.string(), v.boolean())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const enabled =
      args.healthSyncEnabled ??
      existing?.healthSync?.healthSyncEnabled ??
      existing?.healthSync?.appleHealthEnabled ??
      false;

    const healthSync = {
      // Dual-written during the rename. See the schema note on
      // userPreferences.healthSync.
      appleHealthEnabled: enabled,
      healthSyncEnabled: enabled,
      autoSyncOnForeground:
        args.autoSyncOnForeground ??
        existing?.healthSync?.autoSyncOnForeground ??
        true,
      writeEnabled:
        args.writeEnabled ?? existing?.healthSync?.writeEnabled ?? false,
      lastSyncedAt: existing?.healthSync?.lastSyncedAt,
      lastSyncError: existing?.healthSync?.lastSyncError,
      metrics: mergeHealthMetricSelection(
        existing?.healthSync?.metrics,
        args.metrics,
      ),
      dials: mergeDialSelection(existing?.healthSync?.dials, args.dials),
    };

    if (existing) {
      await ctx.db.patch(existing._id, { healthSync, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("userPreferences", {
        userId: user._id,
        lastActiveTimezone: "UTC",
        healthSync,
        updatedAt: Date.now(),
      });
    }
    return healthSync;
  },
});
