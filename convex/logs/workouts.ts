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
  rpe: v.optional(v.number()),
  rir: v.optional(v.number()),
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
    // A stable client-generated key makes an offline retry idempotent while
    // allowing more than one completed session on the same calendar day.
    sessionId: v.optional(v.string()),
    slot: v.optional(v.union(v.literal(1), v.literal(2))),
    exercises: v.array(completedExerciseValidator),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Old clients did not send a session ID. Keep their one-log-per-day
    // behavior intact, while new clients can safely create two daily sessions.
    const sessionId = args.sessionId ?? `legacy:${args.date}`;
    const existing = args.sessionId
      ? await ctx.db
          .query("workoutLogs")
          .withIndex("by_userId_and_date_and_sessionId", (q) =>
            q
              .eq("userId", user._id)
              .eq("date", args.date)
              .eq("sessionId", sessionId),
          )
          .unique()
      : (
          await ctx.db
            .query("workoutLogs")
            .withIndex("by_userId_date", (q) =>
              q.eq("userId", user._id).eq("date", args.date),
            )
            .take(2)
        ).find(
          (log) => log.sessionId === undefined || log.sessionId === sessionId,
        );

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionId,
        ...(args.slot === undefined ? {} : { slot: args.slot }),
        exercises: args.exercises,
        durationSeconds: args.durationSeconds,
        completedAt: now,
      });
    } else {
      await ctx.db.insert("workoutLogs", {
        userId: user._id,
        date: args.date,
        sessionId,
        ...(args.slot === undefined ? {} : { slot: args.slot }),
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
    if (!user) return [];

    const logs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .take(2);

    return logs.sort((a, b) => {
      if (a.slot !== undefined && b.slot !== undefined) return a.slot - b.slot;
      if (a.slot !== undefined) return -1;
      if (b.slot !== undefined) return 1;
      return a.completedAt - b.completedAt;
    });
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
      .take(120);
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
      .order("desc")
      .take(120);
    return logs
      .reverse()
      .filter((log) => log.exercises.some((e: any) => e.id === exerciseId))
      .map((log) => {
        const ex = log.exercises.find((e: any) => e.id === exerciseId)!;
        return {
          id: String(log._id),
          date: log.date as string,
          sets: ex.sets as Array<{
            weight: number;
            reps: number;
            completed: boolean;
            type: string;
          }>,
        };
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
      .take(2);

    const target = logs.find((log) => log.slot === slot) ?? logs[slot - 1];
    if (!target) throw new Error("Workout slot not found");
    await ctx.db.delete(target._id);
    return { ok: true };
  },
});
