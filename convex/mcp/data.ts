import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { upsertWorkoutLog, findFreeWorkoutSlot } from "../lib/workoutLogs";

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
  durationSeconds: number;
  exercises: unknown[];
}) {
  const exercises = log.exercises as Array<Record<string, unknown>>;
  return {
    date: log.date,
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

    return { ok: true, amountMl, date: args.date };
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

    return { ok: true, logged: entry.name, date: args.date };
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

    if (existing) {
      await ctx.db.patch(existing._id, {
        weightKg: args.weightKg,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("bodyMeasurements", {
        userId: args.userId,
        clientId: `mcp-${now}-${Math.floor(Math.random() * 1e6)}`,
        loggedAt: args.date,
        weightKg: args.weightKg,
        createdAt: now,
        updatedAt: now,
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

    return { ok: true, date: args.date, exercises: exercises.length };
  },
});

export const markRestDays = internalMutation({
  args: { userId: v.string(), dates: v.array(v.string()) },
  handler: async (ctx, args) => {
    const dates = [...new Set(args.dates)].slice(0, 31);
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
      marked++;
    }

    return { ok: true, marked };
  },
});
