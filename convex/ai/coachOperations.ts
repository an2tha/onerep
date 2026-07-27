import { v } from "convex/values";
import { action, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getAuthUser } from "../lib/auth";
import {
  normalizeCoachOperations,
  validateCoachOperations,
  type CoachOperation,
  type CoachWorkoutPresetDraft,
} from "../../packages/models/src/coach";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const colors = ["#8b5cf6", "#0ea5e9", "#f97316", "#10b981"];
const clientId = (requestId: string, index: number, suffix: string) =>
  `coach-${requestId}-${index}-${suffix}`.slice(0, 120);

export const claimRun = internalMutation({
  args: { userId: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("coachOperationRuns")
      .withIndex("by_userId_and_requestId", (q) =>
        q.eq("userId", args.userId).eq("requestId", args.requestId),
      )
      .unique();
    if (existing?.status === "completed")
      return { state: "completed" as const, result: existing.result };
    if (
      existing?.status === "running" &&
      Date.now() - existing.updatedAt < 60_000
    )
      return { state: "running" as const };
    const now = Date.now();
    if (existing)
      await ctx.db.patch(existing._id, {
        status: "running",
        error: undefined,
        updatedAt: now,
      });
    else
      await ctx.db.insert("coachOperationRuns", {
        userId: args.userId,
        requestId: args.requestId,
        status: "running",
        createdAt: now,
        updatedAt: now,
      });
    return { state: "claimed" as const };
  },
});

export const finishRun = internalMutation({
  args: {
    userId: v.string(),
    requestId: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed")),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("coachOperationRuns")
      .withIndex("by_userId_and_requestId", (q) =>
        q.eq("userId", args.userId).eq("requestId", args.requestId),
      )
      .unique();
    if (!run) throw new Error("Coach operation run not found");
    await ctx.db.patch(run._id, {
      status: args.status,
      result: args.result,
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

function expandPlans(operations: CoachOperation[]): CoachOperation[] {
  return operations.flatMap((operation) =>
    operation.type === "create_workout_plan"
      ? [
          ...operation.presets.map((preset) => ({
            ...operation,
            ...preset,
            type: "create_workout_preset" as const,
          })),
          {
            ...operation,
            type: "update_routine" as const,
            assignments: operation.assignments,
          },
        ]
      : [operation],
  );
}

function presetBody(
  draft: CoachWorkoutPresetDraft,
  exercises: Array<{ id: string; name: string; category: string }>,
  requestId: string,
  operationIndex: number,
) {
  const groups = new Map<string, number>();
  for (const item of draft.exercises)
    if (item.supersetGroup)
      groups.set(item.supersetGroup, (groups.get(item.supersetGroup) ?? 0) + 1);
  const emitted = new Set<string>();
  let colorIndex = 0;
  const items: unknown[] = [];
  for (let index = 0; index < exercises.length; index += 1) {
    const group = draft.exercises[index]?.supersetGroup;
    const count = group ? (groups.get(group) ?? 0) : 0;
    if (!group || count < 2 || count > 3)
      items.push({ kind: "solo", exerciseId: exercises[index].id });
    else if (!emitted.has(group)) {
      emitted.add(group);
      items.push({
        kind: "superset",
        id: clientId(requestId, operationIndex, `group-${group}`),
        color: colors[colorIndex++ % colors.length],
        exerciseIds: exercises
          .filter(
            (_, candidate) =>
              draft.exercises[candidate]?.supersetGroup === group,
          )
          .map((item) => item.id),
      });
    }
  }
  const exerciseData = Object.fromEntries(
    exercises.map((exercise, index) => [
      exercise.id,
      {
        sets:
          exercise.category === "cardio"
            ? []
            : draft.exercises[index].sets.map((set, setIndex) => ({
                ...set,
                id: clientId(
                  requestId,
                  operationIndex,
                  `set-${index}-${setIndex}`,
                ),
              })),
        trackRpe: false,
        trackUnilateral: false,
        barWeight: "",
        barType: "olympic",
      },
    ]),
  );
  const totalSets = draft.exercises.reduce(
    (sum, item) => sum + item.sets.length,
    0,
  );
  return {
    name: draft.name,
    items,
    exerciseData,
    focus: draft.focus,
    duration: `${Math.max(15, 8 + totalSets * 3)} min`,
    steps: exercises.map((item) => item.name),
  };
}

export const applyApproved = action({
  args: { requestId: v.string(), operations: v.array(v.any()) },
  handler: async (ctx, args): Promise<unknown[]> => {
    const user = await getAuthUser(ctx);
    const requestId = args.requestId.trim().slice(0, 120);
    if (!requestId) throw new Error("A request id is required");
    const operations = expandPlans(normalizeCoachOperations(args.operations));
    if (
      operations.length !== args.operations.length &&
      !args.operations.some((item) => item?.type === "create_workout_plan")
    )
      throw new Error("Invalid Coach operations");
    const errors = validateCoachOperations(operations);
    if (errors.length) throw new Error(errors[0]);
    const claim: {
      state: "claimed" | "running" | "completed";
      result?: unknown;
    } = await ctx.runMutation(internal.ai.coachOperations.claimRun, {
      userId: user._id,
      requestId,
    });
    if (claim.state === "completed") return (claim.result as unknown[]) ?? [];
    if (claim.state === "running")
      throw new Error("Coach is already applying these changes.");
    try {
      const results: unknown[] = [];
      const [presetRows, recipeRows, recentFoodDays, schedule] =
        await Promise.all([
          ctx.runQuery(api.logs.presets.list, {}),
          ctx.runQuery(api.logs.recipes.list, {}),
          ctx.runQuery(api.logs.foodLogs.getRecent, { limit: 30 }),
          ctx.runQuery(api.users.schedules.get, {}),
        ]);
      const knownPresets = new Map<string, string>(
        presetRows.map((preset) => [
          preset.name.trim().toLowerCase(),
          String(preset._id),
        ]),
      );
      const presetOrder = [...(schedule?.presetOrder ?? [])];
      const root =
        schedule?.routine && typeof schedule.routine === "object"
          ? schedule.routine
          : {};
      let primary = {
        ...(root.primary && typeof root.primary === "object"
          ? root.primary
          : root),
      } as Record<string, string | null>;
      let routineChanged = false;
      for (const [index, operation] of operations.entries()) {
        if (operation.type === "save_recipe") {
          const existing = operation.recipeId
            ? recipeRows.find(
                (recipe) => String(recipe._id) === operation.recipeId,
              )
            : null;
          const recipeId = await ctx.runMutation(api.logs.recipes.save, {
            ...(operation.recipeId
              ? { id: operation.recipeId as Id<"recipes"> }
              : {}),
            name: operation.name,
            recipeType: "detailed",
            description: operation.description,
            servings: operation.servings,
            prepMinutes: operation.prepMinutes,
            cookMinutes: operation.cookMinutes,
            category: operation.category,
            notes: operation.notes,
            tags: operation.tags,
            steps: operation.steps,
            ingredients: operation.ingredients.map((item, ingredientIndex) => ({
              ...item,
              id:
                item.id ??
                clientId(requestId, index, `ingredient-${ingredientIndex}`),
            })),
          });
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: operation.recipeId ? "update_recipe" : "save_recipe",
              summary: operation.summary,
              targetType: "recipe",
              targetId: String(recipeId),
              undoPayload: existing
                ? {
                    kind: "restore_recipe",
                    id: String(recipeId),
                    body: existing,
                  }
                : { kind: "delete_recipe", id: String(recipeId) },
            },
          );
          results.push({
            ...operation,
            recipeId: String(recipeId),
            actionId: String(actionId),
          });
        } else if (operation.type === "log_nutrition") {
          const date = operation.date ?? new Date().toISOString().slice(0, 10);
          const entryId =
            operation.entryId ?? clientId(requestId, index, "food");
          const entry = {
            id: entryId,
            name: operation.name,
            meal: operation.meal,
            loggedAt: new Date().toISOString(),
            calories: operation.calories,
            protein: operation.protein,
            carbs: operation.carbs,
            fat: operation.fat,
          };
          await ctx.runMutation(
            operation.entryId
              ? api.logs.foodLogs.updateEntry
              : api.logs.foodLogs.addEntry,
            { date, entry },
          );
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: operation.entryId ? "correct_nutrition" : "log_nutrition",
              summary: operation.summary,
              targetType: "nutrition",
              targetId: entryId,
              undoPayload: { kind: "remove_food_entry", date, entryId },
            },
          );
          results.push({ ...operation, entryId, actionId: String(actionId) });
        } else if (operation.type === "delete_nutrition") {
          const existing = recentFoodDays
            .find((day) => day.date === operation.date)
            ?.entries.find(
              (entry: { id?: string }) => entry.id === operation.entryId,
            );
          if (!existing)
            throw new Error("That nutrition entry no longer exists.");
          await ctx.runMutation(api.logs.foodLogs.removeEntry, {
            date: operation.date,
            entryId: operation.entryId,
          });
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: "delete_nutrition",
              summary: operation.summary,
              targetType: "nutrition",
              targetId: operation.entryId,
              undoPayload: {
                kind: "restore_food_entry",
                date: operation.date,
                entry: existing,
              },
            },
          );
          results.push({
            type: operation.type,
            name: operation.name,
            actionId: String(actionId),
          });
        } else if (operation.type === "create_workout_preset") {
          const resolved = [];
          for (const draft of operation.exercises) {
            const matches = await ctx.runQuery(api.exercises.search, {
              query: draft.name,
              limit: 6,
            });
            const exact =
              matches.find(
                (item) =>
                  item.name.trim().toLowerCase() ===
                  draft.name.trim().toLowerCase(),
              ) ?? matches[0];
            if (!exact)
              throw new Error(
                `Coach couldn't match “${draft.name}” to the exercise catalog.`,
              );
            resolved.push(exact);
          }
          const body = presetBody(operation, resolved, requestId, index);
          let presetId: string;
          if (operation.presetId) {
            await ctx.runMutation(api.logs.presets.update, {
              id: operation.presetId as Id<"presets">,
              ...body,
            });
            presetId = operation.presetId;
          } else {
            const created = await ctx.runMutation(
              api.logs.presets.create,
              body,
            );
            presetId = String(created.id);
          }
          knownPresets.set(operation.name.trim().toLowerCase(), presetId);
          if (!presetOrder.includes(presetId)) presetOrder.push(presetId);
          for (const day of operation.scheduleDays) {
            primary[day] = presetId;
            routineChanged = true;
          }
          const previous = operation.presetId
            ? presetRows.find(
                (preset) => String(preset._id) === operation.presetId,
              )
            : null;
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: operation.presetId
                ? (operation.reason ?? "edit_workout_preset")
                : "create_workout_preset",
              summary: operation.summary,
              targetType: "workout_preset",
              targetId: presetId,
              undoPayload: previous
                ? { kind: "restore_preset", id: presetId, body: previous }
                : { kind: "delete_preset", id: presetId },
            },
          );
          results.push({
            type: operation.type,
            presetId,
            actionId: String(actionId),
            name: operation.name,
            exerciseNames: resolved.map((item) => item.name),
            scheduledDays: operation.scheduleDays,
          });
        } else if (operation.type === "update_routine") {
          const previousSchedule = {
            routine: schedule?.routine ?? {},
            presetOrder: schedule?.presetOrder ?? [],
          };
          for (const assignment of operation.assignments) {
            const presetId = assignment.presetName
              ? knownPresets.get(assignment.presetName.trim().toLowerCase())
              : null;
            if (assignment.presetName && !presetId)
              throw new Error(
                `No preset named “${assignment.presetName}” exists.`,
              );
            primary[assignment.day] = presetId ?? null;
            routineChanged = true;
          }
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: "update_routine",
              summary: operation.summary,
              targetType: "routine",
              undoPayload: { kind: "restore_schedule", body: previousSchedule },
            },
          );
          results.push({
            type: operation.type,
            assignments: operation.assignments,
            actionId: String(actionId),
          });
        } else if (operation.type === "save_progress_metric") {
          const metricId = await ctx.runMutation(
            api.customProgressMetrics.saveDefinition,
            {
              title: operation.title,
              description: operation.description,
              tab: operation.tab,
              kind: operation.kind,
              unit: operation.unit,
              step: operation.step,
              ...(operation.target == null ? {} : { target: operation.target }),
              accent: operation.accent,
            },
          );
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: "save_progress_metric",
              summary: operation.summary,
              targetType: "progress_metric",
              targetId: String(metricId),
              undoPayload: {
                kind: "delete_progress_metric",
                id: String(metricId),
              },
            },
          );
          results.push({
            ...operation,
            metricId: String(metricId),
            actionId: String(actionId),
          });
        } else if (operation.type === "save_dashboard_widget") {
          const saved = await ctx.runMutation(
            api.dashboardWidgets.saveFromCoach,
            {
              title: operation.title,
              description: operation.description,
              kind: operation.kind,
              ...(operation.sourceMetricId
                ? {
                    sourceMetricId:
                      operation.sourceMetricId as Id<"customProgressMetrics">,
                  }
                : {}),
              sourceMetricTitle: operation.sourceMetricTitle,
              unit: operation.unit,
              accent: operation.accent,
              ...(operation.target == null ? {} : { target: operation.target }),
              ...(operation.windowDays == null
                ? {}
                : { windowDays: operation.windowDays }),
              ...(operation.halfLifeHours == null
                ? {}
                : { halfLifeHours: operation.halfLifeHours }),
              ...(operation.parentWidgetId
                ? {
                    parentWidgetId:
                      operation.parentWidgetId as Id<"dashboardWidgets">,
                  }
                : {}),
            },
          );
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: "save_dashboard_widget",
              summary: operation.summary,
              targetType: "dashboard_widget",
              targetId: String(saved.widgetId),
              undoPayload: {
                kind: "delete_dashboard_widget",
                id: String(saved.widgetId),
              },
            },
          );
          const caffeineWidget = saved.sourceMetricTitle
            .toLocaleLowerCase()
            .includes("caffeine");
          results.push({
            ...operation,
            sourceMetricTitle: saved.sourceMetricTitle,
            widgetId: String(saved.widgetId),
            pinned: false,
            actionId: String(actionId),
            ...(!operation.followUpTitle &&
            caffeineWidget &&
            operation.kind !== "decay"
              ? {
                  followUpTitle: "Estimated caffeine decay",
                  followUpKind: "decay" as const,
                }
              : {}),
          });
        } else if (operation.type === "remember")
          results.push({
            type: operation.type,
            label: `Remembered: ${operation.value}`,
            ...(await ctx.runMutation(api.ai.coachState.setMemory, {
              key: operation.key,
              category: operation.category,
              value: operation.value,
              source: "coach",
            })),
          });
        else if (operation.type === "forget_memory") {
          const memories = await ctx.runQuery(api.ai.coachState.listMemories, {
            limit: 50,
          });
          const memory = memories.find(
            (item) => item.key.toLowerCase() === operation.key.toLowerCase(),
          );
          if (!memory) throw new Error("That Coach memory no longer exists.");
          results.push({
            type: operation.type,
            label: `Forgot: ${operation.value}`,
            ...(await ctx.runMutation(api.ai.coachState.removeMemory, {
              id: memory._id,
            })),
          });
        } else if (operation.type === "save_check_in")
          results.push({
            type: operation.type,
            label: "Recovery check-in saved",
            ...(await ctx.runMutation(api.ai.coachState.saveCheckIn, {
              date: operation.date,
              kind: "daily",
              energy: operation.energy,
              soreness: operation.soreness,
              sleepQuality: operation.sleepQuality,
              mood: operation.mood,
              ...(operation.note ? { note: operation.note } : {}),
            })),
          });
        else if (operation.type === "save_weekly_plan")
          results.push({
            type: operation.type,
            label: operation.title,
            ...(await ctx.runMutation(api.ai.coachState.saveWeeklyPlan, {
              weekStart: operation.weekStart,
              title: operation.title,
              days: operation.days,
              assumptions: operation.planAssumptions,
            })),
          });
        else if (operation.type === "save_goal") {
          const saved = await ctx.runMutation(api.ai.coachGoals.save, {
            ...(operation.goalId
              ? { id: operation.goalId as Id<"coachGoals"> }
              : {}),
            title: operation.title,
            description: operation.detail,
            startDate: operation.startDate,
            durationDays: operation.durationDays,
            pinned: operation.pinned,
            sourceMode: "coach",
            tasks: operation.tasks,
          });
          const actionId = await ctx.runMutation(
            api.ai.coachState.recordAction,
            {
              kind: operation.goalId ? "update_goal" : "create_goal",
              summary: operation.summary,
              targetType: "coach_goal",
              targetId: String(saved.goalId),
              undoPayload: operation.goalId
                ? { kind: "noop" }
                : { kind: "delete_goal", id: String(saved.goalId) },
            },
          );
          results.push({
            ...operation,
            goalId: String(saved.goalId),
            actionId: String(actionId),
          });
        } else if (operation.type === "undo_action") {
          await ctx.runMutation(api.ai.coachState.undoAction, {
            id: operation.actionId as Id<"coachActionEvents">,
          });
          results.push({
            type: operation.type,
            label: `Undid: ${operation.actionSummary}`,
          });
        }
      }
      if (routineChanged)
        await ctx.runMutation(api.users.schedules.set, {
          routine: { ...root, primary },
          presetOrder,
        });
      await ctx.runMutation(internal.ai.coachOperations.finishRun, {
        userId: user._id,
        requestId,
        status: "completed",
        result: results,
      });
      return results;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not apply Coach changes";
      await ctx.runMutation(internal.ai.coachOperations.finishRun, {
        userId: user._id,
        requestId,
        status: "failed",
        error: message,
      });
      throw error;
    }
  },
});
