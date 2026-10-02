import {
  buildGoalAssessment,
  assessmentDate,
  type AssessmentInput,
} from "./lib/goalAssessment";
import {
  validDate,
  programmeDay,
  programmeNeedsCare,
} from "./lib/nutritionProgramme";
import { getLatestOnboardingProfile } from "./lib/onboardingProfiles";
import { getHealthProfile } from "./lib/healthProfiles";
import { calculateCalories } from "./lib/calculateCalories";
import { isCustomExerciseId, customExerciseDocId } from "./lib/exerciseShape";
/**
 * The coach's computed views, surfaced to their owner.
 *
 * Since Phase 2 the server has known which lifts are stalled, how recovered
 * the body wearing the watch is, and what the last six months amounted to —
 * and showed it only to the model. That asymmetry made the Sunday review read
 * like an oracle: "your bench has stalled" with nothing the user could point
 * at. These queries hand the same computed blocks to the person they are
 * about.
 *
 * No privacy gate here, deliberately. `personalizedInsightsEnabled` governs
 * what is inferred *for the AI*; this is arithmetic over the user's own logs,
 * shown to the user. Withholding someone's own statistics because they opted
 * out of AI personalization would be punishing the opt-out.
 */

import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { safeGetAuthUser } from "./lib/auth";
import {
  PROGRAMMING_WINDOW_DAYS,
  summarizeProgramming,
} from "./lib/programming";
import { listRecoveryWindow } from "./lib/healthMetrics";
import { summarizeRecovery } from "./lib/recovery";
import {
  buildHistoryBlock,
  HISTORY_MONTHS,
  recentMonthKeys,
} from "./lib/history";

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function buildInsights(ctx: QueryCtx, userId: string, today: string) {
  const [programmingLogs, recoveryRows, monthlySummaries] = await Promise.all([
    ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q
          .eq("userId", userId)
          .gte("date", shiftDateKey(today, -(PROGRAMMING_WINDOW_DAYS - 1))),
      )
      .order("desc")
      .take(200),
    listRecoveryWindow(ctx, userId, today),
    ctx.db
      .query("coachMonthlySummaries")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(HISTORY_MONTHS * 2),
  ]);

  const recovery = summarizeRecovery(recoveryRows, today);
  const wanted = new Set(recentMonthKeys(today, HISTORY_MONTHS));

  return {
    programming: summarizeProgramming(
      programmingLogs.map((log) => ({
        date: log.date,
        exercises: Array.isArray(log.exercises) ? log.exercises : [],
      })),
      today,
      PROGRAMMING_WINDOW_DAYS,
      recovery,
    ),
    recovery,
    history: buildHistoryBlock(
      monthlySummaries
        .filter((row) => wanted.has(row.month))
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
}

export const training = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    return buildInsights(ctx, user._id, args.today.slice(0, 10));
  },
});

/** The same blocks for the MCP surface, which authenticates by token. */
export const forUser = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: (ctx, args) => buildInsights(ctx, args.userId, args.today),
});

/** Owner-only deterministic assessment. All scans and catalog lookups are bounded. */
export const goals = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    if (!validDate(today))
      throw new Error("Use a valid local date in YYYY-MM-DD format.");
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!prefs?.goalPlan) return null;
    const since = assessmentDate(today, -27);
    const [
      workouts,
      health,
      food,
      body,
      activities,
      journal,
      recovery,
      profile,
      healthProfile,
      programme,
    ] = await Promise.all([
      ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", user._id).gte("date", since).lte("date", today),
        )
        .order("desc")
        .take(241),
      ctx.db
        .query("healthMetrics")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).gte("date", since).lte("date", today),
        )
        .order("desc")
        .take(29),
      ctx.db
        .query("foodLogs")
        .withIndex("by_userId_date", (q) =>
          q
            .eq("userId", user._id)
            .gte("date", assessmentDate(today, -7))
            .lt("date", today),
        )
        .take(8),
      ctx.db
        .query("bodyMeasurements")
        .withIndex("by_userId_and_loggedAt", (q) =>
          q
            .eq("userId", user._id)
            .gte("loggedAt", assessmentDate(today, -13))
            .lt("loggedAt", assessmentDate(today, 1)),
        )
        .order("desc")
        .take(85),
      ctx.db
        .query("healthWorkouts")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).gte("date", since).lte("date", today),
        )
        .order("desc")
        .take(241),
      ctx.db
        .query("journalEntries")
        .withIndex("by_userId_and_date", (q) =>
          q
            .eq("userId", user._id)
            .gte("date", assessmentDate(today, -6))
            .lte("date", today),
        )
        .take(8),
      ctx.db
        .query("recoveryEpisodes")
        .withIndex("by_userId_and_active", (q) =>
          q.eq("userId", user._id).eq("active", true),
        )
        .first(),
      getLatestOnboardingProfile(ctx, user._id),
      getHealthProfile(ctx, user._id),
      ctx.db
        .query("nutritionProgrammes")
        .withIndex("by_userId_and_startDate", (q) =>
          q.eq("userId", user._id).lte("startDate", today),
        )
        .order("desc")
        .first(),
    ]);
    const allIds = [
      ...new Set(
        workouts.flatMap((log) =>
          log.exercises.flatMap((ex: unknown) => {
            if (!ex || typeof ex !== "object") return [];
            const entry = ex as { id?: unknown; exerciseId?: unknown };
            const id =
              typeof entry.id === "string"
                ? entry.id
                : typeof entry.exerciseId === "string"
                  ? entry.exerciseId
                  : null;
            return id ? [id] : [];
          }),
        ),
      ),
    ];
    const catalog: AssessmentInput["catalog"] = {};
    await Promise.all(
      allIds.slice(0, 160).map(async (id) => {
        if (isCustomExerciseId(id)) {
          const docId = ctx.db.normalizeId(
            "customExercises",
            customExerciseDocId(id),
          );
          const doc = docId ? await ctx.db.get("customExercises", docId) : null;
          if (doc?.userId === user._id)
            catalog[id] = {
              primaryMuscles: doc.primaryMuscles,
              secondaryMuscles: doc.secondaryMuscles,
            };
        } else {
          const doc = await ctx.db
            .query("exercises")
            .withIndex("by_userId_and_exerciseId", (q) =>
              q.eq("userId", "__global__").eq("exerciseId", id),
            )
            .first();
          if (doc)
            catalog[id] = {
              primaryMuscles: doc.primaryMuscles,
              secondaryMuscles: doc.secondaryMuscles,
            };
        }
      }),
    );
    const day = programme ? programmeDay(programme, today) : null;
    const proteinTarget = day?.active
      ? day.targets.protein
      : (prefs.customGoals?.protein ??
        (healthProfile
          ? calculateCalories(healthProfile, profile).protein
          : null));
    return buildGoalAssessment({
      today,
      plan: prefs.goalPlan,
      workouts,
      health,
      food,
      body: [...body].reverse(),
      activities,
      journal,
      proteinTarget,
      paused: !!recovery || programmeNeedsCare(profile),
      catalog,
      truncated:
        workouts.length > 240 ||
        activities.length > 240 ||
        body.length > 84 ||
        allIds.length > 160,
    });
  },
});
