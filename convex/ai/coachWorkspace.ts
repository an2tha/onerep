import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { listBodyMeasurements } from "../lib/bodyMeasurements";
import { listWaterDays } from "../lib/waterLogs";
import { listRecentFastingSessions } from "../lib/fastingSessions";
import { listSupplementIntakeWindow } from "../lib/supplementIntake";
import { listCustomMetricsWithEntries } from "../lib/customProgressMetrics";
import { getHealthProfile } from "../lib/healthProfiles";
import { getLatestOnboardingProfile } from "../lib/onboardingProfiles";
import { fitWorkspaceToBudget } from "../lib/coachWorkspaceBudget";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** How far back the behavioural windows reach. */
const WINDOW_DAYS = 14;
/** Per-preset and per-recipe list caps, applied before the size budget. */
const MAX_PRESET_ITEMS = 12;
const MAX_RECIPE_INGREDIENTS = 12;
const MAX_WORKOUT_EXERCISES = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shiftDate(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Condenses one logged exercise to what the model can reason about.
 *
 * `workoutLogs.exercises` is `v.any()` and carries every set of every exercise;
 * shipping it raw was the single largest unbounded field in the payload.
 */
function projectExercise(raw: unknown) {
  if (!isRecord(raw)) return null;
  const sets = Array.isArray(raw.sets) ? raw.sets : [];
  const completed = sets.filter(
    (set) => isRecord(set) && set.completed === true,
  );
  let topSet: { reps?: number; weight?: number } | undefined;
  for (const set of completed) {
    if (!isRecord(set)) continue;
    const weight = num(set.weight) ?? 0;
    if (!topSet || weight > (topSet.weight ?? 0)) {
      topSet = { reps: num(set.reps), weight: num(set.weight) };
    }
  }
  return {
    name: typeof raw.name === "string" ? raw.name : "Exercise",
    setCount: completed.length,
    ...(topSet ? { topSet } : {}),
  };
}

/**
 * Everything the coach knows about one user, at one point in time.
 *
 * Exported as a plain function so `loadForModel` stays a thin wrapper and the
 * shape can be unit-tested without the Convex function runtime.
 */
export async function buildCoachWorkspace(
  ctx: QueryCtx,
  args: { userId: string; today: string },
) {
  const since = shiftDate(args.today, -(WINDOW_DAYS - 1));

  const [
    presets,
    recipes,
    foodDays,
    memories,
    checkIns,
    goals,
    workouts,
    actions,
    schedule,
    metricsWithEntries,
    dashboardWidgets,
    supplements,
    preferences,
    bodyMeasurements,
    waterDays,
    fastingSessions,
    supplementIntake,
    healthProfile,
    onboarding,
  ] = await Promise.all([
    ctx.db
      .query("presets")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(40),
    ctx.db
      .query("recipes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", args.userId).lte("date", args.today),
      )
      .order("desc")
      .take(14),
    ctx.db
      .query("coachMemories")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(40),
    ctx.db
      .query("coachCheckIns")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(14),
    ctx.db
      .query("coachGoals")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .order("desc")
      .take(20),
    ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("coachActionEvents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("schedules")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique(),
    listCustomMetricsWithEntries(ctx, args.userId, WINDOW_DAYS),
    ctx.db
      .query("dashboardWidgets")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(24),
    ctx.db
      .query("supplementItems")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(40),
    ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique(),
    listBodyMeasurements(ctx, args.userId, 30),
    listWaterDays(ctx, args.userId, args.today, WINDOW_DAYS),
    listRecentFastingSessions(ctx, args.userId, WINDOW_DAYS),
    listSupplementIntakeWindow(ctx, args.userId, since, args.today),
    getHealthProfile(ctx, args.userId),
    getLatestOnboardingProfile(ctx, args.userId),
  ]);

  // Absent settings mean "on": that is what the Settings screen shows by
  // default, and silently degrading every existing user's coach would be worse
  // than the privacy gain.
  const personalized = preferences?.privacySettings?.personalizedInsightsEnabled ?? true;

  const presetNames = new Map(
    presets.map((preset) => [String(preset._id), preset.name]),
  );
  const routineRoot = isRecord(schedule?.routine) ? schedule.routine : {};
  const primary = isRecord(routineRoot.primary) ? routineRoot.primary : routineRoot;

  const goalsWithTasks = await Promise.all(
    goals.map(async (goal) => ({
      id: String(goal._id),
      title: goal.title,
      detail: goal.description,
      startDate: goal.startDate,
      endDate: goal.endDate,
      durationDays: goal.durationDays,
      pinned: goal.pinned,
      status: goal.status,
      tasks: (
        await ctx.db
          .query("coachGoalTasks")
          .withIndex("by_goalId_and_sortOrder", (q) => q.eq("goalId", goal._id))
          .take(12)
      ).map((task) => ({
        title: task.title,
        detail: task.detail,
        completed: task.completed,
      })),
    })),
  );

  // ── Behavioural sources, all gated ────────────────────────────────────────

  const bodyMeasurementsView = bodyMeasurements.map((entry) => ({
    date: entry.loggedAt,
    weightKg: entry.weightKg,
    bodyFatPct: entry.bodyFatPct,
    waistCm: entry.waistCm,
    hipsCm: entry.hipsCm,
    chestCm: entry.chestCm,
    armsCm: entry.armsCm,
    thighsCm: entry.thighsCm,
    calvesCm: entry.calvesCm,
    neckCm: entry.neckCm,
  }));

  const waterView = waterDays.map((day) => {
    const entries = Array.isArray(day.entries) ? day.entries : [];
    return {
      date: day.date,
      totalMl: entries.reduce(
        (total: number, entry: unknown) =>
          total + (isRecord(entry) ? (num(entry.amountMl) ?? 0) : 0),
        0,
      ),
      entryCount: entries.length,
    };
  });

  const fastingView = fastingSessions.map((session) => ({
    startDate: session.startDate,
    hours: session.endedAt
      ? Math.round(((session.endedAt - session.startedAt) / 3_600_000) * 10) / 10
      : null,
    protocol: session.protocol,
    completed: session.endedAt != null,
    endedEarly: session.endedEarly,
  }));

  const supplementNames = new Map(
    supplements.map((item) => [String(item._id), item.name]),
  );
  const adherenceByDate = new Map<string, { taken: number; skipped: number }>();
  const adherenceBySupplement = new Map<
    string,
    { name: string; taken: number; skipped: number; lastTaken?: string }
  >();
  for (const log of supplementIntake) {
    const day = adherenceByDate.get(log.date) ?? { taken: 0, skipped: 0 };
    const key = String(log.supplementId);
    const item = adherenceBySupplement.get(key) ?? {
      name: log.name ?? supplementNames.get(key) ?? "Supplement",
      taken: 0,
      skipped: 0,
    };
    if (log.status === "taken") {
      day.taken += 1;
      item.taken += 1;
      if (!item.lastTaken || log.date > item.lastTaken) item.lastTaken = log.date;
    } else {
      day.skipped += 1;
      item.skipped += 1;
    }
    adherenceByDate.set(log.date, day);
    adherenceBySupplement.set(key, item);
  }
  const supplementAdherence = {
    days: [...adherenceByDate.entries()]
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    bySupplement: [...adherenceBySupplement.values()]
      .sort((a, b) => b.taken + b.skipped - (a.taken + a.skipped))
      .slice(0, 12),
  };

  const progressMetricsView = metricsWithEntries.map((metric) => {
    const entries = metric.entries.map((entry) => ({
      date: entry.date,
      value: entry.value,
    }));
    return {
      id: String(metric._id),
      title: metric.title,
      description: metric.description,
      tab: metric.tab,
      kind: metric.kind,
      unit: metric.unit,
      target: metric.target,
      // Definitions were always loaded; the numbers never were, so the coach
      // could name a metric but not say how it was going.
      ...(personalized
        ? { latest: entries[0], entries: entries.slice(0, WINDOW_DAYS) }
        : {}),
    };
  });

  // Allergies and safety flags survive the privacy gate on purpose: they are
  // safety constraints, not personalization. Suppressing them would let the
  // model recommend food that can hurt someone.
  const safety = {
    allergies: onboarding?.allergies,
    safetyFlags: onboarding?.safetyFlags,
  };
  const profile = personalized
    ? {
        source: healthProfile
          ? ("healthProfile" as const)
          : onboarding
            ? ("onboarding" as const)
            : null,
        sex: healthProfile?.sex,
        age: healthProfile?.age ?? onboarding?.age,
        heightCm: healthProfile?.heightCm ?? onboarding?.heightCm,
        activityLevel: healthProfile?.activityLevel,
        goal: healthProfile?.goal ?? onboarding?.goal,
        nutritionGoal: onboarding?.nutritionGoal,
        experienceLevel: onboarding?.experienceLevel,
        dietType: onboarding?.dietType,
        cookingSkill: onboarding?.cookingSkill,
        budget: onboarding?.budget,
        mealFrequency: onboarding?.mealFrequency,
        safetyMode: onboarding?.safetyMode,
        trackingMode: onboarding?.trackingMode,
        ...safety,
      }
    : { source: null, ...safety };

  const base = {
    today: args.today,
    personalized,
    presets: presets.map((preset) => ({
      id: String(preset._id),
      name: preset.name,
      updatedAt: preset.updatedAt,
      snapshot: {
        focus: preset.focus,
        duration: preset.duration,
        itemCount: Array.isArray(preset.items) ? preset.items.length : 0,
        // `exerciseData` and `steps` are dropped entirely — large, and nothing
        // in the prompt ever referred to them.
        items: (Array.isArray(preset.items) ? preset.items : [])
          .slice(0, MAX_PRESET_ITEMS)
          .map((item: unknown) =>
            isRecord(item)
              ? {
                  name: item.name,
                  sets: item.sets,
                  reps: item.reps,
                }
              : item,
          ),
      },
    })),
    recipes: recipes.map((recipe) => ({
      id: String(recipe._id),
      name: recipe.name,
      updatedAt: recipe.updatedAt,
      servings: recipe.servings,
      ingredients: recipe.ingredients
        .slice(0, MAX_RECIPE_INGREDIENTS)
        .map((item) => ({
          id: item.id,
          name: item.name,
          grams: item.grams,
          caloriesPer100: item.caloriesPer100,
          proteinPer100: item.proteinPer100,
          carbsPer100: item.carbsPer100,
          fatPer100: item.fatPer100,
        })),
    })),
    memories: memories.map(({ key, category, value }) => ({
      key,
      category,
      value,
    })),
    goals: goalsWithTasks,
    progressMetrics: progressMetricsView,
    dashboardWidgets: dashboardWidgets.map((widget) => ({
      id: String(widget._id),
      title: widget.title,
      description: widget.description,
      kind: widget.kind,
      sourceMetricId: String(widget.sourceMetricId),
      sourceMetricTitle:
        metricsWithEntries.find(
          (metric) => metric._id === widget.sourceMetricId,
        )?.title ?? "Metric",
      pinned: widget.pinned,
      parentWidgetId: widget.parentWidgetId
        ? String(widget.parentWidgetId)
        : undefined,
    })),
    supplements: supplements.map((item) => ({
      id: String(item._id),
      name: item.name,
      brand: item.brand,
      category: item.category,
      form: item.form,
      servingLabel: item.servingLabel,
      active: item.active,
      schedule: item.schedule,
    })),
    profile,
    routine: DAYS.map((day) => {
      const raw = primary[day];
      const presetId = typeof raw === "string" ? raw : null;
      return {
        day,
        presetId,
        presetName: presetId ? (presetNames.get(presetId) ?? null) : null,
      };
    }),
  };

  // Inferred behaviour, as opposed to content the user authored. This is the
  // line the privacy toggle draws.
  const personalSources = {
    foodEntries: foodDays
      .flatMap((day) =>
        day.entries
          .slice(-12)
          .filter(isRecord)
          .map((entry) => ({ ...entry, date: day.date })),
      )
      .slice(0, 50),
    checkIns: checkIns.map(({ date, energy, soreness, sleepQuality, mood }) => ({
      date,
      energy,
      soreness,
      sleepQuality,
      mood,
    })),
    recentWorkouts: workouts.map((workout) => ({
      id: String(workout._id),
      date: workout.date,
      durationMinutes: Math.round(workout.durationSeconds / 60),
      exercises: (Array.isArray(workout.exercises) ? workout.exercises : [])
        .slice(0, MAX_WORKOUT_EXERCISES)
        .map(projectExercise)
        .filter((exercise) => exercise != null),
    })),
    recentActions: actions.map((event) => ({
      id: String(event._id),
      summary: event.summary,
      status: event.status,
    })),
    bodyMeasurements: bodyMeasurementsView,
    water: waterView,
    fasting: fastingView,
    supplementAdherence,
  };

  const omitted = personalized ? [] : Object.keys(personalSources);
  const workspace = personalized
    ? { ...base, ...personalSources, omitted }
    : { ...base, omitted };

  return fitWorkspaceToBudget(workspace) as typeof workspace & {
    truncated: string[];
  };
}

export type CoachWorkspace = Awaited<ReturnType<typeof buildCoachWorkspace>>;

export const loadForModel = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: (ctx, args) => buildCoachWorkspace(ctx, args),
});
