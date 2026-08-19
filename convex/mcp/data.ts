import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { upsertWorkoutLog, findFreeWorkoutSlot } from "../lib/workoutLogs";
import { recordUndoableAction } from "../ai/coachState";

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

    return rows.map((row) => ({
      id: row._id,
      date: row.loggedAt,
      weightKg: row.weightKg ?? null,
      bodyFatPct: row.bodyFatPct ?? null,
      waistCm: row.waistCm ?? null,
    }));
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
 * store keyed on the local day, so a value written over the API would be
 * overwritten by the next device sync without warning. Deleting a day is
 * offered because a bad sensor reading is worth removing; inventing one is not.
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
