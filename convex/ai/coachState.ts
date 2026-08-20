import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { APP_UPDATE_REQUIRED } from "../lib/uploads";
import {
  restoreNutritionTargets,
  type NutritionTargetSnapshot,
} from "../lib/nutritionTargets";

const MAX_HISTORY = 40;
const MAX_MEMORIES = 50;
const MAX_CHECK_INS = 30;
function clampLimit(value: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value ?? 0)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value ?? fallback)));
}

function clampText(value: string, max: number) {
  return value.trim().slice(0, max);
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/**
 * Records an undoable action against the coach's history.
 *
 * Exported because the public API and the MCP tools write through the same
 * feed: an agent that logs a meal over HTTP should show up in the same list,
 * behind the same undo button, as one that logged it through chat. A write the
 * user cannot find is a write the user cannot take back.
 */
export async function recordUndoableAction(
  ctx: MutationCtx,
  args: {
    userId: string;
    kind: string;
    summary: string;
    targetType: string;
    targetId?: string;
    undoPayload: unknown;
  },
) {
  return await insertActionEvent(ctx, args);
}

async function insertActionEvent(
  ctx: MutationCtx,
  args: {
    userId: string;
    kind: string;
    summary: string;
    targetType: string;
    targetId?: string;
    undoPayload: unknown;
  },
) {
  return await ctx.db.insert("coachActionEvents", {
    userId: args.userId,
    kind: clampText(args.kind, 48),
    summary: clampText(args.summary, 180),
    status: "applied",
    targetType: clampText(args.targetType, 32),
    ...(args.targetId ? { targetId: clampText(args.targetId, 100) } : {}),
    undoPayload: args.undoPayload,
    createdAt: Date.now(),
  });
}

export const listMemories = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("coachMemories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(clampLimit(args.limit, 30, MAX_MEMORIES));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthUser(ctx);
    throw new Error(APP_UPDATE_REQUIRED);
  },
});

export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    mimeType: v.string(),
    fileName: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    await getAuthUser(ctx);
    void args;
    throw new Error(APP_UPDATE_REQUIRED);
  },
});

export const removeUpload = mutation({
  args: { id: v.id("coachUploads") },
  handler: async (ctx, args) => {
    await getAuthUser(ctx);
    void args;
    throw new Error(APP_UPDATE_REQUIRED);
  },
});

export const resolveUploadForModel = internalQuery({
  args: { id: v.id("fileUploads"), userId: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.id);
    if (
      !upload ||
      upload.userId !== args.userId ||
      upload.purpose !== "coach_image" ||
      (upload.status !== "ready" && upload.status !== "attached") ||
      !upload.storageId ||
      upload.expiresAt <= Date.now()
    ) {
      return null;
    }
    const url = await ctx.storage.getUrl(upload.storageId);
    return url
      ? {
          url,
          mimeType: upload.actualMimeType ?? upload.expectedMimeType,
          fileName: upload.fileName ?? "coach-image",
        }
      : null;
  },
});

export const cleanupExpiredUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("coachUploads")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(50);
    for (const upload of expired) {
      await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }
    return { deleted: expired.length };
  },
});

export const setMemory = mutation({
  args: {
    key: v.string(),
    category: v.string(),
    value: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const key = clampText(args.key, 64).toLowerCase();
    const category = clampText(args.category, 32) || "preference";
    const value = clampText(args.value, 240);
    if (!key || !value) throw new Error("Memory key and value are required");

    const existing = await ctx.db
      .query("coachMemories")
      .withIndex("by_userId_and_key", (q) =>
        q.eq("userId", user._id).eq("key", key),
      )
      .unique();
    const previous = existing
      ? {
          key: existing.key,
          category: existing.category,
          value: existing.value,
          source: existing.source,
        }
      : null;
    const now = Date.now();
    let memoryId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        category,
        value,
        source: clampText(args.source ?? "coach", 32) || "coach",
        updatedAt: now,
      });
      memoryId = existing._id;
    } else {
      memoryId = await ctx.db.insert("coachMemories", {
        userId: user._id,
        key,
        category,
        value,
        source: clampText(args.source ?? "coach", 32) || "coach",
        updatedAt: now,
      });
    }

    const actionId = await insertActionEvent(ctx, {
      userId: user._id,
      kind: "remember",
      summary: `Remembered ${key}: ${value}`,
      targetType: "memory",
      targetId: String(memoryId),
      undoPayload: { kind: "restore_memory", key, previous },
    });
    return { memoryId, actionId };
  },
});

export const removeMemory = mutation({
  args: { id: v.id("coachMemories") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const memory = await ctx.db.get(args.id);
    if (!memory || memory.userId !== user._id) {
      throw new Error("Memory not found or access denied");
    }
    const actionId = await insertActionEvent(ctx, {
      userId: user._id,
      kind: "forget_memory",
      summary: `Forgot ${memory.key}: ${memory.value}`,
      targetType: "memory",
      targetId: String(memory._id),
      undoPayload: {
        kind: "restore_memory",
        key: memory.key,
        previous: {
          key: memory.key,
          category: memory.category,
          value: memory.value,
          source: memory.source,
        },
      },
    });
    await ctx.db.delete(args.id);
    return { actionId };
  },
});

export const listCheckIns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("coachCheckIns")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(clampLimit(args.limit, 14, MAX_CHECK_INS));
  },
});

export const saveCheckIn = mutation({
  args: {
    date: v.string(),
    kind: v.optional(
      v.union(
        v.literal("daily"),
        v.literal("post_workout"),
        v.literal("weekly"),
      ),
    ),
    energy: v.number(),
    soreness: v.number(),
    sleepQuality: v.number(),
    mood: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const date = clampText(args.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Check-in date must use YYYY-MM-DD");
    }
    const kind = args.kind ?? "daily";
    const existing = await ctx.db
      .query("coachCheckIns")
      .withIndex("by_userId_and_date_and_kind", (q) =>
        q.eq("userId", user._id).eq("date", date).eq("kind", kind),
      )
      .unique();
    const previous = existing
      ? {
          date: existing.date,
          kind: existing.kind ?? kind,
          energy: existing.energy,
          soreness: existing.soreness,
          sleepQuality: existing.sleepQuality,
          mood: existing.mood,
          ...(existing.note ? { note: existing.note } : {}),
        }
      : null;
    const body = {
      energy: clampScore(args.energy),
      soreness: clampScore(args.soreness),
      sleepQuality: clampScore(args.sleepQuality),
      mood: clampScore(args.mood),
      ...(args.note ? { note: clampText(args.note, 280) } : {}),
      updatedAt: Date.now(),
    };
    let checkInId;
    if (existing) {
      await ctx.db.patch(existing._id, body);
      checkInId = existing._id;
    } else {
      checkInId = await ctx.db.insert("coachCheckIns", {
        userId: user._id,
        date,
        kind,
        ...body,
        createdAt: Date.now(),
      });
    }
    const actionId = await insertActionEvent(ctx, {
      userId: user._id,
      kind: "check_in",
      summary: `Saved ${date} recovery check-in`,
      targetType: "check_in",
      targetId: String(checkInId),
      undoPayload: {
        kind: "restore_check_in",
        date,
        checkInKind: kind,
        previous,
      },
    });
    return { checkInId, actionId };
  },
});

/** Per-meal macros, rounded and bounded. Absent stays absent. */
function clampMealMacros(meal: {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}) {
  const bound = (value: number | undefined, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(max, Math.round(value)))
      : undefined;
  const macros = {
    calories: bound(meal.calories, 5000),
    protein: bound(meal.protein, 500),
    carbs: bound(meal.carbs, 1000),
    fat: bound(meal.fat, 400),
  };
  return Object.fromEntries(
    Object.entries(macros).filter(([, value]) => value !== undefined),
  ) as Partial<typeof macros>;
}

const weeklyPlanDayValidator = v.object({
  day: v.string(),
  workoutPresetId: v.optional(v.string()),
  workoutLabel: v.optional(v.string()),
  meals: v.array(
    v.object({
      label: v.string(),
      recipeId: v.optional(v.string()),
      note: v.optional(v.string()),
      // Optional per-meal macros. A plan that names the meals but not their
      // numbers cannot carry a prescribed intake: the user is left adding the
      // day up themselves, which is the work the plan was meant to do.
      calories: v.optional(v.number()),
      protein: v.optional(v.number()),
      carbs: v.optional(v.number()),
      fat: v.optional(v.number()),
    }),
  ),
  recoveryNote: v.optional(v.string()),
});

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Snaps a YYYY-MM-DD date to the Monday that starts its ISO week.
 *
 * The model picks `weekStart` freely, but every reader (the Today widget, and
 * any future one) anchors weeks on Monday. Normalising on write means a
 * Sunday-anchored plan can't become invisible.
 *
 * Returns null rather than throwing on unusable input: `toISOString()` raises a
 * RangeError on an Invalid Date, which would turn a lookup miss into a hard
 * query failure. Both the format and the resulting date are checked — a
 * well-formed but impossible date like "2026-13-45" passes the pattern and
 * still yields an Invalid Date.
 */
function mondayOf(dateIso: string): string | null {
  if (!WEEK_START_PATTERN.test(dateIso)) return null;
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

export const getWeeklyPlan = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const weekStart = mondayOf(clampText(args.weekStart, 10));
    // A lookup for an unusable week is a miss, not an error.
    if (!weekStart) return null;
    return await ctx.db
      .query("coachWeeklyPlans")
      .withIndex("by_userId_and_weekStart", (q) =>
        q.eq("userId", user._id).eq("weekStart", weekStart),
      )
      .unique();
  },
});

export const saveWeeklyPlan = mutation({
  args: {
    weekStart: v.string(),
    title: v.string(),
    days: v.array(weeklyPlanDayValidator),
    assumptions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    // Writes still reject bad input loudly — a plan saved under a week the
    // reader can't compute would be invisible from the moment it was written.
    const weekStart = mondayOf(clampText(args.weekStart, 10));
    if (!weekStart) {
      throw new Error("Week start must use YYYY-MM-DD");
    }
    if (args.days.length === 0 || args.days.length > 7) {
      throw new Error("A weekly plan must contain 1 to 7 days");
    }
    const days = args.days.map((day) => ({
      day: clampText(day.day, 3),
      ...(day.workoutPresetId
        ? { workoutPresetId: clampText(day.workoutPresetId, 100) }
        : {}),
      ...(day.workoutLabel
        ? { workoutLabel: clampText(day.workoutLabel, 80) }
        : {}),
      meals: day.meals.slice(0, 6).map((meal) => ({
        label: clampText(meal.label, 80),
        ...(meal.recipeId ? { recipeId: clampText(meal.recipeId, 100) } : {}),
        ...(meal.note ? { note: clampText(meal.note, 180) } : {}),
        ...clampMealMacros(meal),
      })),
      ...(day.recoveryNote
        ? { recoveryNote: clampText(day.recoveryNote, 180) }
        : {}),
    }));
    const assumptions = args.assumptions
      .slice(0, 10)
      .map((item) => clampText(item, 180))
      .filter(Boolean);
    const existing = await ctx.db
      .query("coachWeeklyPlans")
      .withIndex("by_userId_and_weekStart", (q) =>
        q.eq("userId", user._id).eq("weekStart", weekStart),
      )
      .unique();
    const previous = existing
      ? {
          title: existing.title,
          days: existing.days,
          assumptions: existing.assumptions,
          status: existing.status,
        }
      : null;
    const body = {
      title: clampText(args.title, 80) || "Weekly plan",
      days,
      assumptions,
      status: "active" as const,
      updatedAt: Date.now(),
    };
    let planId;
    if (existing) {
      await ctx.db.patch(existing._id, body);
      planId = existing._id;
    } else {
      planId = await ctx.db.insert("coachWeeklyPlans", {
        userId: user._id,
        weekStart,
        ...body,
        createdAt: Date.now(),
      });
    }
    const actionId = await insertActionEvent(ctx, {
      userId: user._id,
      kind: "weekly_plan",
      summary: `Saved ${body.title}`,
      targetType: "weekly_plan",
      targetId: String(planId),
      undoPayload: { kind: "restore_weekly_plan", weekStart, previous },
    });
    return { planId, actionId };
  },
});

export const listActionHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("coachActionEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(clampLimit(args.limit, 20, MAX_HISTORY));
  },
});

export const recordAction = mutation({
  args: {
    kind: v.string(),
    summary: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    undoPayload: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    return await insertActionEvent(ctx, { userId: user._id, ...args });
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function undoPayload(ctx: MutationCtx, userId: string, payload: unknown) {
  if (!isRecord(payload) || typeof payload.kind !== "string") {
    throw new Error("This action cannot be undone");
  }

  if (
    payload.kind === "restore_nutrition_targets" &&
    isRecord(payload.body)
  ) {
    const body = payload.body as {
      customGoals?: unknown;
      waterGoalMl?: unknown;
    };
    await restoreNutritionTargets(ctx, userId, {
      customGoals: isRecord(body.customGoals)
        ? (body.customGoals as NutritionTargetSnapshot["customGoals"])
        : null,
      waterGoalMl:
        typeof body.waterGoalMl === "number" ? body.waterGoalMl : null,
    });
    return;
  }

  if (payload.kind === "delete_recipe" && typeof payload.id === "string") {
    const id = ctx.db.normalizeId("recipes", payload.id);
    const recipe = id ? await ctx.db.get(id) : null;
    if (recipe && recipe.userId === userId) await ctx.db.delete(recipe._id);
    return;
  }

  if (
    payload.kind === "delete_dashboard_widget" &&
    typeof payload.id === "string"
  ) {
    const id = ctx.db.normalizeId("dashboardWidgets", payload.id);
    const widget = id ? await ctx.db.get(id) : null;
    if (widget && widget.userId === userId) {
      for await (const candidate of ctx.db
        .query("dashboardWidgets")
        .withIndex("by_userId", (q) => q.eq("userId", userId))) {
        if (candidate.parentWidgetId === widget._id) {
          await ctx.db.patch(candidate._id, { parentWidgetId: undefined });
        }
      }
      await ctx.db.delete(widget._id);
    }
    return;
  }

  if (
    payload.kind === "delete_progress_metric" &&
    typeof payload.id === "string"
  ) {
    const id = ctx.db.normalizeId("customProgressMetrics", payload.id);
    const metric = id ? await ctx.db.get(id) : null;
    if (metric && metric.userId === userId) {
      for await (const entry of ctx.db
        .query("customProgressMetricEntries")
        .withIndex("by_userId_and_metricId", (q) =>
          q.eq("userId", userId).eq("metricId", metric._id),
        )) {
        await ctx.db.delete(entry._id);
      }
      for await (const widget of ctx.db
        .query("dashboardWidgets")
        .withIndex("by_userId", (q) => q.eq("userId", userId))) {
        if (widget.sourceMetricId === metric._id)
          await ctx.db.delete(widget._id);
      }
      await ctx.db.delete(metric._id);
    }
    return;
  }

  if (
    payload.kind === "delete_supplement_item" &&
    typeof payload.id === "string"
  ) {
    const id = ctx.db.normalizeId("supplementItems", payload.id);
    const item = id ? await ctx.db.get(id) : null;
    if (item && item.userId === userId) await ctx.db.delete(item._id);
    return;
  }

  if (
    payload.kind === "restore_supplement_item" &&
    typeof payload.id === "string" &&
    isRecord(payload.body)
  ) {
    const id = ctx.db.normalizeId("supplementItems", payload.id);
    const item = id ? await ctx.db.get(id) : null;
    if (!item || item.userId !== userId)
      throw new Error("Supplement not found");
    const body = payload.body as Doc<"supplementItems">;
    if (
      typeof body.name !== "string" ||
      typeof body.servingLabel !== "string" ||
      typeof body.defaultServingQuantity !== "number" ||
      !isRecord(body.schedule) ||
      !isRecord(body.nutrientsPerServing)
    ) {
      throw new Error("Invalid supplement undo data");
    }
    await ctx.db.patch(item._id, {
      name: body.name,
      brand: body.brand,
      category: body.category,
      form: body.form,
      servingLabel: body.servingLabel,
      defaultServingQuantity: body.defaultServingQuantity,
      barcode: body.barcode,
      notes: body.notes,
      active: body.active,
      schedule: body.schedule,
      nutrientsPerServing: body.nutrientsPerServing,
      source: body.source,
      updatedAt: Date.now(),
    });
    return;
  }

  if (payload.kind === "delete_goal" && typeof payload.id === "string") {
    const id = ctx.db.normalizeId("coachGoals", payload.id);
    const goal = id ? await ctx.db.get(id) : null;
    if (goal && goal.userId === userId) {
      const tasks = await ctx.db
        .query("coachGoalTasks")
        .withIndex("by_goalId_and_sortOrder", (q) => q.eq("goalId", goal._id))
        .take(13);
      for (const task of tasks) await ctx.db.delete(task._id);
      await ctx.db.delete(goal._id);
    }
    return;
  }

  if (
    payload.kind === "restore_goal" &&
    typeof payload.id === "string" &&
    isRecord(payload.body)
  ) {
    const id = ctx.db.normalizeId("coachGoals", payload.id);
    const goal = id ? await ctx.db.get(id) : null;
    if (!goal || goal.userId !== userId) throw new Error("Goal not found");
    if (
      typeof payload.body.title !== "string" ||
      typeof payload.body.startDate !== "string" ||
      typeof payload.body.endDate !== "string" ||
      typeof payload.body.durationDays !== "number" ||
      typeof payload.body.pinned !== "boolean" ||
      !Array.isArray(payload.body.tasks)
    ) {
      throw new Error("Invalid goal undo data");
    }
    await ctx.db.patch(goal._id, {
      title: payload.body.title,
      ...(typeof payload.body.description === "string"
        ? { description: payload.body.description }
        : {}),
      startDate: payload.body.startDate,
      endDate: payload.body.endDate,
      durationDays: payload.body.durationDays,
      status:
        payload.body.status === "completed"
          ? ("completed" as const)
          : ("active" as const),
      pinned: payload.body.pinned,
      ...(typeof payload.body.sourceMode === "string"
        ? { sourceMode: payload.body.sourceMode }
        : {}),
      updatedAt: Date.now(),
    });
    const currentTasks = await ctx.db
      .query("coachGoalTasks")
      .withIndex("by_goalId_and_sortOrder", (q) => q.eq("goalId", goal._id))
      .take(13);
    for (const task of currentTasks) await ctx.db.delete(task._id);
    const now = Date.now();
    for (const [sortOrder, rawTask] of payload.body.tasks
      .slice(0, 12)
      .entries()) {
      if (!isRecord(rawTask) || typeof rawTask.title !== "string") continue;
      const completed = rawTask.completed === true;
      await ctx.db.insert("coachGoalTasks", {
        userId,
        goalId: goal._id,
        title: rawTask.title,
        ...(typeof rawTask.detail === "string"
          ? { detail: rawTask.detail }
          : {}),
        completed,
        sortOrder,
        ...(completed ? { completedAt: now } : {}),
        createdAt: now,
        updatedAt: now,
      });
    }
    return;
  }

  if (
    payload.kind === "restore_recipe" &&
    typeof payload.id === "string" &&
    isRecord(payload.body)
  ) {
    const id = ctx.db.normalizeId("recipes", payload.id);
    const recipe = id ? await ctx.db.get(id) : null;
    if (!recipe || recipe.userId !== userId)
      throw new Error("Recipe not found");
    if (
      typeof payload.body.name !== "string" ||
      !Array.isArray(payload.body.ingredients)
    ) {
      throw new Error("Invalid recipe undo data");
    }
    await ctx.db.patch(recipe._id, {
      name: payload.body.name,
      ingredients: payload.body.ingredients as Doc<"recipes">["ingredients"],
      ...(typeof payload.body.description === "string"
        ? { description: payload.body.description }
        : {}),
      ...(typeof payload.body.servings === "number"
        ? { servings: payload.body.servings }
        : {}),
      ...(typeof payload.body.prepMinutes === "number"
        ? { prepMinutes: payload.body.prepMinutes }
        : {}),
      ...(typeof payload.body.cookMinutes === "number"
        ? { cookMinutes: payload.body.cookMinutes }
        : {}),
      ...(typeof payload.body.category === "string"
        ? { category: payload.body.category }
        : {}),
      ...(typeof payload.body.notes === "string"
        ? { notes: payload.body.notes }
        : {}),
      ...(payload.body.recipeType === "quick" ||
      payload.body.recipeType === "detailed"
        ? { recipeType: payload.body.recipeType }
        : {}),
      ...(typeof payload.body.placeholderImage === "string"
        ? { placeholderImage: payload.body.placeholderImage }
        : {}),
      ...(Array.isArray(payload.body.tags)
        ? { tags: payload.body.tags.map(String) }
        : {}),
      ...(Array.isArray(payload.body.steps)
        ? { steps: payload.body.steps.map(String) }
        : {}),
      updatedAt: Date.now(),
    });
    return;
  }

  if (
    payload.kind === "remove_food_entry" &&
    typeof payload.date === "string" &&
    typeof payload.entryId === "string"
  ) {
    const log = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", userId).eq("date", payload.date as string),
      )
      .unique();
    if (log) {
      await ctx.db.patch(log._id, {
        entries: log.entries.filter(
          (entry) =>
            !isRecord(entry) || entry.id !== (payload.entryId as string),
        ),
        updatedAt: Date.now(),
      });
    }
    return;
  }

  if (
    payload.kind === "restore_food_entry" &&
    typeof payload.date === "string" &&
    isRecord(payload.entry) &&
    typeof payload.entry.id === "string"
  ) {
    const log = await ctx.db
      .query("foodLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", userId).eq("date", payload.date as string),
      )
      .unique();
    if (!log) throw new Error("Nutrition log not found");
    const entryId = payload.entry.id;
    await ctx.db.patch(log._id, {
      entries: [
        ...log.entries.filter(
          (entry) => !isRecord(entry) || entry.id !== entryId,
        ),
        payload.entry,
      ],
      updatedAt: Date.now(),
    });
    return;
  }

  if (payload.kind === "delete_preset" && typeof payload.id === "string") {
    const id = ctx.db.normalizeId("presets", payload.id);
    const preset = id ? await ctx.db.get(id) : null;
    if (preset && preset.userId === userId) {
      await ctx.db.delete(preset._id);
      const schedule = await ctx.db
        .query("schedules")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (schedule) {
        const clearRoutine = (value: unknown): unknown => {
          if (!isRecord(value)) return value;
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              item === payload.id
                ? null
                : isRecord(item)
                  ? clearRoutine(item)
                  : item,
            ]),
          );
        };
        await ctx.db.patch(schedule._id, {
          routine: clearRoutine(schedule.routine),
          presetOrder: schedule.presetOrder.filter(
            (item) => item !== payload.id,
          ),
          updatedAt: Date.now(),
        });
      }
    }
    return;
  }

  if (
    payload.kind === "restore_preset" &&
    typeof payload.id === "string" &&
    isRecord(payload.body)
  ) {
    const id = ctx.db.normalizeId("presets", payload.id);
    const preset = id ? await ctx.db.get(id) : null;
    if (!preset || preset.userId !== userId)
      throw new Error("Preset not found");
    if (
      typeof payload.body.name !== "string" ||
      !Array.isArray(payload.body.items)
    ) {
      throw new Error("Invalid preset undo data");
    }
    await ctx.db.patch(preset._id, {
      name: payload.body.name,
      items: payload.body.items,
      exerciseData: payload.body.exerciseData,
      ...(typeof payload.body.focus === "string"
        ? { focus: payload.body.focus }
        : {}),
      ...(typeof payload.body.duration === "string"
        ? { duration: payload.body.duration }
        : {}),
      ...(Array.isArray(payload.body.steps)
        ? { steps: payload.body.steps.map(String) }
        : {}),
      updatedAt: Date.now(),
    });
    return;
  }

  if (payload.kind === "restore_schedule" && isRecord(payload.body)) {
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (schedule) {
      if (!Array.isArray(payload.body.presetOrder)) {
        throw new Error("Invalid schedule undo data");
      }
      await ctx.db.patch(schedule._id, {
        routine: payload.body.routine,
        presetOrder: payload.body.presetOrder.map(String),
        updatedAt: Date.now(),
      });
    }
    return;
  }

  if (payload.kind === "restore_memory" && typeof payload.key === "string") {
    const memory = await ctx.db
      .query("coachMemories")
      .withIndex("by_userId_and_key", (q) =>
        q.eq("userId", userId).eq("key", payload.key as string),
      )
      .unique();
    if (payload.previous === null) {
      if (memory) await ctx.db.delete(memory._id);
    } else if (isRecord(payload.previous)) {
      const body = {
        category: String(payload.previous.category ?? "preference"),
        value: String(payload.previous.value ?? ""),
        source: String(payload.previous.source ?? "coach"),
        updatedAt: Date.now(),
      };
      if (memory) await ctx.db.patch(memory._id, body);
      else {
        await ctx.db.insert("coachMemories", {
          userId,
          key: payload.key,
          ...body,
        });
      }
    }
    return;
  }

  if (
    payload.kind === "restore_check_in" &&
    typeof payload.date === "string" &&
    typeof payload.checkInKind === "string"
  ) {
    const checkIn = await ctx.db
      .query("coachCheckIns")
      .withIndex("by_userId_and_date_and_kind", (q) =>
        q
          .eq("userId", userId)
          .eq("date", payload.date as string)
          .eq("kind", payload.checkInKind as string),
      )
      .unique();
    if (payload.previous === null) {
      if (checkIn) await ctx.db.delete(checkIn._id);
    } else if (isRecord(payload.previous)) {
      const body = {
        energy: Number(payload.previous.energy),
        soreness: Number(payload.previous.soreness),
        sleepQuality: Number(payload.previous.sleepQuality),
        mood: Number(payload.previous.mood),
        ...(payload.previous.note
          ? { note: String(payload.previous.note) }
          : {}),
        updatedAt: Date.now(),
      };
      if (checkIn) await ctx.db.patch(checkIn._id, body);
      else {
        await ctx.db.insert("coachCheckIns", {
          userId,
          date: payload.date,
          kind: payload.checkInKind,
          ...body,
          createdAt: Date.now(),
        });
      }
    }
    return;
  }

  if (
    payload.kind === "restore_weekly_plan" &&
    typeof payload.weekStart === "string"
  ) {
    const plan = await ctx.db
      .query("coachWeeklyPlans")
      .withIndex("by_userId_and_weekStart", (q) =>
        q.eq("userId", userId).eq("weekStart", payload.weekStart as string),
      )
      .unique();
    if (payload.previous === null) {
      if (plan) await ctx.db.delete(plan._id);
    } else if (isRecord(payload.previous)) {
      const body = {
        title: String(payload.previous.title ?? "Weekly plan"),
        days: Array.isArray(payload.previous.days) ? payload.previous.days : [],
        assumptions: Array.isArray(payload.previous.assumptions)
          ? payload.previous.assumptions.map(String)
          : [],
        status:
          payload.previous.status === "archived"
            ? ("archived" as const)
            : ("active" as const),
        updatedAt: Date.now(),
      };
      if (plan) await ctx.db.patch(plan._id, body);
      else {
        await ctx.db.insert("coachWeeklyPlans", {
          userId,
          weekStart: payload.weekStart,
          ...body,
          createdAt: Date.now(),
        });
      }
    }
    return;
  }

  // ── API and MCP ───────────────────────────────────────────────────────────
  // Undoing a write means removing exactly the row that write created; undoing
  // a delete means putting the stored document back as it was. Both are
  // written against ids captured at the time, so a later edit by the user is
  // never silently reverted along with the agent's change.

  if (
    payload.kind === "remove_water_entry" &&
    typeof payload.date === "string" &&
    typeof payload.entryId === "string"
  ) {
    const log = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", userId).eq("date", payload.date as string),
      )
      .unique();
    if (log) {
      await ctx.db.patch(log._id, {
        entries: log.entries.filter(
          (entry) =>
            !isRecord(entry) || entry.id !== (payload.entryId as string),
        ),
        updatedAt: Date.now(),
      });
    }
    return;
  }

  if (
    payload.kind === "restore_water_entry" &&
    typeof payload.date === "string" &&
    isRecord(payload.entry)
  ) {
    const log = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", userId).eq("date", payload.date as string),
      )
      .unique();
    const entry = payload.entry;
    if (log) {
      await ctx.db.patch(log._id, {
        entries: [
          ...log.entries.filter(
            (existing) => !isRecord(existing) || existing.id !== entry.id,
          ),
          entry,
        ],
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("waterLogs", {
        userId,
        date: payload.date,
        entries: [entry],
        updatedAt: Date.now(),
      });
    }
    return;
  }

  if (
    payload.kind === "delete_workout_log" &&
    typeof payload.date === "string" &&
    typeof payload.sessionId === "string"
  ) {
    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_and_date_and_sessionId", (q) =>
        q
          .eq("userId", userId)
          .eq("date", payload.date as string)
          .eq("sessionId", payload.sessionId as string),
      )
      .unique();
    if (log) await ctx.db.delete(log._id);
    return;
  }

  if (payload.kind === "restore_workout_log" && isRecord(payload.body)) {
    await ctx.db.insert(
      "workoutLogs",
      payload.body as Parameters<typeof ctx.db.insert<"workoutLogs">>[1],
    );
    return;
  }

  if (
    payload.kind === "delete_body_measurement" &&
    typeof payload.id === "string"
  ) {
    const id = ctx.db.normalizeId("bodyMeasurements", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) await ctx.db.delete(row._id);
    return;
  }

  // Restores exactly the fields a correction touched. `null` in the payload
  // means the field was absent before, so undoing has to remove it again
  // rather than leave the new value sitting there.
  if (
    payload.kind === "restore_body_measurement_fields" &&
    typeof payload.id === "string" &&
    payload.fields !== null &&
    typeof payload.fields === "object"
  ) {
    const id = ctx.db.normalizeId("bodyMeasurements", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) {
      const restored: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        payload.fields as Record<string, unknown>,
      )) {
        restored[key] = value === null ? undefined : value;
      }
      await ctx.db.patch(row._id, { ...restored, updatedAt: Date.now() });
    }
    return;
  }

  if (
    payload.kind === "restore_body_measurement_weight" &&
    typeof payload.id === "string"
  ) {
    const id = ctx.db.normalizeId("bodyMeasurements", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) {
      await ctx.db.patch(row._id, {
        weightKg:
          typeof payload.weightKg === "number" ? payload.weightKg : undefined,
        updatedAt: Date.now(),
      });
    }
    return;
  }

  if (payload.kind === "restore_body_measurement" && isRecord(payload.body)) {
    await ctx.db.insert(
      "bodyMeasurements",
      payload.body as Parameters<typeof ctx.db.insert<"bodyMeasurements">>[1],
    );
    return;
  }

  if (payload.kind === "unmark_rest_days" && Array.isArray(payload.dates)) {
    for (const date of payload.dates) {
      if (typeof date !== "string") continue;
      const row = await ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", userId).eq("date", date),
        )
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
    return;
  }

  if (payload.kind === "restore_rest_days" && Array.isArray(payload.rows)) {
    for (const raw of payload.rows) {
      if (!isRecord(raw) || typeof raw.date !== "string") continue;
      const existing = await ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", userId).eq("date", raw.date as string),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert(
        "restDays",
        raw as Parameters<typeof ctx.db.insert<"restDays">>[1],
      );
    }
    return;
  }

  if (
    payload.kind === "delete_health_workout" &&
    typeof payload.id === "string"
  ) {
    const id = ctx.db.normalizeId("healthWorkouts", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) await ctx.db.delete(row._id);
    return;
  }

  if (payload.kind === "restore_health_workout" && isRecord(payload.body)) {
    await ctx.db.insert(
      "healthWorkouts",
      payload.body as Parameters<typeof ctx.db.insert<"healthWorkouts">>[1],
    );
    return;
  }

  if (payload.kind === "restore_health_metrics" && isRecord(payload.body)) {
    const body = payload.body as { date?: unknown };
    if (typeof body.date === "string") {
      const existing = await ctx.db
        .query("healthMetrics")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", userId).eq("date", body.date as string),
        )
        .unique();
      // The phone may have re-synced the day since; the stored read wins,
      // because it is the one the user asked to have back.
      if (existing) await ctx.db.delete(existing._id);
    }
    await ctx.db.insert(
      "healthMetrics",
      payload.body as Parameters<typeof ctx.db.insert<"healthMetrics">>[1],
    );
    return;
  }

  // Undo of a correction that had to invent the day's row. There was no prior
  // document to put back, so the row goes away entirely — leaving it with the
  // corrected number still in it would make undo a no-op that claims to have
  // worked.
  if (
    payload.kind === "created_health_metrics_day" &&
    typeof payload.date === "string"
  ) {
    const existing = await ctx.db
      .query("healthMetrics")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", userId).eq("date", payload.date as string),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  // ── Custom metrics ─────────────────────────────────────────────────────────
  // Six kinds because the API can create, edit, value, clear and delete a
  // metric, and each of those loses something different. Without these the
  // write tools filed audit entries that looked undoable and were not, which is
  // worse than refusing up front.

  if (payload.kind === "delete_custom_metric" && typeof payload.id === "string") {
    const id = ctx.db.normalizeId("customProgressMetrics", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) await ctx.db.delete(row._id);
    return;
  }

  if (
    payload.kind === "restore_custom_metric_fields" &&
    typeof payload.id === "string" &&
    isRecord(payload.fields)
  ) {
    const id = ctx.db.normalizeId("customProgressMetrics", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) {
      const restored: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        payload.fields as Record<string, unknown>,
      )) {
        restored[key] = value === null ? undefined : value;
      }
      await ctx.db.patch(row._id, { ...restored, updatedAt: Date.now() });
    }
    return;
  }

  if (payload.kind === "delete_custom_metric_entry" && typeof payload.id === "string") {
    const id = ctx.db.normalizeId("customProgressMetricEntries", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) await ctx.db.delete(row._id);
    return;
  }

  if (
    payload.kind === "restore_custom_metric_entry_value" &&
    typeof payload.id === "string" &&
    typeof payload.value === "number"
  ) {
    const id = ctx.db.normalizeId("customProgressMetricEntries", payload.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.userId === userId) {
      await ctx.db.patch(row._id, {
        value: payload.value,
        // Absent means the entry predates the flag, which reads as synced.
        manual: payload.manual === true ? true : undefined,
        updatedAt: Date.now(),
      });
    }
    return;
  }

  if (payload.kind === "restore_custom_metric_entry" && isRecord(payload.body)) {
    const body = payload.body as { userId?: unknown };
    if (body.userId !== userId) return;
    await ctx.db.insert(
      "customProgressMetricEntries",
      payload.body as Parameters<
        typeof ctx.db.insert<"customProgressMetricEntries">
      >[1],
    );
    return;
  }

  if (payload.kind === "restore_custom_metric" && isRecord(payload.body)) {
    const body = payload.body as { userId?: unknown };
    if (body.userId !== userId) return;
    // The definition comes back under a NEW id, so every row that pointed at
    // the old one has to be repointed as it is reinserted. Restoring the
    // entries verbatim would file orphans keyed to an id that no longer
    // exists — invisible until someone wonders why the chart is empty.
    const metricId = await ctx.db.insert(
      "customProgressMetrics",
      payload.body as Parameters<
        typeof ctx.db.insert<"customProgressMetrics">
      >[1],
    );
    for (const entry of Array.isArray(payload.entries) ? payload.entries : []) {
      if (!isRecord(entry)) continue;
      await ctx.db.insert("customProgressMetricEntries", {
        ...(entry as Record<string, unknown>),
        metricId,
      } as Parameters<
        typeof ctx.db.insert<"customProgressMetricEntries">
      >[1]);
    }
    for (const widget of Array.isArray(payload.widgets) ? payload.widgets : []) {
      if (!isRecord(widget)) continue;
      await ctx.db.insert("dashboardWidgets", {
        ...(widget as Record<string, unknown>),
        sourceMetricId: metricId,
      } as Parameters<typeof ctx.db.insert<"dashboardWidgets">>[1]);
    }
    return;
  }

  throw new Error("This action cannot be undone");
}

export const undoAction = mutation({
  args: { id: v.id("coachActionEvents") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const event = await ctx.db.get(args.id);
    if (!event || event.userId !== user._id) {
      throw new Error("Coach action not found or access denied");
    }
    if (event.status === "undone") return { ok: true };
    await undoPayload(ctx, user._id, event.undoPayload);
    await ctx.db.patch(event._id, {
      status: "undone",
      undoneAt: Date.now(),
    });
    return { ok: true };
  },
});
