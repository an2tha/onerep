import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const heartRateZonesValidator = v.object({
  zone1Seconds: v.optional(v.number()),
  zone2Seconds: v.optional(v.number()),
  zone3Seconds: v.optional(v.number()),
  zone4Seconds: v.optional(v.number()),
  zone5Seconds: v.optional(v.number()),
});

const cardioDetailsValidator = v.object({
  distanceMeters: v.optional(v.number()),
  distanceUnit: v.optional(v.union(v.literal("km"), v.literal("mi"))),
  durationSeconds: v.optional(v.number()),
  paceSecondsPerKm: v.optional(v.number()),
  avgHeartRateBpm: v.optional(v.number()),
  maxHeartRateBpm: v.optional(v.number()),
  heartRateZones: v.optional(heartRateZonesValidator),
  route: v.optional(
    v.object({
      name: v.optional(v.string()),
      url: v.optional(v.string()),
    }),
  ),
  source: v.optional(
    v.object({
      provider: v.union(
        v.literal("manual"),
        v.literal("apple_health"),
        v.literal("strava"),
        v.literal("garmin"),
        v.literal("fitbit"),
        v.literal("gpx"),
        v.literal("other"),
      ),
      name: v.optional(v.string()),
      externalId: v.optional(v.string()),
      importedAt: v.optional(v.string()),
    }),
  ),
  notes: v.optional(v.string()),
});

const completedSetValidator = v.object({
  type: v.string(), // "normal", "warmup", "dropset", "failure"
  reps: v.number(),
  weight: v.number(),
  completed: v.boolean(),
});

const completedExerciseValidator = v.object({
  id: v.string(),
  name: v.string(),
  category: v.optional(v.string()),
  sets: v.array(completedSetValidator),
  cardio: v.optional(cardioDetailsValidator),
});

// ── logCompletion ─────────────────────────────────────────────────────────────

export const completion = mutation({
  args: {
    date: v.string(),
    exercises: v.array(completedExerciseValidator),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        exercises: args.exercises,
        durationSeconds: args.durationSeconds,
        completedAt: now,
      });
    } else {
      await ctx.db.insert("workoutLogs", {
        userId: user._id,
        date: args.date,
        exercises: args.exercises,
        durationSeconds: args.durationSeconds,
        completedAt: now,
      });
    }

    return { ok: true };
  },
});

// ── getLog ────────────────────────────────────────────────────────────────────

export const getLog = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();
  },
});

// ── getHistory ────────────────────────────────────────────────────────────────

export const getHistory = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    return ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

// ── historyForExercise ────────────────────────────────────────────────────────

export const historyForExercise = query({
  args: { exerciseId: v.string() },
  handler: async (ctx, { exerciseId }) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const logs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
      .order("asc")
      .collect();
    return logs
      .filter((log) => log.exercises.some((e: any) => e.id === exerciseId))
      .map((log) => {
        const ex = log.exercises.find((e: any) => e.id === exerciseId)!;
        return { date: log.date as string, sets: ex.sets as Array<{ weight: number; reps: number; completed: boolean; type: string }> };
      });
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("workoutLogs") },
  handler: async (ctx, { id }) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const log = await ctx.db.get(id);
    if (!log || log.userId !== user._id) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});

// ── removeBySlot ────────────────────────────────────────────────────────────────

export const removeBySlot = mutation({
  args: { date: v.string(), slot: v.union(v.literal(1), v.literal(2)) },
  handler: async (ctx, { date, slot }) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const logs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", date),
      )
      .collect();

    const target = logs[slot - 1];
    if (!target) throw new Error("Workout slot not found");
    await ctx.db.delete(target._id);
    return { ok: true };
  },
});
