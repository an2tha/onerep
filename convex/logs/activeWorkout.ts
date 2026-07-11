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
  type: v.string(),
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

// ── getActive ─────────────────────────────────────────────────────────────────

export const getActive = query({
  args: { slot: v.union(v.literal(1), v.literal(2)) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    const active = await ctx.db
      .query("activeWorkouts")
      .withIndex("by_userId_slot", (q) =>
        q.eq("userId", user._id).eq("slot", args.slot)
      )
      .first();

    // Return null if completed
    if (active?.completedAt) return null;
    return active;
  },
});

// ── getAllActive ──────────────────────────────────────────────────────────────

export const getAllActive = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    return ctx.db
      .query("activeWorkouts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect()
      .then((workouts) => workouts.filter((w) => !w.completedAt));
  },
});

// ── createActive ──────────────────────────────────────────────────────────────

export const createActive = mutation({
  args: {
    slot: v.union(v.literal(1), v.literal(2)),
    presetId: v.optional(v.string()),
    items: v.array(v.any()),
    exerciseData: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Remove any existing active workout for this slot
    const existing = await ctx.db
      .query("activeWorkouts")
      .withIndex("by_userId_slot", (q) =>
        q.eq("userId", user._id).eq("slot", args.slot)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const now = Date.now();
    const id = await ctx.db.insert("activeWorkouts", {
      userId: user._id,
      slot: args.slot,
      presetId: args.presetId,
      items: args.items,
      exerciseData: args.exerciseData,
      startedAt: now,
      elapsedSeconds: 0,
      completedAt: undefined,
    });

    return { id, startedAt: now };
  },
});

// ── updateActive ──────────────────────────────────────────────────────────────

export const updateActive = mutation({
  args: {
    slot: v.union(v.literal(1), v.literal(2)),
    items: v.array(v.any()),
    exerciseData: v.any(),
    elapsedSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const active = await ctx.db
      .query("activeWorkouts")
      .withIndex("by_userId_slot", (q) =>
        q.eq("userId", user._id).eq("slot", args.slot)
      )
      .first();

    if (!active || active.completedAt) {
      throw new Error("No active workout found");
    }

    await ctx.db.patch(active._id, {
      items: args.items,
      exerciseData: args.exerciseData,
      elapsedSeconds: args.elapsedSeconds,
    });

    return { ok: true };
  },
});

// ── abortActive ───────────────────────────────────────────────────────────────

export const abortActive = mutation({
  args: { slot: v.union(v.literal(1), v.literal(2)) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const active = await ctx.db
      .query("activeWorkouts")
      .withIndex("by_userId_slot", (q) =>
        q.eq("userId", user._id).eq("slot", args.slot)
      )
      .first();

    if (!active) return { ok: true }; // Nothing to abort

    // Aborted workouts are disposable draft state. Delete instead of marking
    // complete so active-workout queries and client cache refreshes cannot
    // resurrect them as live sessions.
    await ctx.db.delete(active._id);

    return { ok: true };
  },
});

// ── finishActive ──────────────────────────────────────────────────────────────

export const finishActive = mutation({
  args: {
    slot: v.union(v.literal(1), v.literal(2)),
    exercises: v.array(completedExerciseValidator),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const active = await ctx.db
      .query("activeWorkouts")
      .withIndex("by_userId_slot", (q) =>
        q.eq("userId", user._id).eq("slot", args.slot)
      )
      .first();

    if (!active) {
      throw new Error("No active workout found");
    }

    const now = Date.now();
    const today = new Date(now).toISOString().split("T")[0];
    const sessionId = String(active._id);
    const existingLog = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_date_and_sessionId", (q) =>
        q.eq("userId", user._id).eq("date", today).eq("sessionId", sessionId),
      )
      .unique();

    // A retry after an interrupted request is a successful no-op once the
    // session log exists. If a request stopped after marking the active record
    // complete but before inserting the log, the retry safely finishes it.
    if (existingLog) {
      if (!active.completedAt) {
        await ctx.db.patch(active._id, { completedAt: now });
      }
      return { ok: true };
    }

    if (!active.completedAt) {
      await ctx.db.patch(active._id, { completedAt: now });
    }

    // A completed active workout is a distinct session. This prevents a second
    // workout on the same day from overwriting or silently merging into the
    // first one.
    await ctx.db.insert("workoutLogs", {
      userId: user._id,
      date: today,
      sessionId,
      slot: args.slot,
      exercises: args.exercises,
      durationSeconds: args.durationSeconds,
      completedAt: now,
    });

    return { ok: true };
  },
});
