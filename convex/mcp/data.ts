import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { upsertWorkoutLog, findFreeWorkoutSlot } from "../lib/workoutLogs";
import { recordUndoableAction } from "../ai/coachState";
import { applyManualHealthMetric } from "../logs/healthMetrics";
import { listCustomMetricsWithEntries } from "../lib/customProgressMetrics";
import { platformMetric } from "../lib/platformHealthMetrics";
import {
  applyNutritionTargets,
  describeNutritionTargets,
} from "../lib/nutritionTargets";
import {
  clampCustomMetricValue,
  sanitizeCustomMetricDefinition,
} from "../customProgressMetrics";

/**
 * Everything the MCP tools actually do, keyed by an explicit `userId`.
 *
 * The app's own functions resolve the user from the session, which an agent
 * holding a token does not have. Rather than loosening those, this file is a
 * second entry point at the same depth: it goes through the shared `lib`
 * helpers, so validation and slot rules are the ones the app already obeys,
 * and it is `internal` so nothing but the authenticated HTTP layer can reach
 * it.
 */

/** The document as it can be inserted again: system fields are not writable. */
function stripSystemFields<T extends { _id: unknown; _creationTime: unknown }>(
  doc: T,
) {
  const { _id, _creationTime, ...rest } = doc;
  void _id;
  void _creationTime;
  return rest as Record<string, unknown>;
}

function clampField(value: string | undefined, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Drops a sensor value that is missing or nonsense rather than storing it. */
function positive(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function dayTotals(entries: unknown[]) {
  return entries.reduce<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>(
    (totals, raw) => {
      const entry = (raw ?? {}) as Record<string, unknown>;
      const num = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) ? value : 0;
      return {
        calories: totals.calories + num(entry.calories),
        protein: totals.protein + num(entry.protein),
        carbs: totals.carbs + num(entry.carbs),
        fat: totals.fat + num(entry.fat),
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function summarizeWorkout(log: {
  date: string;
  sessionId?: string;
  durationSeconds: number;
  exercises: unknown[];
}) {
  const exercises = log.exercises as Array<Record<string, unknown>>;
  return {
    date: log.date,
    /** Absent on logs written before sessions existed; those cannot be deleted here. */
    sessionId: log.sessionId ?? null,
    durationMinutes: Math.round(log.durationSeconds / 60),
    exercises: exercises.map((exercise) => {
      const sets = Array.isArray(exercise.sets)
        ? (exercise.sets as Array<Record<string, unknown>>)
        : [];
      const completed = sets.filter((set) => set.completed === true);
      return {
        name: String(exercise.name ?? "Unnamed"),
        sets: completed.length,
        reps: completed.map((set) => Number(set.reps ?? 0)),
        weightKg: completed.map((set) => Number(set.weight ?? 0)),
      };
    }),
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export const getDay = internalQuery({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const [food, water, workouts, rest] = await Promise.all([
      ctx.db
        .query("foodLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", args.userId).eq("date", args.date),
        )
        .unique(),
      ctx.db
        .query("waterLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", args.userId).eq("date", args.date),
        )
        .unique(),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", args.userId).eq("date", args.date),
        )
        .take(2),
      ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", args.userId).eq("date", args.date),
        )
        .unique(),
    ]);

    const entries = food?.entries ?? [];
    return {
      date: args.date,
      nutrition: {
        ...dayTotals(entries),
        entries: entries.map((raw: unknown) => {
          const entry = (raw ?? {}) as Record<string, unknown>;
          return {
            // The handle a delete needs. Without it the only way to remove a
            // wrong entry over the API is to open the app.
            id: String(entry.id ?? ""),
            name: String(entry.name ?? ""),
            meal: String(entry.meal ?? ""),
            calories: Number(entry.calories ?? 0),
            protein: Number(entry.protein ?? 0),
          };
        }),
      },
      waterMl: (water?.entries ?? []).reduce(
        (total: number, raw: unknown) =>
          total + Number((raw as { amountMl?: number })?.amountMl ?? 0),
        0,
      ),
      waterEntries: (water?.entries ?? []).map((raw: unknown) => {
        const entry = (raw ?? {}) as Record<string, unknown>;
        return {
          id: String(entry.id ?? ""),
          amountMl: Number(entry.amountMl ?? 0),
        };
      }),
      workouts: workouts.map(summarizeWorkout),
      restDay: rest !== null,
    };
  },
});

export const getRange = internalQuery({
  args: { userId: v.string(), start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    const [food, workouts, rest] = await Promise.all([
      ctx.db
        .query("foodLogs")
        .withIndex("by_userId_date", (q) =>
          q
            .eq("userId", args.userId)
            .gte("date", args.start)
            .lte("date", args.end),
        )
        .collect(),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) =>
          q
            .eq("userId", args.userId)
            .gte("date", args.start)
            .lte("date", args.end),
        )
        .collect(),
      ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q
            .eq("userId", args.userId)
            .gte("date", args.start)
            .lte("date", args.end),
        )
        .collect(),
    ]);

    return {
      start: args.start,
      end: args.end,
      nutrition: food.map((day) => ({
        date: day.date,
        ...dayTotals(day.entries),
      })),
      workouts: workouts.map(summarizeWorkout),
      restDays: rest.map((row) => row.date),
    };
  },
});

export const listWorkouts = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 10), 50));
    const logs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
    return logs.map(summarizeWorkout);
  },
});

export const getGoals = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const profile = await ctx.db
      .query("healthProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    return {
      customGoals: prefs?.customGoals ?? null,
      waterGoalMl: prefs?.waterGoalMl ?? null,
      weightUnit: prefs?.weightUnit ?? "kg",
      goal: (profile as { goal?: string } | null)?.goal ?? null,
    };
  },
});

export const listBodyMeasurements = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 20), 100));
    const rows = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_and_loggedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    // Every field, not the three the charts happen to plot. A client asked to
    // correct a check-in cannot correct what it was never shown.
    return rows.map((row) => ({
      id: row._id,
      date: row.loggedAt,
      source: row.source ?? "manual",
      weightKg: row.weightKg ?? null,
      bodyFatPct: row.bodyFatPct ?? null,
      waistCm: row.waistCm ?? null,
      hipsCm: row.hipsCm ?? null,
      chestCm: row.chestCm ?? null,
      armsCm: row.armsCm ?? null,
      thighsCm: row.thighsCm ?? null,
      calvesCm: row.calvesCm ?? null,
      neckCm: row.neckCm ?? null,
      leanBodyMassKg: row.leanBodyMassKg ?? null,
      boneMassKg: row.boneMassKg ?? null,
      basalMetabolicRateKcal: row.basalMetabolicRateKcal ?? null,
      notes: row.notes ?? null,
    }));
  },
});

/** The fields `saveBodyMeasurement` accepts, and the units they are in. */
const MEASUREMENT_ARGS = {
  weightKg: v.optional(v.number()),
  bodyFatPct: v.optional(v.number()),
  waistCm: v.optional(v.number()),
  hipsCm: v.optional(v.number()),
  chestCm: v.optional(v.number()),
  armsCm: v.optional(v.number()),
  thighsCm: v.optional(v.number()),
  calvesCm: v.optional(v.number()),
  neckCm: v.optional(v.number()),
  leanBodyMassKg: v.optional(v.number()),
  boneMassKg: v.optional(v.number()),
  basalMetabolicRateKcal: v.optional(v.number()),
  notes: v.optional(v.string()),
};

const MEASUREMENT_KEYS = Object.keys(MEASUREMENT_ARGS);

/**
 * Writes or corrects any part of a day's check-in.
 *
 * Partial by design: sending only `bodyFatPct` leaves the weight alone. The
 * undo payload carries the previous values of exactly the fields touched, so
 * undoing a correction restores what was there rather than blanking the row.
 */
export const saveBodyMeasurement = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    clearFields: v.optional(v.array(v.string())),
    ...MEASUREMENT_ARGS,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fields: Record<string, unknown> = {};
    for (const key of MEASUREMENT_KEYS) {
      const value = (args as Record<string, unknown>)[key];
      if (value !== undefined) fields[key] = value;
    }
    for (const key of args.clearFields ?? []) {
      if (MEASUREMENT_KEYS.includes(key)) fields[key] = undefined;
    }
    if (Object.keys(fields).length === 0) {
      throw new Error("Nothing to change: pass at least one field.");
    }

    const existing = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_and_loggedAt", (q) =>
        q.eq("userId", args.userId).eq("loggedAt", args.date),
      )
      .first();

    const changed = Object.keys(fields);
    if (existing) {
      const previous: Record<string, unknown> = {};
      for (const key of changed) {
        previous[key] = (existing as Record<string, unknown>)[key] ?? null;
      }
      await ctx.db.patch(existing._id, {
        ...fields,
        source: "manual",
        updatedAt: now,
      });
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_save_body_measurement",
        summary: `Updated ${changed.join(", ")} on ${args.date}`,
        targetType: "body_measurement",
        targetId: String(existing._id),
        undoPayload: {
          kind: "restore_body_measurement_fields",
          id: String(existing._id),
          fields: previous,
        },
      });
      return { ok: true, date: args.date, changed, created: false };
    }

    const id = await ctx.db.insert("bodyMeasurements", {
      userId: args.userId,
      clientId: `mcp-${now}-${Math.floor(Math.random() * 1e6)}`,
      loggedAt: args.date,
      source: "manual",
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_save_body_measurement",
      summary: `Logged ${changed.join(", ")} on ${args.date}`,
      targetType: "body_measurement",
      targetId: String(id),
      undoPayload: { kind: "delete_body_measurement", id: String(id) },
    });
    return { ok: true, date: args.date, changed, created: true };
  },
});

// ── Writes ───────────────────────────────────────────────────────────────────

export const logWater = internalMutation({
  args: { userId: v.string(), date: v.string(), amountMl: v.number() },
  handler: async (ctx, args) => {
    const amountMl = Math.round(args.amountMl);
    if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 5000) {
      throw new Error("amountMl must be between 1 and 5000");
    }

    const entry = {
      id: `mcp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      amountMl,
      loggedAt: new Date().toISOString(),
    };

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        entries: [...existing.entries, entry],
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("waterLogs", {
        userId: args.userId,
        date: args.date,
        entries: [entry],
        updatedAt: Date.now(),
      });
    }

    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_log_water",
      summary: `Logged ${amountMl} ml of water on ${args.date}`,
      targetType: "water_entry",
      targetId: entry.id,
      undoPayload: {
        kind: "remove_water_entry",
        date: args.date,
        entryId: entry.id,
      },
    });
    return { ok: true, amountMl, date: args.date, entryId: entry.id };
  },
});

export const setNutritionTargets = internalMutation({
  args: {
    userId: v.string(),
    calories: v.optional(v.union(v.number(), v.null())),
    protein: v.optional(v.union(v.number(), v.null())),
    carbs: v.optional(v.union(v.number(), v.null())),
    fat: v.optional(v.union(v.number(), v.null())),
    waterMl: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const { userId, ...input } = args;
    const saved = await applyNutritionTargets(ctx, userId, input);
    await recordUndoableAction(ctx, {
      userId,
      kind: "api_set_nutrition_targets",
      summary: `Set daily targets: ${describeNutritionTargets(saved.targets)}`,
      targetType: "nutrition_targets",
      undoPayload: {
        kind: "restore_nutrition_targets",
        body: saved.previous,
      },
    });
    return { ok: true, targets: saved.targets, changed: saved.changed };
  },
});

export const logFood = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    name: v.string(),
    meal: v.optional(v.string()),
    calories: v.number(),
    protein: v.optional(v.number()),
    carbs: v.optional(v.number()),
    fat: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, 120);
    if (!name) throw new Error("name is required");
    if (!Number.isFinite(args.calories) || args.calories < 0) {
      throw new Error("calories must be a non-negative number");
    }

    const entry = {
      id: `mcp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name,
      calories: Math.round(args.calories),
      protein: Math.round(args.protein ?? 0),
      carbs: Math.round(args.carbs ?? 0),
      fat: Math.round(args.fat ?? 0),
      meal: args.meal ?? "snack",
      loggedAt: new Date().toISOString(),
    };

    const existing = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        entries: [...existing.entries, entry],
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("foodLogs", {
        userId: args.userId,
        date: args.date,
        entries: [entry],
        updatedAt: Date.now(),
      });
    }

    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_log_food",
      summary: `Logged ${entry.name} on ${args.date}`,
      targetType: "food_entry",
      targetId: entry.id,
      undoPayload: {
        kind: "remove_food_entry",
        date: args.date,
        entryId: entry.id,
      },
    });
    return { ok: true, logged: entry.name, date: args.date, entryId: entry.id };
  },
});

export const logWeight = internalMutation({
  args: { userId: v.string(), date: v.string(), weightKg: v.number() },
  handler: async (ctx, args) => {
    if (
      !Number.isFinite(args.weightKg) ||
      args.weightKg < 20 ||
      args.weightKg > 400
    ) {
      throw new Error("weightKg must be between 20 and 400");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_and_loggedAt", (q) =>
        q.eq("userId", args.userId).eq("loggedAt", args.date),
      )
      .first();

    // Two undo shapes on purpose: replacing a weigh-in has to put the old
    // number back, while adding one has to take the whole row away again.
    if (existing) {
      const previousWeightKg = existing.weightKg;
      await ctx.db.patch(existing._id, {
        weightKg: args.weightKg,
        updatedAt: now,
      });
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_log_weight",
        summary: `Set weight to ${args.weightKg} kg on ${args.date}`,
        targetType: "body_measurement",
        targetId: String(existing._id),
        undoPayload: {
          kind: "restore_body_measurement_weight",
          id: String(existing._id),
          ...(previousWeightKg === undefined
            ? {}
            : { weightKg: previousWeightKg }),
        },
      });
    } else {
      const id = await ctx.db.insert("bodyMeasurements", {
        userId: args.userId,
        clientId: `mcp-${now}-${Math.floor(Math.random() * 1e6)}`,
        loggedAt: args.date,
        // Through the API is still someone deciding the number, so it outranks
        // a scale reading the same way a typed one does.
        source: "manual",
        weightKg: args.weightKg,
        createdAt: now,
        updatedAt: now,
      });
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_log_weight",
        summary: `Logged ${args.weightKg} kg on ${args.date}`,
        targetType: "body_measurement",
        targetId: String(id),
        undoPayload: { kind: "delete_body_measurement", id: String(id) },
      });
    }

    return { ok: true, weightKg: args.weightKg, date: args.date };
  },
});

export const logWorkout = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    durationMinutes: v.optional(v.number()),
    exercises: v.array(
      v.object({
        name: v.string(),
        sets: v.array(
          v.object({
            reps: v.number(),
            weightKg: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.exercises.length === 0) {
      throw new Error("A workout needs at least one exercise");
    }
    if (args.exercises.length > 20) {
      throw new Error("That is more exercises than a session");
    }

    const exercises = args.exercises.map((exercise) => ({
      id: `mcp:${exercise.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: exercise.name.trim().slice(0, 80) || "Exercise",
      category: "strength",
      sets: exercise.sets.slice(0, 30).map((set) => ({
        type: "normal",
        reps: Math.max(0, Math.round(set.reps)),
        weight: Math.max(0, set.weightKg ?? 0),
        completed: true,
      })),
    }));

    const sessionId = `mcp:${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const slot = await findFreeWorkoutSlot(
      ctx,
      args.userId,
      args.date,
      sessionId,
    );
    if (slot === null) {
      throw new Error(
        "Two sessions are already logged on that date. Edit one in the app instead.",
      );
    }

    const durationSeconds = Math.round(
      Math.min(Math.max(args.durationMinutes ?? 45, 1), 600) * 60,
    );

    await upsertWorkoutLog(ctx, args.userId, {
      date: args.date,
      sessionId,
      slot,
      exercises,
      durationSeconds,
      completedAt: new Date(`${args.date}T12:00:00Z`).getTime(),
      hasExplicitSessionId: true,
    });

    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_log_workout",
      summary: `Logged a ${exercises.length}-exercise session on ${args.date}`,
      targetType: "workout_log",
      targetId: sessionId,
      undoPayload: { kind: "delete_workout_log", date: args.date, sessionId },
    });
    return {
      ok: true,
      date: args.date,
      sessionId,
      exercises: exercises.length,
    };
  },
});

export const markRestDays = internalMutation({
  args: { userId: v.string(), dates: v.array(v.string()) },
  handler: async (ctx, args) => {
    const dates = [...new Set(args.dates)].slice(0, 31);
    const created: string[] = [];
    let marked = 0;

    for (const date of dates) {
      const existing = await ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", args.userId).eq("date", date),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert("restDays", {
        userId: args.userId,
        date,
        source: "mcp",
        createdAt: Date.now(),
      });
      created.push(date);
      marked++;
    }

    if (created.length > 0) {
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_rest_days",
        summary: `Marked ${created.length} rest ${created.length === 1 ? "day" : "days"}`,
        targetType: "rest_days",
        // Only what this call created: a day the user had already marked is
        // not the agent's to take away on undo.
        undoPayload: { kind: "unmark_rest_days", dates: created },
      });
    }
    return { ok: true, marked };
  },
});

// ── Health ───────────────────────────────────────────────────────────────────

/**
 * The daily recovery signals the phone syncs out of Apple Health or Health
 * Connect. Read-only from here: the table is a cache of the platform health
 * store keyed on the local day. Writing one figure is offered, but only through
 * the override list: a plain patch here would survive about as long as it took
 * the phone to foreground, and an agent would have no way of telling that its
 * correction had been quietly undone. Deleting a day is offered too, because a
 * bad sensor reading is worth removing.
 */
export const listHealthDays = internalQuery({
  args: { userId: v.string(), start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("healthMetrics")
      .withIndex("by_userId_and_date", (q) =>
        q
          .eq("userId", args.userId)
          .gte("date", args.start)
          .lte("date", args.end),
      )
      .collect();

    return {
      start: args.start,
      end: args.end,
      days: rows.map((row) => ({
        date: row.date,
        provider: row.provider,
        sleepMinutes: row.sleepMinutes ?? null,
        steps: row.steps ?? null,
        restingHeartRateBpm: row.restingHeartRateBpm ?? null,
        hrvMs: row.hrvMs ?? null,
        activeEnergyKcal: row.activeEnergyKcal ?? null,
        /** Fields on this day the user typed; the sync will not touch them. */
        manualFields: row.manualFields ?? [],
      })),
    };
  },
});

function summarizeHealthWorkout(row: Doc<"healthWorkouts">) {
  return {
    id: row._id,
    provider: row.provider,
    externalId: row.externalId,
    date: row.date,
    activityType: row.activityType,
    activityName: row.activityName,
    startedAt: new Date(row.startedAt).toISOString(),
    durationMinutes: Math.round(row.durationSeconds / 60),
    totalDistanceMeters: row.totalDistanceMeters ?? null,
    avgHeartRateBpm: row.avgHeartRateBpm ?? null,
    maxHeartRateBpm: row.maxHeartRateBpm ?? null,
    activeEnergyKcal: row.activeEnergyKcal ?? null,
    sourceName: row.sourceName ?? null,
    /** Set once promoted into the training log. */
    linkedSessionId: row.linkedSessionId ?? null,
  };
}

export const listHealthWorkouts = internalQuery({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 10)));
    const rows = await ctx.db
      .query("healthWorkouts")
      .withIndex("by_userId_and_startedAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
    return rows.map(summarizeHealthWorkout);
  },
});

export const logHealthWorkout = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    activityType: v.string(),
    activityName: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    durationMinutes: v.number(),
    externalId: v.optional(v.string()),
    totalDistanceMeters: v.optional(v.number()),
    avgHeartRateBpm: v.optional(v.number()),
    activeEnergyKcal: v.optional(v.number()),
    sourceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const durationMinutes = Math.round(args.durationMinutes);
    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 1440
    ) {
      throw new Error("durationMinutes must be between 1 and 1440");
    }

    // Supplied by the caller when it has a stable id of its own, so a retried
    // import replaces the session it already wrote instead of duplicating it.
    // Replace, not merge: the body is the session as the caller now knows it,
    // and a merge would make a wrong distance impossible to clear.
    const externalId =
      clampField(args.externalId, 120) ||
      `api-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const startedAt = args.startedAt
      ? Date.parse(args.startedAt)
      : Date.parse(`${args.date}T12:00:00Z`);
    if (!Number.isFinite(startedAt)) {
      throw new Error("startedAt must be an ISO 8601 timestamp");
    }

    const now = Date.now();
    const durationSeconds = durationMinutes * 60;
    const fields = {
      activityType: clampField(args.activityType, 60) || "other",
      activityName: clampField(args.activityName, 80) || "Workout",
      date: args.date,
      startedAt,
      endedAt: startedAt + durationSeconds * 1000,
      durationSeconds,
      totalDistanceMeters: positive(args.totalDistanceMeters),
      avgHeartRateBpm: positive(args.avgHeartRateBpm),
      activeEnergyKcal: positive(args.activeEnergyKcal),
      sourceName: clampField(args.sourceName, 80) || undefined,
      updatedAt: now,
    };

    const existing = await ctx.db
      .query("healthWorkouts")
      .withIndex("by_userId_and_externalId", (q) =>
        q
          .eq("userId", args.userId)
          .eq("provider", "api")
          .eq("externalId", externalId),
      )
      .unique();

    if (existing) {
      const previous = stripSystemFields(existing);
      await ctx.db.patch(existing._id, fields);
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_health_workout",
        summary: `Updated ${fields.activityName} on ${args.date}`,
        targetType: "health_workout",
        targetId: String(existing._id),
        undoPayload: { kind: "restore_health_workout", body: previous },
      });
      return { ok: true, id: existing._id, externalId, updated: true };
    }

    const id = await ctx.db.insert("healthWorkouts", {
      userId: args.userId,
      provider: "api",
      externalId,
      ...fields,
      importedAt: now,
    });
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_health_workout",
      summary: `Added ${fields.activityName} on ${args.date}`,
      targetType: "health_workout",
      targetId: String(id),
      undoPayload: { kind: "delete_health_workout", id: String(id) },
    });
    return { ok: true, id, externalId, updated: false };
  },
});

// ── Deletes ──────────────────────────────────────────────────────────────────
//
// Every one of these captures the stored document before removing it and files
// the restore under the same coach action feed the chat writes to, so a delete
// made over HTTP is one tap from being put back.

export const deleteFoodEntry = internalMutation({
  args: { userId: v.string(), date: v.string(), entryId: v.string() },
  handler: async (ctx, args) => {
    const log = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();
    const entry = (log?.entries ?? []).find(
      (raw: unknown) => (raw as { id?: unknown } | null)?.id === args.entryId,
    );
    if (!log || !entry) throw new Error("No such food entry on that date");

    await ctx.db.patch(log._id, {
      entries: log.entries.filter(
        (raw: unknown) => (raw as { id?: unknown } | null)?.id !== args.entryId,
      ),
      updatedAt: Date.now(),
    });
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_delete_food",
      summary: `Deleted ${String((entry as { name?: unknown }).name ?? "an entry")} from ${args.date}`,
      targetType: "food_entry",
      targetId: args.entryId,
      undoPayload: { kind: "restore_food_entry", date: args.date, entry },
    });
    return { ok: true, date: args.date, entryId: args.entryId };
  },
});

export const deleteWaterEntry = internalMutation({
  args: { userId: v.string(), date: v.string(), entryId: v.string() },
  handler: async (ctx, args) => {
    const log = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();
    const entry = (log?.entries ?? []).find(
      (raw: unknown) => (raw as { id?: unknown } | null)?.id === args.entryId,
    );
    if (!log || !entry) throw new Error("No such water entry on that date");

    await ctx.db.patch(log._id, {
      entries: log.entries.filter(
        (raw: unknown) => (raw as { id?: unknown } | null)?.id !== args.entryId,
      ),
      updatedAt: Date.now(),
    });
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_delete_water",
      summary: `Deleted a drink from ${args.date}`,
      targetType: "water_entry",
      targetId: args.entryId,
      undoPayload: { kind: "restore_water_entry", date: args.date, entry },
    });
    return { ok: true, date: args.date, entryId: args.entryId };
  },
});

export const deleteWorkout = internalMutation({
  args: { userId: v.string(), date: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => {
    // Addressed by date as well as session: `workoutLogs` is only indexed by
    // day, and scanning a user's whole history to find one row is not a lookup.
    const target: Doc<"workoutLogs"> | null = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_date_and_sessionId", (q) =>
        q
          .eq("userId", args.userId)
          .eq("date", args.date)
          .eq("sessionId", args.sessionId),
      )
      .unique();
    if (!target) throw new Error("No such workout");

    const body = stripSystemFields(target);
    await ctx.db.delete(target._id);
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_delete_workout",
      summary: `Deleted the session logged on ${target.date}`,
      targetType: "workout_log",
      targetId: args.sessionId,
      undoPayload: { kind: "restore_workout_log", body },
    });
    return { ok: true, sessionId: args.sessionId, date: target.date };
  },
});

export const deleteBodyMeasurement = internalMutation({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("bodyMeasurements", args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.userId !== args.userId) {
      throw new Error("No such measurement");
    }

    const body = stripSystemFields(row);
    await ctx.db.delete(row._id);
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_delete_measurement",
      summary: `Deleted the measurement from ${row.loggedAt}`,
      targetType: "body_measurement",
      targetId: args.id,
      undoPayload: { kind: "restore_body_measurement", body },
    });
    return { ok: true, id: args.id, date: row.loggedAt };
  },
});

export const deleteHealthWorkout = internalMutation({
  args: { userId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("healthWorkouts", args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.userId !== args.userId) {
      throw new Error("No such health workout");
    }

    const body = stripSystemFields(row);
    await ctx.db.delete(row._id);
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_delete_health_workout",
      summary: `Deleted ${row.activityName} on ${row.date}`,
      targetType: "health_workout",
      targetId: args.id,
      undoPayload: { kind: "restore_health_workout", body },
    });
    return { ok: true, id: args.id, date: row.date };
  },
});

/**
 * Overrides — or releases — one field of one day's readings.
 *
 * The whole write lives in `logs/healthMetrics` so the app's own edit screen
 * and an agent hitting this cannot disagree about what an override means. All
 * this adds is the undo entry, since the coach's history is where a user goes
 * looking for something they did not do themselves.
 */
export const setHealthMetric = internalMutation({
  args: {
    userId: v.string(),
    date: v.string(),
    field: v.string(),
    value: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await applyManualHealthMetric(
      ctx,
      args.userId,
      args.date,
      args.field,
      args.value,
    );

    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_set_health_metric",
      summary:
        args.value === null
          ? `Handed ${args.field} on ${args.date} back to the health sync`
          : `Set ${args.field} to ${args.value} on ${args.date}`,
      targetType: "health_day",
      targetId: args.date,
      // Restoring the row wholesale is the only verb the undo handler knows for
      // this table, and it is the right one: it puts the old manualFields back
      // along with the old number. A day this call had to invent has no "old
      // row" to name, so it files an undo the handler will refuse — the event
      // is still worth recording, and delete_health_day is the way out.
      undoPayload: result.previous
        ? { kind: "restore_health_metrics", body: result.previous }
        : { kind: "created_health_metrics_day", date: args.date },
    });

    return {
      ok: true,
      date: result.date,
      field: result.field,
      value: result.value,
      manualFields: result.manualFields,
      created: result.created,
    };
  },
});

export const deleteHealthDay = internalMutation({
  args: { userId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("healthMetrics")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date),
      )
      .unique();
    if (!row) throw new Error("No health data stored for that date");

    const body = stripSystemFields(row);
    await ctx.db.delete(row._id);
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_delete_health_day",
      summary: `Deleted the health readings for ${args.date}`,
      targetType: "health_day",
      targetId: args.date,
      undoPayload: { kind: "restore_health_metrics", body },
    });
    return { ok: true, date: args.date };
  },
});

export const unmarkRestDays = internalMutation({
  args: { userId: v.string(), dates: v.array(v.string()) },
  handler: async (ctx, args) => {
    const dates = [...new Set(args.dates)].slice(0, 31);
    const removed: Array<Record<string, unknown>> = [];

    for (const date of dates) {
      const row = await ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", args.userId).eq("date", date),
        )
        .unique();
      if (!row) continue;
      removed.push(stripSystemFields(row));
      await ctx.db.delete(row._id);
    }

    if (removed.length > 0) {
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_delete_rest_days",
        summary: `Unmarked ${removed.length} rest ${removed.length === 1 ? "day" : "days"}`,
        targetType: "rest_days",
        undoPayload: { kind: "restore_rest_days", rows: removed },
      });
    }
    return { ok: true, unmarked: removed.length };
  },
});

// ── Custom progress metrics ──────────────────────────────────────────────────
//
// The app lets somebody invent a metric — "migraines", "blood glucose",
// "espressos" — and either type it or bind it to a platform health signal.
// None of that was reachable over the API, which meant an agent could read a
// user's whole log and still not see the number they cared most about.
//
// Every write here files an undo. The payload kinds below (`delete_custom_metric`,
// `restore_custom_metric*`) are NOT yet handled by `undoPayload` in
// `convex/ai/coachState.ts`, so pressing undo on one of these actions throws
// "This action cannot be undone" until the matching branches are added there.
// The payloads carry everything a restore needs; only the handlers are missing.

/** Resolves a metric id from an untrusted string, and proves it is the caller's. */
async function loadCustomMetric(
  ctx: { db: MutationCtx["db"] },
  userId: string,
  metricId: string,
) {
  const id = ctx.db.normalizeId("customProgressMetrics", metricId);
  const metric = id ? await ctx.db.get(id) : null;
  // One message for "no such metric" and "not yours": the difference tells a
  // caller holding somebody else's id that the id was real.
  if (!metric || metric.userId !== userId) throw new Error("Metric not found");
  return metric;
}

const CUSTOM_METRIC_TABS = new Set(["body", "nutrition", "training"]);
const CUSTOM_METRIC_KINDS = new Set(["counter", "number", "toggle"]);
const CUSTOM_METRIC_ACCENTS = new Set(["food", "water", "workout", "progress"]);

function customMetricEnum(
  value: string,
  allowed: Set<string>,
  field: string,
): never | string {
  if (!allowed.has(value)) {
    throw new Error(
      `${field} must be one of ${[...allowed].join(", ")}, not ${value}`,
    );
  }
  return value;
}

/**
 * An unknown catalogue key is refused here rather than dropped.
 *
 * `saveDefinition` silently ignores one because the app's picker cannot
 * produce a bad key. An agent can, and a metric that silently never syncs is
 * the kind of bug someone notices three weeks later.
 */
function requireHealthMetricKey(key: string) {
  if (!platformMetric(key)) {
    throw new Error(
      `Unknown health metric key: ${key}. Call list_platform_metrics for the catalogue.`,
    );
  }
  return key;
}

/** A definition and its entries, in the shape the API promises. */
function shapeCustomMetric(
  metric: Doc<"customProgressMetrics">,
  entries: Doc<"customProgressMetricEntries">[],
) {
  const bound = metric.healthMetricKey
    ? (platformMetric(metric.healthMetricKey) ?? null)
    : null;
  return {
    id: metric._id,
    title: metric.title,
    description: metric.description,
    tab: metric.tab,
    kind: metric.kind,
    unit: metric.unit,
    step: metric.step,
    target: metric.target ?? null,
    accent: metric.accent,
    healthMetricKey: metric.healthMetricKey ?? null,
    healthMetricLabel: bound?.label ?? null,
    entries: entries.map((entry) => ({
      date: entry.date,
      value: entry.value,
      // Every path a person can type through sets `manual`, so a row without
      // it came off the health sync. Old rows predate the flag and read as
      // synced; there is nothing stored that can tell them apart.
      source: entry.manual === true ? "manual" : "synced",
    })),
  };
}

export const listCustomMetrics = internalQuery({
  args: {
    userId: v.string(),
    tab: v.optional(v.string()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = Math.max(7, Math.min(Math.floor(args.days ?? 30), 90));
    const metrics = await listCustomMetricsWithEntries(ctx, args.userId, days);
    const filtered = args.tab
      ? metrics.filter((metric) => metric.tab === args.tab)
      : metrics;
    return filtered.map(({ entries, ...metric }) =>
      shapeCustomMetric(metric as Doc<"customProgressMetrics">, entries),
    );
  },
});

export const createCustomMetric = internalMutation({
  args: {
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    tab: v.string(),
    kind: v.string(),
    unit: v.string(),
    step: v.optional(v.number()),
    target: v.optional(v.number()),
    accent: v.optional(v.string()),
    healthMetricKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (title === "") throw new Error("title is required");
    const now = Date.now();
    const definition = sanitizeCustomMetricDefinition({
      title,
      description: args.description ?? "",
      tab: customMetricEnum(args.tab, CUSTOM_METRIC_TABS, "tab") as "body",
      kind: customMetricEnum(
        args.kind,
        CUSTOM_METRIC_KINDS,
        "kind",
      ) as "number",
      unit: args.unit,
      step: args.step ?? 1,
      target: args.target,
      accent: customMetricEnum(
        args.accent ?? "progress",
        CUSTOM_METRIC_ACCENTS,
        "accent",
      ) as "progress",
      healthMetricKey:
        args.healthMetricKey === undefined
          ? undefined
          : requireHealthMetricKey(args.healthMetricKey),
    });

    const id = await ctx.db.insert("customProgressMetrics", {
      userId: args.userId,
      ...definition,
      createdAt: now,
      updatedAt: now,
    });
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_create_custom_metric",
      summary: `Created the custom metric ${definition.title}`,
      targetType: "custom_metric",
      targetId: String(id),
      undoPayload: { kind: "delete_custom_metric", id: String(id) },
    });
    return { ok: true, id, ...definition };
  },
});

export const updateCustomMetric = internalMutation({
  args: {
    userId: v.string(),
    metricId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tab: v.optional(v.string()),
    kind: v.optional(v.string()),
    unit: v.optional(v.string()),
    step: v.optional(v.number()),
    target: v.optional(v.union(v.number(), v.null())),
    accent: v.optional(v.string()),
    healthMetricKey: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const metric = await loadCustomMetric(ctx, args.userId, args.metricId);

    const merged = sanitizeCustomMetricDefinition({
      title: args.title?.trim() || metric.title,
      description: args.description ?? metric.description,
      tab: (args.tab === undefined
        ? metric.tab
        : customMetricEnum(args.tab, CUSTOM_METRIC_TABS, "tab")) as "body",
      kind: (args.kind === undefined
        ? metric.kind
        : customMetricEnum(args.kind, CUSTOM_METRIC_KINDS, "kind")) as "number",
      unit: args.unit ?? metric.unit,
      step: args.step ?? metric.step,
      target:
        args.target === undefined ? metric.target : (args.target ?? undefined),
      accent: (args.accent === undefined
        ? metric.accent
        : customMetricEnum(
            args.accent,
            CUSTOM_METRIC_ACCENTS,
            "accent",
          )) as "progress",
      healthMetricKey:
        args.healthMetricKey === undefined
          ? metric.healthMetricKey
          : args.healthMetricKey === null
            ? undefined
            : requireHealthMetricKey(args.healthMetricKey),
    });

    // The undo restores exactly the fields this call could have moved, with
    // null standing for "was not set", the way the check-in undo does.
    const previous = {
      title: metric.title,
      description: metric.description,
      tab: metric.tab,
      kind: metric.kind,
      unit: metric.unit,
      step: metric.step,
      target: metric.target ?? null,
      accent: metric.accent,
      healthMetricKey: metric.healthMetricKey ?? null,
    };

    await ctx.db.patch(metric._id, {
      ...merged,
      target: merged.target ?? undefined,
      healthMetricKey: merged.healthMetricKey ?? undefined,
      updatedAt: Date.now(),
    });
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_update_custom_metric",
      summary: `Updated the custom metric ${merged.title}`,
      targetType: "custom_metric",
      targetId: String(metric._id),
      undoPayload: {
        kind: "restore_custom_metric_fields",
        id: String(metric._id),
        fields: previous,
      },
    });
    return { ok: true, id: metric._id, ...merged };
  },
});

export const setCustomMetricValue = internalMutation({
  args: {
    userId: v.string(),
    metricId: v.string(),
    date: v.string(),
    value: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const metric = await loadCustomMetric(ctx, args.userId, args.metricId);
    const existing = await ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId_and_date", (q) =>
        q
          .eq("userId", args.userId)
          .eq("metricId", metric._id)
          .eq("date", args.date),
      )
      .unique();

    if (args.value === null) {
      if (!existing) throw new Error(`Nothing logged for ${args.date}`);
      const body = stripSystemFields(existing);
      await ctx.db.delete(existing._id);
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_clear_custom_metric",
        summary: `Cleared ${metric.title} on ${args.date}`,
        targetType: "custom_metric_entry",
        targetId: String(existing._id),
        undoPayload: { kind: "restore_custom_metric_entry", body },
      });
      // Clearing a bound metric is not permanent: the next sync refills the
      // day, because deleting the row takes the manual flag with it.
      return { ok: true, date: args.date, value: null, cleared: true };
    }

    if (!Number.isFinite(args.value)) throw new Error("value must be a number");
    const value = clampCustomMetricValue(args.value);
    // Anything arriving here was asked for by a person, so the day is marked
    // manual and the health sync stops overwriting it.
    if (existing) {
      const previous = existing.value;
      const previousManual = existing.manual ?? null;
      await ctx.db.patch(existing._id, {
        value,
        manual: true,
        updatedAt: Date.now(),
      });
      await recordUndoableAction(ctx, {
        userId: args.userId,
        kind: "api_set_custom_metric",
        summary: `Set ${metric.title} to ${value} on ${args.date}`,
        targetType: "custom_metric_entry",
        targetId: String(existing._id),
        undoPayload: {
          kind: "restore_custom_metric_entry_value",
          id: String(existing._id),
          value: previous,
          manual: previousManual,
        },
      });
      return { ok: true, date: args.date, value, created: false };
    }

    const id = await ctx.db.insert("customProgressMetricEntries", {
      userId: args.userId,
      metricId: metric._id,
      date: args.date,
      value,
      manual: true,
      updatedAt: Date.now(),
    });
    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_set_custom_metric",
      summary: `Logged ${metric.title} ${value} on ${args.date}`,
      targetType: "custom_metric_entry",
      targetId: String(id),
      undoPayload: { kind: "delete_custom_metric_entry", id: String(id) },
    });
    return { ok: true, date: args.date, value, created: true };
  },
});

export const deleteCustomMetric = internalMutation({
  args: { userId: v.string(), metricId: v.string() },
  handler: async (ctx, args) => {
    const metric = await loadCustomMetric(ctx, args.userId, args.metricId);

    const entries: Array<Record<string, unknown>> = [];
    for await (const entry of ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId", (q) =>
        q.eq("userId", args.userId).eq("metricId", metric._id),
      )) {
      entries.push(stripSystemFields(entry));
      await ctx.db.delete(entry._id);
    }
    // The dashboard widgets pointing at this metric go too — the app does the
    // same, because a widget with no source renders as an empty box nobody can
    // remove.
    const widgets: Array<Record<string, unknown>> = [];
    for await (const widget of ctx.db
      .query("dashboardWidgets")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))) {
      if (widget.sourceMetricId !== metric._id) continue;
      widgets.push(stripSystemFields(widget));
      await ctx.db.delete(widget._id);
    }
    const body = stripSystemFields(metric);
    await ctx.db.delete(metric._id);

    await recordUndoableAction(ctx, {
      userId: args.userId,
      kind: "api_delete_custom_metric",
      summary: `Deleted the custom metric ${metric.title}`,
      targetType: "custom_metric",
      targetId: String(metric._id),
      // The entries and widgets carry the old metric id, so a handler putting
      // this back has to insert the definition first and rewrite `metricId` /
      // `sourceMetricId` to whatever id the insert returns.
      undoPayload: { kind: "restore_custom_metric", body, entries, widgets },
    });
    return {
      ok: true,
      deleted: metric.title,
      entries: entries.length,
      widgets: widgets.length,
    };
  },
});
