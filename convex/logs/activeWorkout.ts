import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

// ── getActive ─────────────────────────────────────────────────────────────────

export const getActive = query({
  args: { slot: v.union(v.literal(1), v.literal(2)) },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
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
    const user = await authComponent.safeGetAuthUser(ctx);
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
    const user = await authComponent.getAuthUser(ctx);
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
    const user = await authComponent.getAuthUser(ctx);
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
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const active = await ctx.db
      .query("activeWorkouts")
      .withIndex("by_userId_slot", (q) =>
        q.eq("userId", user._id).eq("slot", args.slot)
      )
      .first();

    if (!active) return { ok: true }; // Nothing to abort

    await ctx.db.patch(active._id, {
      completedAt: Date.now(),
    });

    return { ok: true };
  },
});

// ── finishActive ──────────────────────────────────────────────────────────────

export const finishActive = mutation({
  args: {
    slot: v.union(v.literal(1), v.literal(2)),
    exercises: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        sets: v.array(
          v.object({
            type: v.string(),
            reps: v.number(),
            weight: v.number(),
            completed: v.boolean(),
          }),
        ),
      }),
    ),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
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

    // Check if already completed
    if (active.completedAt) {
      throw new Error("Workout already completed");
    }

    // Mark as completed
    await ctx.db.patch(active._id, {
      completedAt: Date.now(),
    });

    // Log the workout
    const now = Date.now();
    const today = new Date(now).toISOString().split("T")[0];

    const existing = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", today)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        exercises: [...(existing.exercises || []), ...args.exercises],
        durationSeconds: (existing.durationSeconds || 0) + args.durationSeconds,
        completedAt: now,
      });
    } else {
      await ctx.db.insert("workoutLogs", {
        userId: user._id,
        date: today,
        exercises: args.exercises,
        durationSeconds: args.durationSeconds,
        completedAt: now,
      });
    }

    return { ok: true };
  },
});
