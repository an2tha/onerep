import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const MAX_GOALS = 20;
const MAX_PINNED_GOALS = 6;
const MAX_GOAL_TASKS = 12;

const goalTaskValidator = v.object({
  title: v.string(),
  detail: v.optional(v.string()),
  completed: v.optional(v.boolean()),
});

function clampText(value: string, max: number) {
  return value.trim().slice(0, max);
}

function clampLimit(value: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value ?? 0)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value ?? fallback)));
}

function normalizeDate(value: string) {
  const date = clampText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === date ? date : null;
}

function calculateEndDate(startDate: string, durationDays: number) {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + durationDays - 1);
  return date.toISOString().slice(0, 10);
}

async function withTasks(ctx: QueryCtx, goal: Doc<"coachGoals">) {
  const tasks = await ctx.db
    .query("coachGoalTasks")
    .withIndex("by_goalId_and_sortOrder", (q) => q.eq("goalId", goal._id))
    .take(MAX_GOAL_TASKS);
  return { ...goal, tasks };
}

export const listPinned = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const goals = await ctx.db
      .query("coachGoals")
      .withIndex("by_userId_and_pinned", (q) =>
        q.eq("userId", user._id).eq("pinned", true),
      )
      .order("desc")
      .take(clampLimit(args.limit, 4, MAX_PINNED_GOALS));
    return await Promise.all(goals.map((goal) => withTasks(ctx, goal)));
  },
});

export const listActive = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const goals = await ctx.db
      .query("coachGoals")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .order("desc")
      .take(clampLimit(args.limit, 12, MAX_GOALS));
    return await Promise.all(goals.map((goal) => withTasks(ctx, goal)));
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("coachGoals")),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.string(),
    durationDays: v.number(),
    pinned: v.optional(v.boolean()),
    sourceMode: v.optional(v.string()),
    tasks: v.optional(v.array(goalTaskValidator)),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const title = clampText(args.title, 80);
    if (!title) throw new Error("Goal title is required");
    const startDate = normalizeDate(args.startDate);
    if (!startDate) throw new Error("Goal start date must use YYYY-MM-DD");
    const durationDays = Math.round(args.durationDays);
    if (
      !Number.isFinite(durationDays) ||
      durationDays < 1 ||
      durationDays > 365
    ) {
      throw new Error("Goal duration must be between 1 and 365 days");
    }
    const existing = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (!existing || existing.userId !== user._id)) {
      throw new Error("Goal not found or access denied");
    }
    const tasks = args.tasks?.slice(0, MAX_GOAL_TASKS).map((task) => ({
      title: clampText(task.title, 90),
      ...(task.detail ? { detail: clampText(task.detail, 180) } : {}),
      completed: task.completed ?? false,
    }));
    if (!existing && (!tasks || tasks.length === 0)) {
      throw new Error("A goal needs at least one task");
    }
    if (tasks?.some((task) => !task.title)) {
      throw new Error("Every goal task needs a title");
    }
    const now = Date.now();
    const status =
      tasks && tasks.length > 0 && tasks.every((task) => task.completed)
        ? ("completed" as const)
        : existing?.status === "completed" && !tasks
          ? ("completed" as const)
          : ("active" as const);
    const body = {
      title,
      ...(args.description
        ? { description: clampText(args.description, 280) }
        : {}),
      startDate,
      endDate: calculateEndDate(startDate, durationDays),
      durationDays,
      status,
      pinned: args.pinned ?? existing?.pinned ?? false,
      ...(args.sourceMode
        ? { sourceMode: clampText(args.sourceMode, 24) }
        : {}),
      updatedAt: now,
    };
    const goalId = existing
      ? existing._id
      : await ctx.db.insert("coachGoals", {
          userId: user._id,
          ...body,
          createdAt: now,
        });
    if (existing) await ctx.db.patch(existing._id, body);

    if (tasks) {
      const previousTasks = await ctx.db
        .query("coachGoalTasks")
        .withIndex("by_goalId_and_sortOrder", (q) => q.eq("goalId", goalId))
        .take(MAX_GOAL_TASKS + 1);
      for (const task of previousTasks) await ctx.db.delete(task._id);
      for (const [sortOrder, task] of tasks.entries()) {
        await ctx.db.insert("coachGoalTasks", {
          userId: user._id,
          goalId,
          title: task.title,
          ...(task.detail ? { detail: task.detail } : {}),
          completed: task.completed,
          sortOrder,
          ...(task.completed ? { completedAt: now } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return { goalId, created: !existing };
  },
});

export const setPinned = mutation({
  args: { id: v.id("coachGoals"), pinned: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const goal = await ctx.db.get(args.id);
    if (!goal || goal.userId !== user._id) {
      throw new Error("Goal not found or access denied");
    }
    await ctx.db.patch(goal._id, {
      pinned: args.pinned,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setTaskCompleted = mutation({
  args: { id: v.id("coachGoalTasks"), completed: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== user._id) {
      throw new Error("Goal task not found or access denied");
    }
    const now = Date.now();
    await ctx.db.patch(task._id, {
      completed: args.completed,
      ...(args.completed ? { completedAt: now } : {}),
      updatedAt: now,
    });
    const tasks = await ctx.db
      .query("coachGoalTasks")
      .withIndex("by_goalId_and_sortOrder", (q) => q.eq("goalId", task.goalId))
      .take(MAX_GOAL_TASKS + 1);
    const allCompleted = tasks.every((item) =>
      item._id === task._id ? args.completed : item.completed,
    );
    const goal = await ctx.db.get(task.goalId);
    if (goal && goal.userId === user._id) {
      await ctx.db.patch(goal._id, {
        status: allCompleted ? "completed" : "active",
        updatedAt: now,
      });
    }
    return null;
  },
});
