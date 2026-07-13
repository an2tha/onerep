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

const MAX_HISTORY = 40;
const MAX_MEMORIES = 50;
const MAX_CHECK_INS = 30;
const MAX_COACH_IMAGE_BYTES = 5 * 1024 * 1024;
const COACH_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const COACH_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    return await ctx.storage.generateUploadUrl();
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
    const user = await getAuthUser(ctx);
    const mimeType = clampText(args.mimeType, 64).toLowerCase();
    if (!COACH_IMAGE_TYPES.has(mimeType))
      throw new Error("Unsupported image type");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new Error("Uploaded image not found");
    if (
      metadata.size <= 0 ||
      metadata.size > MAX_COACH_IMAGE_BYTES ||
      args.size !== metadata.size
    ) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Image is too large or incomplete");
    }
    if (metadata.contentType && metadata.contentType !== mimeType) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Image content type does not match");
    }
    const existing = await ctx.db
      .query("coachUploads")
      .withIndex("by_userId_and_storageId", (q) =>
        q.eq("userId", user._id).eq("storageId", args.storageId),
      )
      .unique();
    if (existing) return { id: existing._id };
    const createdAt = Date.now();
    const id = await ctx.db.insert("coachUploads", {
      userId: user._id,
      storageId: args.storageId,
      mimeType,
      fileName: clampText(args.fileName, 120) || "coach-image",
      size: metadata.size,
      createdAt,
      expiresAt: createdAt + COACH_UPLOAD_TTL_MS,
    });
    return { id };
  },
});

export const removeUpload = mutation({
  args: { id: v.id("coachUploads") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const upload = await ctx.db.get(args.id);
    if (!upload || upload.userId !== user._id) {
      throw new Error("Image not found or access denied");
    }
    await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(upload._id);
    return null;
  },
});

export const resolveUploadForModel = internalQuery({
  args: { id: v.id("coachUploads"), userId: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.id);
    if (
      !upload ||
      upload.userId !== args.userId ||
      upload.expiresAt <= Date.now()
    ) {
      return null;
    }
    const url = await ctx.storage.getUrl(upload.storageId);
    return url
      ? { url, mimeType: upload.mimeType, fileName: upload.fileName }
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

const weeklyPlanDayValidator = v.object({
  day: v.string(),
  workoutPresetId: v.optional(v.string()),
  workoutLabel: v.optional(v.string()),
  meals: v.array(
    v.object({
      label: v.string(),
      recipeId: v.optional(v.string()),
      note: v.optional(v.string()),
    }),
  ),
  recoveryNote: v.optional(v.string()),
});

export const getWeeklyPlan = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    return await ctx.db
      .query("coachWeeklyPlans")
      .withIndex("by_userId_and_weekStart", (q) =>
        q.eq("userId", user._id).eq("weekStart", clampText(args.weekStart, 10)),
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
    const weekStart = clampText(args.weekStart, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
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

  if (payload.kind === "delete_recipe" && typeof payload.id === "string") {
    const id = ctx.db.normalizeId("recipes", payload.id);
    const recipe = id ? await ctx.db.get(id) : null;
    if (recipe && recipe.userId === userId) await ctx.db.delete(recipe._id);
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
    for (const [sortOrder, rawTask] of payload.body.tasks.slice(0, 12).entries()) {
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
