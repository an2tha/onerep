import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

// ── logCompletion ─────────────────────────────────────────────────────────────

export const completion = mutation({
  args: {
    date: v.string(),
    exercises: v.array(v.any()),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
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
    const user = await authComponent.getAuthUser(ctx);
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
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return [];
    return ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

// ── remove ────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: { id: v.id("workoutLogs") },
  handler: async (ctx, { id }) => {
    const user = await authComponent.getAuthUser(ctx);
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
    const user = await authComponent.getAuthUser(ctx);
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
