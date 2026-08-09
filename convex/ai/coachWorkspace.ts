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
import {
  PROGRAMMING_WINDOW_DAYS,
  summarizeProgramming,
} from "../lib/programming";
import { listRecoveryWindow } from "../lib/healthMetrics";
import { summarizeRecovery } from "../lib/recovery";
import { buildHistoryBlock, HISTORY_MONTHS, recentMonthKeys } from "../lib/history";
import {
  MAX_STORED_MEMORIES,
  orderMemoriesForContext,
} from "../lib/memoryConsolidation";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** How far back the behavioural windows reach. */
const WINDOW_DAYS = 14;
/** Per-preset and per-recipe list caps, applied before the size budget. */
const MAX_PRESET_ITEMS = 12;
const MAX_RECIPE_INGREDIENTS = 12;
const MAX_WORKOUT_EXERCISES = 12;
/**
 * Ceiling on the logs read for progression analysis.
 *
 * Twelve weeks of two-a-day training is about 170 sessions; this covers the
 * committed and bounds the pathological. The rows never leave the server — they
 * are collapsed into `programming` before the workspace is assembled.
 */
const MAX_PROGRAMMING_LOGS = 200;
/** Memories shown to the model, after ranking. */
const MAX_CONTEXT_MEMORIES = 40;
/** Form-check reports carried into context. Recent ones only; a form issue
 * from months ago is stale advice about a body that has since adapted. */
const MAX_FORM_REPORTS = 5;

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
    programmingLogs,
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
    recoveryRows,
    monthlySummaries,
    formReports,
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
    // Every stored memory, not the 40 newest. Ordering happens below, and
    // ordering a pre-filtered list is useless: a user's "bad shoulder" written
    // a year ago would never be fetched to be ranked in the first place. The
    // bound is 3× the storage ceiling, matching what consolidation itself
    // reads — protected memories may lawfully exceed the ceiling ("the
    // ceiling bends"), and fetching exactly the ceiling would re-create the
    // very bug the ranking exists to fix, one layer down.
    ctx.db
      .query("coachMemories")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(MAX_STORED_MEMORIES * 3),
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
    // A second, longer read of the same table. The 30 above are shown to the
    // model as sessions; these are only ever reduced to a handful of verdicts
    // by `summarizeProgramming`, and never shipped raw — a stall takes twelve
    // weeks to become visible and two weeks of logs cannot show one.
    ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q
          .eq("userId", args.userId)
          .gte("date", shiftDate(args.today, -(PROGRAMMING_WINDOW_DAYS - 1))),
      )
      .order("desc")
      .take(MAX_PROGRAMMING_LOGS),
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
    listRecoveryWindow(ctx, args.userId, args.today),
    // Six months of precomputed monthly rows. Six documents, not six months of
    // logs — the whole reason these are stored rather than derived.
    ctx.db
      .query("coachMonthlySummaries")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(HISTORY_MONTHS * 2),
    ctx.db
      .query("formCoachReports")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(MAX_FORM_REPORTS),
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
    // Ordered rather than merely taken: the size budget trims this list from
    // the end, so a user's own constraints must lead it. Otherwise a fortnight
    // of the model's own observations about breakfast can push "I have a bad
    // shoulder" out of context entirely.
    memories: orderMemoriesForContext(
      memories.map((memory) => ({
        id: String(memory._id),
        key: memory.key,
        category: memory.category,
        value: memory.value,
        source: memory.source,
        updatedAt: memory.updatedAt,
      })),
    )
      .slice(0, MAX_CONTEXT_MEMORIES)
      .map(({ key, category, value }) => ({ key, category, value })),
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

  // Sensor readings the user never typed in. Computed once here because both
  // the recovery block and the deload verdict inside `programming` read it.
  const recovery = summarizeRecovery(recoveryRows, args.today);
  // Rows are taken newest-first with slack, so a user who skipped a few months
  // does not push the recent ones out; this is the filter that keeps the block
  // to the window it claims to cover.
  const wantedMonths = new Set(recentMonthKeys(args.today, HISTORY_MONTHS));

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
    /**
     * Twelve weeks of training, reduced to verdicts.
     *
     * Gated with the rest of the behavioural sources because it is inference
     * about what someone has been doing — the most pointed inference in the
     * workspace, in fact. `null` when there is nothing in the window, which is
     * different from a user who trained and got nowhere.
     */
    programming: summarizeProgramming(
      programmingLogs.map((log) => ({
        date: log.date,
        exercises: Array.isArray(log.exercises) ? log.exercises : [],
      })),
      args.today,
      PROGRAMMING_WINDOW_DAYS,
      // The deload call reads this: a stall from a spent programme and a stall
      // from three weeks of bad sleep want opposite responses, and until the
      // watch data arrived there was no way to tell them apart.
      recovery,
    ),
    recovery,
    /**
     * What the form coach measured, compressed to what chat can act on.
     *
     * The full reports carry per-finding evidence and drill lists; the coach
     * needs the headline, the severity, and the date — enough to say "your
     * squat check found the knees caving on the last reps, want the drills?"
     * and route the user back to the report, not enough to re-litigate it.
     */
    formChecks: formReports.map((report) => ({
      date: report.date,
      exercise: report.exerciseName,
      summary: report.summary.slice(0, 200),
      findings: (report.findings ?? [])
        .filter((finding) => finding.severity !== "strength")
        .slice(0, 3)
        .map((finding) => ({
          title: finding.title,
          severity: finding.severity,
        })),
    })),
    /**
     * Six months, in about as many lines.
     *
     * The raw windows answer "what should I do on Thursday". This answers "am
     * I actually getting anywhere", which is the question a coach who has
     * known someone for a season can answer and a fortnight of logs cannot.
     */
    history: buildHistoryBlock(
      monthlySummaries
        .filter((row) => wantedMonths.has(row.month))
        .map((row) => ({
          month: row.month,
          sessions: row.sessions,
          activeDays: row.activeDays,
          sets: row.sets,
          loggedFoodDays: row.loggedFoodDays,
          daysInMonth: row.daysInMonth,
          avgCalories: row.avgCalories,
          avgProtein: row.avgProtein,
          weightStartKg: row.weightStartKg,
          weightEndKg: row.weightEndKg,
        })),
    ),
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
