import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";
import { restartChoices, restartNudgeDue, RESTART_GAP_MS } from "./lib/restart";
import { zonedNow } from "../packages/models/src/moments";

async function planFor(ctx: QueryCtx, userId: string) {
  return ctx.db
    .query("restartPlans")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** Bounded reads by last write, including retroactive logging. Sensor imports
 * are not evidence of opening the app. If a bound is exhausted, stay quiet. */
async function lastLog(ctx: QueryCtx, userId: string) {
  const rows = await Promise.all([
    ctx.db
      .query("dailyCheckIns")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(1),
    ctx.db
      .query("restDays")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1),
    ctx.db
      .query("foodLogs")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("waterLogs")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("supplementLogs")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_completedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1),
    ctx.db
      .query("journalEntries")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1),
    ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("supplementIntakeLogs")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1),
    ctx.db
      .query("coachCheckIns")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1),
    ctx.db
      .query("fastingSessions")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1),
    ctx.db
      .query("healthMetrics")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30),
    ctx.db
      .query("recoveryCheckIns")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1),
  ]);
  const timestamps: number[] = [];
  for (const group of rows) {
    const row = group.find((r) => {
      if ("entries" in r) return r.entries.length > 0;
      if ("source" in r && r.source === "health") return false;
      if ("metricId" in r && r.manual === false) return false;
      if ("provider" in r && r.provider !== "manual" && !r.manualFields?.length)
        return false;
      return true;
    });
    if (row)
      timestamps.push(
        Math.max(
          row._creationTime,
          "updatedAt" in row
            ? row.updatedAt
            : "completedAt" in row
              ? row.completedAt
              : row._creationTime,
        ),
      );
    else if (group.length === 30) return null;
  }
  return timestamps.length ? Math.max(...timestamps) : null;
}

export const get = query({
  args: { clockKey: v.string() },
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return { plan: null, nudgeDue: false, draftKey: null };
    const plan = await planFor(ctx, user._id);
    const draftKey = `onerep:restart:${user._id}`;
    if (plan?.status === "active" || Date.now() < (plan?.quietUntil ?? 0))
      return { plan, draftKey, nudgeDue: false };
    const [lastLoggedAt, recovery] = await Promise.all([
      lastLog(ctx, user._id),
      ctx.db
        .query("recoveryEpisodes")
        .withIndex("by_userId_and_active", (q) =>
          q.eq("userId", user._id).eq("active", true),
        )
        .first(),
    ]);
    return {
      draftKey,
      plan,
      nudgeDue: restartNudgeDue(
        lastLoggedAt,
        Date.now(),
        plan?.quietUntil ?? 0,
        Boolean(recovery),
      ),
    };
  },
});

export const save = mutation({
  args: restartChoices,
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const anchor = args.anchor.trim();
    if (!anchor || anchor.length > 100)
      throw new Error("Choose a daily anchor under 100 characters.");
    const plan = await planFor(ctx, user._id);
    const values = {
      ...args,
      startedAt: plan?.status === "active" ? (plan.startedAt ?? plan._creationTime) : Date.now(),
      anchor,
      status: "active" as const,
      stage: plan?.status === "active" ? plan.stage : 0,
      quietUntil: 0,
      updatedAt: Date.now(),
    };
    if (plan)
      await ctx.db.patch(plan._id, {
        ...values,
        lastActionOn: plan.status === "active" ? plan.lastActionOn : undefined,
      });
    else await ctx.db.insert("restartPlans", { userId: user._id, ...values });
  },
});

export const advance = mutation({
  args: { expectedStage: v.number() },
  handler: async (ctx, { expectedStage }) => {
    const user = await getAuthUser(ctx);
    const plan = await planFor(ctx, user._id);
    if (!plan || plan.status !== "active")
      throw new Error("Open your restart plan again to continue.");
    if (plan.stage !== expectedStage) return; // Double taps and stale devices cannot skip a step.
    const preferences = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    const today = zonedNow(preferences?.lastActiveTimezone ?? "UTC").todayKey;
    if (plan.stage === 2 && plan.lastActionOn === today)
      throw new Error(
        "There is nothing more to do today. Come back another day to repeat your small action.",
      );
    // A rest commitment is the same deliberate rest shown in Training.
    if (plan.action === "rest" && plan.stage >= 1) {
      const existing = await ctx.db.query("restDays")
        .withIndex("by_userId_and_date", q => q.eq("userId", user._id).eq("date", today)).unique();
      if (!existing) await ctx.db.insert("restDays", {
        userId: user._id, date: today, source: "restart", createdAt: Date.now(),
      });
    }
    const stage = plan.stage + 1;
    await ctx.db.patch(plan._id, {
      stage,
      lastActionOn: today,
      updatedAt: Date.now(),
      status: stage >= 3 ? "completed" : "active",
      quietUntil: stage >= 3 ? Date.now() + RESTART_GAP_MS : 0,
    });
  },
});

export const pause = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    const plan = await planFor(ctx, user._id);
    if (plan)
      await ctx.db.patch(plan._id, {
        status: "paused",
        quietUntil: Date.now() + RESTART_GAP_MS,
        updatedAt: Date.now(),
      });
  },
});

export const dismissNudge = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    const plan = await planFor(ctx, user._id);
    const values = {
      quietUntil: Date.now() + RESTART_GAP_MS,
      updatedAt: Date.now(),
    };
    if (plan) await ctx.db.patch(plan._id, values);
    else
      await ctx.db.insert("restartPlans", {
        userId: user._id,
        status: "dismissed",
        stage: 0,
        ...values,
      });
  },
});
