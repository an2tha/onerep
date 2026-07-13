import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUser } from "../lib/auth";
import { hasOpenAiApiKey, requestOpenAiJson } from "./provider";
import { renderSystemPrompt } from "./prompts.generated";
import { consumeAiUsageOrThrow } from "./usage";

const MAX_PROMPT_CHARS = 1_200;
const MAX_METRICS = 80;
const MAX_KEYWORDS = 16;
const DEFAULT_MAX_RESULTS = 4;
const MAX_RESULTS = 6;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const SUBAPPS = ["dashboard", "nutrition", "progress", "workouts"] as const;
type MetricSubapp = (typeof SUBAPPS)[number];

type MetricCatalogItem = {
  id: string;
  title: string;
  group: string;
  description: string;
  keywords: string[];
};

type MetricGenerationResult = {
  metricIds: string[];
  customMetricTitle?: string;
  source: "openai" | "fallback";
};

type CoachAdvice = {
  label: string;
  title: string;
  detail: string;
};

type CoachAdviceResult = {
  advice: CoachAdvice[];
  source: "openai" | "fallback";
};

type CoachChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CoachUiStat = {
  label: string;
  value: string;
  detail?: string;
  trend?: "up" | "down" | "flat";
};

type CoachUiAction =
  | "open_nutrition"
  | "open_workouts"
  | "open_progress"
  | "open_settings"
  | "open_workout_builder"
  | "open_recipe_builder"
  | "log_food";

type CoachGoalTaskDraft = {
  title: string;
  detail?: string;
  completed?: boolean;
};

type CoachUiBlock =
  | {
      type: "card";
      label: string;
      title: string;
      detail: string;
    }
  | {
      type: "stat_group";
      title: string;
      stats: CoachUiStat[];
    }
  | {
      type: "checklist";
      title: string;
      items: Array<{ label: string; detail?: string; done?: boolean }>;
    }
  | {
      type: "goal";
      title: string;
      detail: string;
      durationDays: number;
      tasks: CoachGoalTaskDraft[];
    }
  | {
      type: "action_row";
      title: string;
      actions: Array<{ label: string; action: CoachUiAction }>;
    };

type CoachRecipeIngredient = {
  id?: string;
  name: string;
  grams: number;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
};

type CoachOperationMeta = {
  confirmation: "auto" | "confirm";
  summary: string;
  assumptions: string[];
  warnings: string[];
};

type CoachWorkoutPresetDraft = {
  presetId?: string;
  reason?: "user_edit" | "progression" | "recovery" | "substitution";
  name: string;
  focus: "strength" | "cardio" | "mobility";
  exercises: Array<{
    name: string;
    sets: Array<{
      type: "working" | "warmup" | "failure" | "myoreps" | "drop";
      weight: string;
      reps: string;
      restSeconds: number;
    }>;
  }>;
  scheduleDays: string[];
};

type CoachOperation = CoachOperationMeta &
  (
    | {
        type: "save_recipe";
        recipeId?: string;
        name: string;
        description: string;
        servings: number;
        prepMinutes: number;
        cookMinutes: number;
        category: string;
        notes: string;
        tags: string[];
        ingredients: CoachRecipeIngredient[];
        steps: string[];
        logMeal?: string;
        servingsToLog?: number;
      }
    | {
        type: "log_nutrition";
        entryId?: string;
        date?: string;
        name: string;
        meal: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      }
    | {
        type: "delete_nutrition";
        entryId: string;
        date: string;
        name: string;
      }
    | ({ type: "create_workout_preset" } & CoachWorkoutPresetDraft)
    | {
        type: "create_workout_plan";
        presets: CoachWorkoutPresetDraft[];
        assignments: Array<{ day: string; presetName: string | null }>;
      }
    | {
        type: "update_routine";
        assignments: Array<{ day: string; presetName: string | null }>;
      }
    | {
        type: "remember";
        key: string;
        category: string;
        value: string;
      }
    | {
        type: "forget_memory";
        key: string;
        value: string;
      }
    | {
        type: "save_check_in";
        date: string;
        energy: number;
        soreness: number;
        sleepQuality: number;
        mood: number;
        note?: string;
      }
    | {
        type: "save_weekly_plan";
        weekStart: string;
        title: string;
        days: Array<{
          day: string;
          workoutPresetId?: string;
          workoutLabel?: string;
          meals: Array<{ label: string; recipeId?: string; note?: string }>;
          recoveryNote?: string;
        }>;
        planAssumptions: string[];
      }
    | {
        type: "save_goal";
        goalId?: string;
        title: string;
        detail: string;
        startDate: string;
        durationDays: number;
        pinned: boolean;
        tasks: CoachGoalTaskDraft[];
      }
    | {
        type: "undo_action";
        actionId: string;
        actionSummary: string;
      }
  );

type CoachArtifact = {
  type:
    | "today_briefing"
    | "progress_explanation"
    | "simulation"
    | "validation"
    | "recovery_adaptation";
  title: string;
  status?: string;
  detail: string;
  evidence: string[];
  nextSteps: string[];
};

type CoachWorkspace = {
  today?: string;
  presets: Array<{
    name: string;
    id: string;
    updatedAt?: number;
    snapshot?: unknown;
  }>;
  recipes?: Array<{
    id: string;
    name: string;
    updatedAt: number;
    servings?: number;
    ingredients: CoachRecipeIngredient[];
  }>;
  foodEntries?: Array<{
    id: string;
    date: string;
    name: string;
    meal: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  memories?: Array<{ key: string; category: string; value: string }>;
  checkIns?: Array<{
    date: string;
    energy: number;
    soreness: number;
    sleepQuality: number;
    mood: number;
  }>;
  goals?: Array<{
    id: string;
    title: string;
    detail?: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    pinned: boolean;
    status: string;
    tasks: CoachGoalTaskDraft[];
  }>;
  recentWorkouts?: unknown[];
  recentActions?: unknown[];
  routine: Array<{
    day: string;
    presetId?: string | null;
    presetName: string | null;
  }>;
};

type CoachChatResult = {
  reply: string;
  uiBlocks: CoachUiBlock[];
  operations: CoachOperation[];
  artifacts: CoachArtifact[];
  source: "openai" | "fallback";
};

type CoachContext = {
  goal: string | null;
  experienceLevel: string | null;
  safetyMode: string;
  safetyFlags: string[];
  nutritionGuidance: string[];
  weightPaceKgPerWeek: number | null;
  weightStatus: string;
  calorieTarget: number;
  averageCalories: number;
  averageProtein: number;
  proteinTarget: number;
  proteinAdherence: number;
  calorieAccuracy: number;
  macroConsistency: number;
  workoutDays7: number;
  volumeChange7Pct: number | null;
  hardSets7: number;
  selectedExerciseName: string | null;
  selectedLiftPaceKgPerWeek: number | null;
  selectedLiftFrequency: number | null;
  dataConfidence: number;
  existingInsights: CoachAdvice[];
};

function clampText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeMetric(value: MetricCatalogItem): MetricCatalogItem | null {
  const id = clampText(value.id, 120);
  const title = clampText(value.title, 80);
  if (!id || !title) return null;

  return {
    id,
    title,
    group: clampText(value.group, 40) || "Metric",
    description: clampText(value.description, 240),
    keywords: (value.keywords ?? [])
      .map((keyword) => clampText(keyword, 40))
      .filter(Boolean)
      .slice(0, MAX_KEYWORDS),
  };
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/\W+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function fallbackMetricIds(
  prompt: string,
  catalog: MetricCatalogItem[],
  maxResults: number,
) {
  const terms = tokenize(prompt);
  if (terms.length === 0) return catalog.slice(0, maxResults).map((m) => m.id);

  return catalog
    .map((metric) => {
      const haystack = [
        metric.title,
        metric.group,
        metric.description,
        ...metric.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return {
        id: metric.id,
        score: terms.reduce(
          (score, term) => score + (haystack.includes(term) ? 1 : 0),
          0,
        ),
      };
    })
    .filter((metric) => metric.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((metric) => metric.id);
}

function normalizeOpenAiResult(
  value: unknown,
  allowedIds: Set<string>,
  maxResults: number,
): Pick<MetricGenerationResult, "metricIds" | "customMetricTitle"> | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const metricIds = Array.isArray(input.metricIds)
    ? input.metricIds
        .map((id) => clampText(id, 120))
        .filter((id) => allowedIds.has(id))
    : [];

  const uniqueIds = Array.from(new Set(metricIds)).slice(0, maxResults);
  const customMetricTitle = clampText(input.customMetricTitle, 48);

  if (uniqueIds.length === 0 && !customMetricTitle) return null;
  return {
    metricIds: uniqueIds,
    ...(customMetricTitle ? { customMetricTitle } : {}),
  };
}

function normalizeCoachAdvice(value: unknown): CoachAdvice[] | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const rawAdvice = Array.isArray(input.advice) ? input.advice : [];
  const advice = rawAdvice
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = clampText(row.label, 28);
      const title = clampText(row.title, 86);
      const detail = clampText(row.detail, 240);
      if (!label || !title || !detail) return null;
      return { label, title, detail };
    })
    .filter((item): item is CoachAdvice => Boolean(item))
    .slice(0, 4);

  return advice.length > 0 ? advice : null;
}

function normalizeCoachUiStats(value: unknown): CoachUiStat[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = clampText(row.label, 28);
      const statValue = clampText(row.value, 28);
      if (!label || !statValue) return null;
      const trend = clampText(row.trend, 8);
      return {
        label,
        value: statValue,
        ...(clampText(row.detail, 64)
          ? { detail: clampText(row.detail, 64) }
          : {}),
        ...(trend === "up" || trend === "down" || trend === "flat"
          ? { trend }
          : {}),
      };
    })
    .filter((item): item is CoachUiStat => Boolean(item))
    .slice(0, 4);
}

function normalizeCoachGoalTasks(value: unknown): CoachGoalTaskDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CoachGoalTaskDraft | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = clampText(row.title ?? row.label, 90);
      if (!title) return null;
      return {
        title,
        ...(clampText(row.detail, 180)
          ? { detail: clampText(row.detail, 180) }
          : {}),
        ...(typeof (row.completed ?? row.done) === "boolean"
          ? { completed: Boolean(row.completed ?? row.done) }
          : {}),
      };
    })
    .filter((item): item is CoachGoalTaskDraft => Boolean(item))
    .slice(0, 12);
}

function normalizeCoachUiBlocks(value: unknown): CoachUiBlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = clampText(row.type, 24);

      if (type === "card") {
        const label = clampText(row.label, 28);
        const title = clampText(row.title, 86);
        const detail = clampText(row.detail, 220);
        if (!label || !title || !detail) return null;
        return { type, label, title, detail };
      }

      if (type === "stat_group") {
        const title = clampText(row.title, 64);
        const stats = normalizeCoachUiStats(row.stats);
        if (!title || stats.length === 0) return null;
        return { type, title, stats };
      }

      if (type === "checklist") {
        const title = clampText(row.title, 64);
        const rawItems = Array.isArray(row.items) ? row.items : [];
        const items = rawItems
          .map((rawItem) => {
            if (!rawItem || typeof rawItem !== "object") return null;
            const checklistItem = rawItem as Record<string, unknown>;
            const label = clampText(checklistItem.label, 72);
            if (!label) return null;
            return {
              label,
              ...(clampText(checklistItem.detail, 120)
                ? { detail: clampText(checklistItem.detail, 120) }
                : {}),
              ...(typeof checklistItem.done === "boolean"
                ? { done: checklistItem.done }
                : {}),
            };
          })
          .filter(
            (
              checklistItem,
            ): checklistItem is {
              label: string;
              detail?: string;
              done?: boolean;
            } => Boolean(checklistItem),
          )
          .slice(0, 5);
        if (!title || items.length === 0) return null;
        return { type, title, items };
      }

      if (type === "goal") {
        const title = clampText(row.title, 80);
        const detail = clampText(row.detail, 280);
        const durationDays = clampInteger(row.durationDays, 1, 365, 7);
        const tasks = normalizeCoachGoalTasks(row.tasks);
        if (!title || !detail || tasks.length === 0) return null;
        return { type, title, detail, durationDays, tasks };
      }

      if (type === "action_row") {
        const title = clampText(row.title, 64);
        const rawActions = Array.isArray(row.actions) ? row.actions : [];
        const allowedActions = new Set<CoachUiAction>([
          "open_nutrition",
          "open_workouts",
          "open_progress",
          "open_settings",
          "open_workout_builder",
          "open_recipe_builder",
          "log_food",
        ]);
        const actions = rawActions
          .map((rawAction) => {
            if (!rawAction || typeof rawAction !== "object") return null;
            const actionRow = rawAction as Record<string, unknown>;
            const label = clampText(actionRow.label, 36);
            const action = clampText(actionRow.action, 32) as CoachUiAction;
            if (!label || !allowedActions.has(action)) return null;
            return { label, action };
          })
          .filter(
            (action): action is { label: string; action: CoachUiAction } =>
              Boolean(action),
          )
          .slice(0, 3);
        if (!title || actions.length === 0) return null;
        return { type, title, actions };
      }

      return null;
    })
    .filter((item): item is CoachUiBlock => Boolean(item))
    .slice(0, 4);
}

function clampNumber(value: unknown, min: number, max: number, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeOperationMeta(
  row: Record<string, unknown>,
): CoachOperationMeta {
  return {
    confirmation: row.confirmation === "auto" ? "auto" : "confirm",
    summary: clampText(row.summary, 120) || "Apply Coach change",
    assumptions: (Array.isArray(row.assumptions) ? row.assumptions : [])
      .map((item) => clampText(item, 140))
      .filter(Boolean)
      .slice(0, 5),
    warnings: (Array.isArray(row.warnings) ? row.warnings : [])
      .map((item) => clampText(item, 160))
      .filter(Boolean)
      .slice(0, 5),
  };
}

function normalizeDate(value: unknown) {
  const date = clampText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeCoachOperations(value: unknown): CoachOperation[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): CoachOperation | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = clampText(row.type, 32);
      const meta = normalizeOperationMeta(row);

      if (type === "save_recipe") {
        const name = clampText(row.name, 64);
        const rawIngredients = Array.isArray(row.ingredients)
          ? row.ingredients
          : [];
        const ingredients = rawIngredients
          .map((item): CoachRecipeIngredient | null => {
            if (!item || typeof item !== "object") return null;
            const ingredient = item as Record<string, unknown>;
            const ingredientName = clampText(ingredient.name, 80);
            if (!ingredientName) return null;
            return {
              name: ingredientName,
              grams: clampNumber(ingredient.grams, 1, 3000, 100),
              caloriesPer100: clampNumber(ingredient.caloriesPer100, 0, 1000),
              proteinPer100: clampNumber(ingredient.proteinPer100, 0, 100),
              carbsPer100: clampNumber(ingredient.carbsPer100, 0, 100),
              fatPer100: clampNumber(ingredient.fatPer100, 0, 100),
            };
          })
          .filter((item): item is CoachRecipeIngredient => Boolean(item))
          .slice(0, 20);
        if (!name || ingredients.length === 0) return null;
        return {
          ...meta,
          confirmation: "confirm",
          type,
          ...(clampText(row.recipeId, 100)
            ? { recipeId: clampText(row.recipeId, 100) }
            : {}),
          name,
          description: clampText(row.description, 180),
          servings: Math.round(clampNumber(row.servings, 1, 20, 1)),
          prepMinutes: Math.round(clampNumber(row.prepMinutes, 1, 360, 15)),
          cookMinutes: Math.round(clampNumber(row.cookMinutes, 0, 480, 15)),
          category: clampText(row.category, 40),
          notes: clampText(row.notes, 300),
          tags: (Array.isArray(row.tags) ? row.tags : [])
            .map((tag) => clampText(tag, 24))
            .filter(Boolean)
            .slice(0, 4),
          ingredients,
          steps: (Array.isArray(row.steps) ? row.steps : [])
            .map((step) => clampText(step, 180))
            .filter(Boolean)
            .slice(0, 10),
          ...(clampText(row.logMeal, 32)
            ? { logMeal: clampText(row.logMeal, 32) }
            : {}),
          ...(row.servingsToLog !== undefined
            ? {
                servingsToLog: clampNumber(row.servingsToLog, 0.1, 20, 1),
              }
            : {}),
        };
      }

      if (type === "log_nutrition") {
        const name = clampText(row.name, 80);
        if (!name) return null;
        return {
          ...meta,
          type,
          ...(clampText(row.entryId, 100)
            ? { entryId: clampText(row.entryId, 100) }
            : {}),
          ...(normalizeDate(row.date) ? { date: normalizeDate(row.date) } : {}),
          name,
          meal: clampText(row.meal, 32) || "Meal",
          calories: Math.round(clampNumber(row.calories, 0, 10000)),
          protein: clampNumber(row.protein, 0, 1000),
          carbs: clampNumber(row.carbs, 0, 2000),
          fat: clampNumber(row.fat, 0, 1000),
        };
      }

      if (type === "delete_nutrition") {
        const entryId = clampText(row.entryId, 100);
        const date = normalizeDate(row.date);
        if (!entryId || !date) return null;
        return {
          ...meta,
          type,
          entryId,
          date,
          name: clampText(row.name, 80) || "nutrition entry",
        };
      }

      if (type === "create_workout_preset") {
        const name = clampText(row.name, 40);
        const allowedSetTypes = new Set([
          "working",
          "warmup",
          "failure",
          "myoreps",
          "drop",
        ]);
        const exercises = (Array.isArray(row.exercises) ? row.exercises : [])
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const exercise = item as Record<string, unknown>;
            const exerciseName = clampText(exercise.name, 80);
            if (!exerciseName) return null;
            const sets = (Array.isArray(exercise.sets) ? exercise.sets : [])
              .map((item) => {
                if (!item || typeof item !== "object") return null;
                const set = item as Record<string, unknown>;
                const setType = clampText(set.type, 16);
                return {
                  type: (allowedSetTypes.has(setType) ? setType : "working") as
                    "working" | "warmup" | "failure" | "myoreps" | "drop",
                  weight: clampText(set.weight, 16),
                  reps: clampText(set.reps, 24),
                  restSeconds: Math.round(
                    clampNumber(set.restSeconds, 0, 900, 120),
                  ),
                };
              })
              .filter((set): set is NonNullable<typeof set> => Boolean(set))
              .slice(0, 10);
            return {
              name: exerciseName,
              sets:
                sets.length > 0
                  ? sets
                  : [
                      {
                        type: "working" as const,
                        weight: "",
                        reps: "8-12",
                        restSeconds: 120,
                      },
                    ],
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 12);
        if (!name || exercises.length === 0) return null;
        const focus = clampText(row.focus, 16);
        return {
          ...meta,
          type,
          ...(clampText(row.presetId, 100)
            ? { presetId: clampText(row.presetId, 100) }
            : {}),
          ...(row.reason === "progression" ||
          row.reason === "recovery" ||
          row.reason === "substitution"
            ? { reason: row.reason }
            : { reason: "user_edit" as const }),
          name,
          focus:
            focus === "cardio" || focus === "mobility" ? focus : "strength",
          exercises,
          scheduleDays: (Array.isArray(row.scheduleDays)
            ? row.scheduleDays
            : []
          )
            .map((day) => clampText(day, 3))
            .filter((day) =>
              ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day),
            )
            .slice(0, 7),
        };
      }

      if (type === "create_workout_plan") {
        const presets = (Array.isArray(row.presets) ? row.presets : [])
          .map((item): CoachWorkoutPresetDraft | null => {
            if (!item || typeof item !== "object") return null;
            const normalized = normalizeCoachOperations([
              {
                ...meta,
                ...(item as Record<string, unknown>),
                type: "create_workout_preset",
              },
            ])[0];
            if (!normalized || normalized.type !== "create_workout_preset") {
              return null;
            }
            const {
              type: _type,
              confirmation: _confirmation,
              summary: _summary,
              assumptions: _assumptions,
              warnings: _warnings,
              ...preset
            } = normalized;
            return preset;
          })
          .filter((item): item is CoachWorkoutPresetDraft => Boolean(item))
          .slice(0, 7);
        const normalizedRoutine = normalizeCoachOperations([
          {
            ...meta,
            type: "update_routine",
            assignments: row.assignments,
          },
        ])[0];
        if (
          presets.length === 0 ||
          !normalizedRoutine ||
          normalizedRoutine.type !== "update_routine"
        ) {
          return null;
        }
        const presetNames = new Set(
          presets.map((preset) => preset.name.toLowerCase()),
        );
        if (
          normalizedRoutine.assignments.some(
            (assignment) =>
              assignment.presetName !== null &&
              !presetNames.has(assignment.presetName.toLowerCase()),
          )
        ) {
          return null;
        }
        return {
          ...meta,
          type,
          presets,
          assignments: normalizedRoutine.assignments,
        };
      }

      if (type === "update_routine") {
        const assignments = (
          Array.isArray(row.assignments) ? row.assignments : []
        )
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const assignment = item as Record<string, unknown>;
            const day = clampText(assignment.day, 3);
            if (
              !["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day)
            ) {
              return null;
            }
            return {
              day,
              presetName:
                assignment.presetName === null
                  ? null
                  : clampText(assignment.presetName, 40) || null,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 7);
        return assignments.length > 0 ? { ...meta, type, assignments } : null;
      }

      if (type === "remember") {
        const key = clampText(row.key, 64).toLowerCase();
        const value = clampText(row.value, 240);
        if (!key || !value) return null;
        return {
          ...meta,
          type,
          key,
          category: clampText(row.category, 32) || "preference",
          value,
        };
      }

      if (type === "forget_memory") {
        const key = clampText(row.key, 64).toLowerCase();
        if (!key) return null;
        return {
          ...meta,
          type,
          key,
          value: clampText(row.value, 240) || key,
        };
      }

      if (type === "save_check_in") {
        const date = normalizeDate(row.date);
        if (!date) return null;
        return {
          ...meta,
          type,
          date,
          energy: Math.round(clampNumber(row.energy, 1, 5, 3)),
          soreness: Math.round(clampNumber(row.soreness, 1, 5, 3)),
          sleepQuality: Math.round(clampNumber(row.sleepQuality, 1, 5, 3)),
          mood: Math.round(clampNumber(row.mood, 1, 5, 3)),
          ...(clampText(row.note, 280)
            ? { note: clampText(row.note, 280) }
            : {}),
        };
      }

      if (type === "save_weekly_plan") {
        const weekStart = normalizeDate(row.weekStart);
        const days = (Array.isArray(row.days) ? row.days : [])
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const day = item as Record<string, unknown>;
            const dayName = clampText(day.day, 3);
            if (!DAYS.includes(dayName as (typeof DAYS)[number])) return null;
            return {
              day: dayName,
              ...(clampText(day.workoutPresetId, 100)
                ? { workoutPresetId: clampText(day.workoutPresetId, 100) }
                : {}),
              ...(clampText(day.workoutLabel, 80)
                ? { workoutLabel: clampText(day.workoutLabel, 80) }
                : {}),
              meals: (Array.isArray(day.meals) ? day.meals : [])
                .map((item) => {
                  if (!item || typeof item !== "object") return null;
                  const meal = item as Record<string, unknown>;
                  const label = clampText(meal.label, 80);
                  if (!label) return null;
                  return {
                    label,
                    ...(clampText(meal.recipeId, 100)
                      ? { recipeId: clampText(meal.recipeId, 100) }
                      : {}),
                    ...(clampText(meal.note, 180)
                      ? { note: clampText(meal.note, 180) }
                      : {}),
                  };
                })
                .filter((item): item is NonNullable<typeof item> =>
                  Boolean(item),
                )
                .slice(0, 6),
              ...(clampText(day.recoveryNote, 180)
                ? { recoveryNote: clampText(day.recoveryNote, 180) }
                : {}),
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 7);
        if (!weekStart || days.length === 0) return null;
        return {
          ...meta,
          type,
          weekStart,
          title: clampText(row.title, 80) || "Weekly plan",
          days,
          planAssumptions: (Array.isArray(row.planAssumptions)
            ? row.planAssumptions
            : []
          )
            .map((item) => clampText(item, 180))
            .filter(Boolean)
            .slice(0, 10),
        };
      }

      if (type === "save_goal") {
        const title = clampText(row.title, 80);
        const detail = clampText(row.detail, 280);
        const startDate = normalizeDate(row.startDate);
        const tasks = normalizeCoachGoalTasks(row.tasks);
        if (!title || !detail || !startDate || tasks.length === 0) return null;
        return {
          ...meta,
          type,
          ...(clampText(row.goalId, 100)
            ? { goalId: clampText(row.goalId, 100) }
            : {}),
          title,
          detail,
          startDate,
          durationDays: clampInteger(row.durationDays, 1, 365, 7),
          pinned: row.pinned === true,
          tasks,
        };
      }

      if (type === "undo_action") {
        const actionId = clampText(row.actionId, 100);
        if (!actionId) return null;
        return {
          ...meta,
          type,
          actionId,
          actionSummary: clampText(row.actionSummary, 160) || "Coach change",
        };
      }

      return null;
    })
    .filter((item): item is CoachOperation => Boolean(item))
    .slice(0, 12);
}

function normalizeCoachArtifacts(value: unknown): CoachArtifact[] {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set<CoachArtifact["type"]>([
    "today_briefing",
    "progress_explanation",
    "simulation",
    "validation",
    "recovery_adaptation",
  ]);
  return value
    .map((item): CoachArtifact | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = clampText(row.type, 32) as CoachArtifact["type"];
      const title = clampText(row.title, 90);
      const detail = clampText(row.detail, 500);
      if (!allowedTypes.has(type) || !title || !detail) return null;
      return {
        type,
        title,
        ...(clampText(row.status, 24)
          ? { status: clampText(row.status, 24) }
          : {}),
        detail,
        evidence: (Array.isArray(row.evidence) ? row.evidence : [])
          .map((value) => clampText(value, 160))
          .filter(Boolean)
          .slice(0, 6),
        nextSteps: (Array.isArray(row.nextSteps) ? row.nextSteps : [])
          .map((value) => clampText(value, 160))
          .filter(Boolean)
          .slice(0, 5),
      };
    })
    .filter((item): item is CoachArtifact => Boolean(item))
    .slice(0, 4);
}

function normalizeCoachChatResponse(value: unknown, message: string) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const reply = clampText(input.reply, 900);
  if (!reply) return null;
  return {
    reply,
    uiBlocks: isCasualCoachMessage(message)
      ? []
      : normalizeCoachUiBlocks(input.uiBlocks),
    operations: normalizeCoachOperations(input.operations),
    artifacts: isCasualCoachMessage(message)
      ? []
      : normalizeCoachArtifacts(input.artifacts),
  };
}

function isCasualCoachMessage(message: string) {
  return /^(?:hi|hey|hello|how are you|how's it going|thanks|thank you|good morning|good afternoon|good evening)[?!.\s]*$/i.test(
    message.trim(),
  );
}

function shouldUseFallbackUi(message: string) {
  return /\b(?:analy[sz]e|compare|progress|trend|summary|summarize|recovery|data|breakdown|plan|routine|recipe|workout)\b/i.test(
    message,
  );
}

function fallbackCoachUiBlocks(context: CoachContext): CoachUiBlock[] {
  if (context.safetyMode !== "standard" || context.safetyFlags.length > 0) {
    return [
      {
        type: "card",
        label: "Safety context",
        title: "Keep the next step conservative",
        detail:
          context.nutritionGuidance[0] ??
          "Use gradual changes and qualified guidance where your setup context calls for it.",
      },
      {
        type: "action_row",
        title: "Choose a safe next step",
        actions: [
          { label: "Workouts", action: "open_workouts" },
          { label: "Nutrition", action: "open_nutrition" },
        ],
      },
    ];
  }

  const blocks: CoachUiBlock[] = [
    {
      type: "stat_group",
      title: "Current signals",
      stats: [
        {
          label: "Calories",
          value: `${Math.round(context.averageCalories)} kcal`,
          detail: `Target ${Math.round(context.calorieTarget)}`,
          trend: "flat",
        },
        {
          label: "Protein",
          value: `${Math.round(context.averageProtein)}g`,
          detail: `Target ${Math.round(context.proteinTarget)}g`,
          trend:
            context.averageProtein >= context.proteinTarget ? "up" : "down",
        },
        {
          label: "Training",
          value: `${Math.round(context.workoutDays7)} days`,
          detail: `${Math.round(context.hardSets7)} sets`,
          trend: context.workoutDays7 >= 3 ? "up" : "flat",
        },
      ],
    },
  ];

  if (context.proteinAdherence < 75) {
    blocks.push({
      type: "checklist",
      title: "Protein reset",
      items: [
        { label: "Pick one repeatable high-protein meal" },
        { label: "Log it for the next 3 days" },
        {
          label: "Adjust calories only after protein is stable",
          detail: "This keeps the next change easier to interpret.",
        },
      ],
    });
  } else {
    blocks.push({
      type: "card",
      label: "Next step",
      title: "Keep the plan measurable",
      detail:
        "Repeat the same targets and workout exposure this week so the trend can show whether the current setup is working.",
    });
  }

  blocks.push({
    type: "action_row",
    title: "Open a tracker",
    actions: [
      { label: "Nutrition", action: "open_nutrition" },
      { label: "Workouts", action: "open_workouts" },
      { label: "Progress", action: "open_progress" },
    ],
  });

  return blocks;
}

function fallbackCoachChatResponse({
  message,
  context,
  focusInsight,
  coachMode = "chat",
}: {
  message: string;
  context: CoachContext;
  focusInsight?: CoachAdvice;
  coachMode?: "chat" | "chef" | "personal_trainer";
}): Pick<CoachChatResult, "reply" | "uiBlocks" | "operations"> {
  const uiBlocks = shouldUseFallbackUi(message)
    ? fallbackCoachUiBlocks(context)
    : [];
  const normalizedMessage = message.toLowerCase();
  const conservative =
    context.safetyMode !== "standard" || context.safetyFlags.length > 0;
  const safetyNote = conservative
    ? " I’ll keep that within the health constraints from your setup and avoid aggressive changes."
    : "";

  if (
    normalizedMessage.includes("recover") ||
    normalizedMessage.includes("fatigue") ||
    normalizedMessage.includes("sore") ||
    normalizedMessage.includes("sleep")
  ) {
    return {
      reply: `Your recent training signal is ${Math.round(context.workoutDays7)} workout days and ${Math.round(context.hardSets7)} hard sets in the last 7 days${context.volumeChange7Pct == null ? "." : `, with volume ${context.volumeChange7Pct >= 0 ? "up" : "down"} ${Math.abs(Math.round(context.volumeChange7Pct))}% from the prior week.`} Today, use performance and soreness as the decision: train normally if warm-ups feel good; otherwise cut working sets by about a third and keep the movement easy.${safetyNote}`,
      uiBlocks,
      operations: [],
    };
  }
  if (focusInsight) {
    return {
      reply: `${focusInsight.title}: ${focusInsight.detail} Make that the one measurable focus for the next 7 days, then reassess before changing another variable.${safetyNote}`,
      uiBlocks,
      operations: [],
    };
  }
  if (coachMode === "chef") {
    return {
      reply: `Chef Coach would start with one repeatable meal built around 30–40g of protein. You’re averaging ${Math.round(context.averageProtein)}g against a ${Math.round(context.proteinTarget)}g target, with intake near ${Math.round(context.averageCalories)} kcal. Pick a recipe you will actually repeat, then adjust portions instead of rebuilding the whole day.${safetyNote}`,
      uiBlocks,
      operations: [],
    };
  }
  if (coachMode === "personal_trainer") {
    return {
      reply: `Personal Trainer would keep the next session focused and measurable. You logged ${Math.round(context.workoutDays7)} workout days and ${Math.round(context.hardSets7)} hard sets this week; repeat your main movements, leave a little effort in reserve, and progress only if performance and recovery are stable.${safetyNote}`,
      uiBlocks,
      operations: [],
    };
  }
  if (context.proteinAdherence < 75) {
    return {
      reply: `The highest-impact change is protein consistency: you’re averaging ${Math.round(context.averageProtein)}g against a ${Math.round(context.proteinTarget)}g target. Add one repeatable protein anchor meal today and log it; that closes the clearest gap without changing the rest of your plan.${safetyNote}`,
      uiBlocks,
      operations: [],
    };
  }
  if (
    context.volumeChange7Pct != null &&
    Math.abs(context.volumeChange7Pct) > 35
  ) {
    return {
      reply: `Your training load changed ${Math.round(context.volumeChange7Pct)}% versus the prior week. Keep the next week repeatable: use the same main lifts, sets, and effort, and only progress when performance is stable.${safetyNote}`,
      uiBlocks,
      operations: [],
    };
  }
  if (normalizedMessage.includes("calorie")) {
    return {
      reply: `You’re averaging ${Math.round(context.averageCalories)} kcal against a ${Math.round(context.calorieTarget)} kcal target. First keep logging consistent for 10–14 days; if the weight trend is still off, make a small adjustment instead of a large cut or bulk change.${safetyNote}`,
      uiBlocks,
      operations: [],
    };
  }
  return {
    reply: `Based on the recent data, today’s best focus is consistency: hit roughly ${Math.round(context.proteinTarget)}g protein, keep intake near ${Math.round(context.calorieTarget)} kcal, and ${context.workoutDays7 >= 4 ? "protect recovery rather than adding more work" : "complete the next planned session without adding extra volume"}. Change only one variable this week so the trend can show whether it worked.${safetyNote}`,
    uiBlocks,
    operations: [],
  };
}

function fallbackCoachAdvice(context: CoachContext): CoachAdvice[] {
  const advice: CoachAdvice[] = [];
  if (context.dataConfidence < 60) {
    advice.push({
      label: "AI data check",
      title: "Improve the signal before changing the plan",
      detail:
        "Your recent data is still sparse. Add a few consistent food, body, and workout logs so coaching advice is based on trend instead of noise.",
    });
  }

  if (context.proteinAdherence < 75) {
    advice.push({
      label: "AI nutrition",
      title: "Make protein the next easy win",
      detail: `Average protein is ${Math.round(context.averageProtein)}g against a ${Math.round(context.proteinTarget)}g target. Fix this before making calorie or training-volume changes.`,
    });
  }

  if (
    context.volumeChange7Pct != null &&
    (context.volumeChange7Pct > 40 || context.volumeChange7Pct < -30)
  ) {
    advice.push({
      label: "AI workload",
      title:
        context.volumeChange7Pct > 40
          ? "Do not mistake fatigue for lost strength"
          : "Rebuild momentum with one easy session",
      detail:
        context.volumeChange7Pct > 40
          ? "Training volume jumped hard this week. Hold load steady and watch performance before adding more sets."
          : "Training volume dropped enough to weaken the trend. Pick a short session you can complete instead of waiting for a perfect day.",
    });
  }

  if (context.selectedExerciseName && context.selectedLiftFrequency != null) {
    advice.push({
      label: "AI lift focus",
      title: `Keep ${context.selectedExerciseName} measurable`,
      detail:
        context.selectedLiftFrequency < 1
          ? "It shows up less than once per week. Add a repeatable top set or backoff slot so the strength trend has enough exposures."
          : "Keep the same top-set structure for a few sessions so changes reflect strength instead of programming noise.",
    });
  }

  if (advice.length === 0) {
    advice.push({
      label: "AI next step",
      title: "Stay the course for one more week",
      detail:
        "Your core signals are coherent. Make no major target changes; focus on repeating the behaviors that produced the current trend.",
    });
  }

  return advice.slice(0, 4);
}

async function generateWithOpenAi({
  subapp,
  prompt,
  catalog,
  maxResults,
}: {
  subapp: MetricSubapp;
  prompt: string;
  catalog: MetricCatalogItem[];
  maxResults: number;
}) {
  if (!hasOpenAiApiKey()) return null;

  const allowedIds = new Set(catalog.map((metric) => metric.id));
  const content = await requestOpenAiJson({
    system: renderSystemPrompt("metric_selection"),
    user: JSON.stringify({
      subapp,
      request: prompt,
      maxResults,
      responseShape: {
        metricIds: ["existing metric ids only"],
        customMetricTitle: "optional short custom metric name or null",
      },
      catalog,
    }),
    temperature: 0.15,
    maxTokens: 500,
  });

  return normalizeOpenAiResult(JSON.parse(content), allowedIds, maxResults);
}

async function generateCoachAdviceWithOpenAi(context: CoachContext) {
  if (!hasOpenAiApiKey()) return null;
  const content = await requestOpenAiJson({
    system: renderSystemPrompt("coach_advice"),
    user: JSON.stringify({
      context,
      responseShape: {
        advice: [
          {
            label: "short category",
            title: "specific headline",
            detail: "one concrete recommendation tied to the metrics",
          },
        ],
      },
    }),
    temperature: 0.35,
    maxTokens: 650,
  });
  return normalizeCoachAdvice(JSON.parse(content));
}

async function generateCoachChatWithOpenAi({
  context,
  message,
  coachMode,
  history,
  focusInsight,
  workspace,
  imageUrl,
}: {
  context: CoachContext;
  message: string;
  coachMode: "chat" | "chef" | "personal_trainer";
  history: CoachChatMessage[];
  focusInsight?: CoachAdvice;
  workspace?: CoachWorkspace;
  imageUrl?: string;
}) {
  if (!hasOpenAiApiKey()) return null;
  const content = await requestOpenAiJson({
    system: renderSystemPrompt("coach_chat"),
    user: JSON.stringify({
      context,
      workspace,
      focusInsight,
      recentConversation: history.slice(-8),
      coachMode,
      message,
      responseShape: {
        reply: "short tailored answer",
        uiBlocks: [
          {
            type: "stat_group",
            title: "short title",
            stats: [
              {
                label: "metric label",
                value: "display value",
                detail: "optional short context",
                trend: "up | down | flat",
              },
            ],
          },
          {
            type: "card",
            label: "short category",
            title: "specific headline",
            detail: "one recommendation tied to the metrics",
          },
          {
            type: "checklist",
            title: "short title",
            items: [
              {
                label: "task",
                detail: "optional short context",
                done: false,
              },
            ],
          },
          {
            type: "goal",
            title: "time-boxed goal title",
            detail: "what success looks like and why this scope fits",
            durationDays: 7,
            tasks: [
              {
                title: "specific repeatable task",
                detail: "frequency, duration, or measurable minimum",
                completed: false,
              },
            ],
          },
          {
            type: "action_row",
            title: "short title",
            actions: [
              {
                label: "button label",
                action:
                  "open_nutrition | open_workouts | open_progress | open_settings | open_workout_builder | open_recipe_builder | log_food",
              },
            ],
          },
        ],
        operations: [
          {
            type: "save_recipe",
            confirmation: "confirm",
            summary: "exact change",
            assumptions: ["safe assumption"],
            warnings: [],
            recipeId: "optional exact existing recipe id",
            name: "recipe name",
            description: "short appetizing description",
            servings: 2,
            prepMinutes: 20,
            cookMinutes: 15,
            category: "Dinner",
            notes: "Storage, substitution, or serving notes",
            tags: ["high protein", "quick"],
            ingredients: [
              {
                name: "ingredient",
                grams: 100,
                caloriesPer100: 100,
                proteinPer100: 10,
                carbsPer100: 10,
                fatPer100: 2,
              },
            ],
            steps: ["Clear cooking step"],
            logMeal: "optional meal to log immediately",
            servingsToLog: 1,
          },
          {
            type: "log_nutrition",
            confirmation: "auto | confirm",
            summary: "exact change",
            assumptions: [],
            warnings: [],
            entryId: "optional existing entry id for correction",
            date: "YYYY-MM-DD",
            name: "food or meal",
            meal: "Breakfast | Lunch | Dinner | Snack",
            calories: 500,
            protein: 30,
            carbs: 50,
            fat: 15,
          },
          {
            type: "create_workout_preset",
            confirmation: "auto | confirm",
            summary: "exact change",
            assumptions: [],
            warnings: [],
            presetId: "optional exact existing preset id",
            reason: "user_edit | progression | recovery | substitution",
            name: "preset name",
            focus: "strength | cardio | mobility",
            exercises: [
              {
                name: "catalog exercise name",
                sets: [
                  {
                    type: "working",
                    weight: "kg string or empty",
                    reps: "8-12",
                    restSeconds: 120,
                  },
                ],
              },
            ],
            scheduleDays: ["Mon"],
          },
          {
            type: "create_workout_plan",
            confirmation: "auto | confirm",
            summary: "create and organize the complete workout plan",
            assumptions: ["explicit reasonable defaults"],
            warnings: [],
            presets: [
              {
                name: "distinct training-day preset name",
                focus: "strength | cardio | mobility",
                exercises: [
                  {
                    name: "catalog exercise name",
                    sets: [
                      {
                        type: "working",
                        weight: "",
                        reps: "8-12",
                        restSeconds: 120,
                      },
                    ],
                  },
                ],
                scheduleDays: ["Mon", "Thu"],
              },
            ],
            assignments: [
              { day: "Mon", presetName: "exact included preset name" },
              { day: "Sun", presetName: null },
            ],
          },
          {
            type: "update_routine",
            confirmation: "auto | confirm",
            summary: "exact change",
            assumptions: [],
            warnings: [],
            assignments: [
              { day: "Mon", presetName: "existing preset name or null" },
            ],
          },
          {
            type: "remember",
            confirmation: "auto | confirm",
            summary: "exact durable preference being remembered",
            assumptions: [],
            warnings: [],
            key: "short-stable-kebab-case-key",
            category:
              "preference | food | equipment | schedule | constraint | response_style",
            value: "only the durable fact explicitly stated by the user",
          },
          {
            type: "forget_memory",
            confirmation: "auto | confirm",
            summary: "memory being forgotten",
            assumptions: [],
            warnings: [],
            key: "exact key from workspace memories",
            value: "memory value from workspace",
          },
          {
            type: "save_check_in",
            confirmation: "auto | confirm",
            summary: "check-in being recorded",
            assumptions: [],
            warnings: [],
            date: "YYYY-MM-DD",
            energy: 3,
            soreness: 3,
            sleepQuality: 3,
            mood: 3,
            note: "optional user-provided note",
          },
          {
            type: "save_weekly_plan",
            confirmation: "auto | confirm",
            summary: "weekly plan being saved",
            assumptions: [],
            warnings: [],
            weekStart: "YYYY-MM-DD for Monday",
            title: "short plan title",
            days: [
              {
                day: "Mon",
                workoutPresetId: "optional exact workspace preset id",
                workoutLabel: "optional workout label",
                meals: [
                  {
                    label: "meal label",
                    recipeId: "optional exact workspace recipe id",
                    note: "optional meal note",
                  },
                ],
                recoveryNote: "optional recovery guidance",
              },
            ],
            planAssumptions: ["explicit planning assumption"],
          },
          {
            type: "save_goal",
            confirmation: "auto | confirm",
            summary: "create or update the time-boxed Coach goal",
            assumptions: [],
            warnings: [],
            goalId: "optional exact existing goal id",
            title: "short goal title",
            detail: "clear success condition",
            startDate: "YYYY-MM-DD",
            durationDays: 7,
            pinned: true,
            tasks: [
              {
                title: "specific task",
                detail: "measurable frequency, duration, or target",
                completed: false,
              },
            ],
          },
          {
            type: "delete_nutrition",
            confirmation: "confirm",
            summary: "nutrition entry being deleted",
            assumptions: [],
            warnings: ["This removes an existing log entry."],
            entryId: "exact workspace food entry id",
            date: "YYYY-MM-DD",
            name: "entry name from workspace",
          },
          {
            type: "undo_action",
            confirmation: "auto | confirm",
            summary: "Coach action being undone",
            assumptions: [],
            warnings: [],
            actionId: "exact id from workspace recentActions",
            actionSummary: "exact action summary from workspace",
          },
        ],
        artifacts: [
          {
            type: "today_briefing | progress_explanation | simulation | validation | recovery_adaptation",
            title: "short useful title",
            status: "optional status",
            detail: "specific explanation tied to user data",
            evidence: ["metric or observation"],
            nextSteps: ["concrete next step"],
          },
        ],
      },
    }),
    ...(imageUrl ? { image: { url: imageUrl, detail: "high" as const } } : {}),
    temperature: 0.3,
    maxTokens: 3200,
  });
  return normalizeCoachChatResponse(JSON.parse(content), message);
}

export const generateMetricSet = action({
  args: {
    subapp: v.union(
      v.literal("dashboard"),
      v.literal("nutrition"),
      v.literal("progress"),
      v.literal("workouts"),
    ),
    prompt: v.string(),
    metrics: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        group: v.string(),
        description: v.string(),
        keywords: v.array(v.string()),
      }),
    ),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MetricGenerationResult> => {
    const user = await getAuthUser(ctx);

    const prompt = args.prompt.trim().slice(0, MAX_PROMPT_CHARS);
    if (prompt.length < 2) throw new Error("Describe what you want to track.");

    const catalog = args.metrics
      .slice(0, MAX_METRICS)
      .map(normalizeMetric)
      .filter((metric): metric is MetricCatalogItem => Boolean(metric));
    const maxResults = clampInteger(
      args.maxResults,
      1,
      MAX_RESULTS,
      DEFAULT_MAX_RESULTS,
    );

    await consumeAiUsageOrThrow(ctx, user._id, "progress_metrics");

    if (catalog.length === 0) {
      return {
        metricIds: [],
        customMetricTitle: prompt.slice(0, 48),
        source: "fallback",
      };
    }

    try {
      const aiResult = await generateWithOpenAi({
        subapp: args.subapp,
        prompt,
        catalog,
        maxResults,
      });
      if (aiResult) return { ...aiResult, source: "openai" };
    } catch (error) {
      console.warn("Falling back to server metric matcher", error);
    }

    const metricIds = fallbackMetricIds(prompt, catalog, maxResults);
    if (metricIds.length > 0) return { metricIds, source: "fallback" };

    return {
      metricIds: [],
      customMetricTitle: prompt.slice(0, 48),
      source: "fallback",
    };
  },
});

const coachContextValidator = v.object({
  goal: v.union(v.string(), v.null()),
  experienceLevel: v.union(v.string(), v.null()),
  safetyMode: v.string(),
  safetyFlags: v.array(v.string()),
  nutritionGuidance: v.array(v.string()),
  weightPaceKgPerWeek: v.union(v.number(), v.null()),
  weightStatus: v.string(),
  calorieTarget: v.number(),
  averageCalories: v.number(),
  averageProtein: v.number(),
  proteinTarget: v.number(),
  proteinAdherence: v.number(),
  calorieAccuracy: v.number(),
  macroConsistency: v.number(),
  workoutDays7: v.number(),
  volumeChange7Pct: v.union(v.number(), v.null()),
  hardSets7: v.number(),
  selectedExerciseName: v.union(v.string(), v.null()),
  selectedLiftPaceKgPerWeek: v.union(v.number(), v.null()),
  selectedLiftFrequency: v.union(v.number(), v.null()),
  dataConfidence: v.number(),
  existingInsights: v.array(
    v.object({
      label: v.string(),
      title: v.string(),
      detail: v.string(),
    }),
  ),
});

function sanitizeCoachContext(input: CoachContext): CoachContext {
  return {
    ...input,
    goal: clampText(input.goal, 32) || null,
    experienceLevel: clampText(input.experienceLevel, 24) || null,
    safetyMode: clampText(input.safetyMode, 24) || "standard",
    safetyFlags: input.safetyFlags
      .slice(0, 16)
      .map((flag) => clampText(flag, 64))
      .filter(Boolean),
    nutritionGuidance: input.nutritionGuidance
      .slice(0, 12)
      .map((guidance) => clampText(guidance, 180))
      .filter(Boolean),
    weightStatus: clampText(input.weightStatus, 40),
    selectedExerciseName: clampText(input.selectedExerciseName, 80) || null,
    existingInsights: input.existingInsights
      .slice(0, 10)
      .map((insight) => ({
        label: clampText(insight.label, 28),
        title: clampText(insight.title, 86),
        detail: clampText(insight.detail, 240),
      }))
      .filter((insight) => insight.label && insight.title && insight.detail),
  };
}

export const generateCoachAdvice = action({
  args: {
    context: coachContextValidator,
  },
  handler: async (ctx, args): Promise<CoachAdviceResult> => {
    const user = await getAuthUser(ctx);
    const context = sanitizeCoachContext(args.context);

    await consumeAiUsageOrThrow(ctx, user._id, "progress_metrics");

    try {
      const advice = await generateCoachAdviceWithOpenAi(context);
      if (advice) return { advice, source: "openai" };
    } catch (error) {
      console.warn("Falling back to server coach advice", error);
    }

    return { advice: fallbackCoachAdvice(context), source: "fallback" };
  },
});

export const generateCoachChatMessage = action({
  args: {
    context: coachContextValidator,
    message: v.string(),
    coachMode: v.optional(
      v.union(
        v.literal("chat"),
        v.literal("chef"),
        v.literal("personal_trainer"),
      ),
    ),
    attachmentId: v.optional(v.id("coachUploads")),
    workspace: v.optional(
      v.object({
        today: v.optional(v.string()),
        presets: v.array(
          v.object({
            name: v.string(),
            id: v.string(),
            updatedAt: v.optional(v.number()),
            snapshot: v.optional(v.any()),
          }),
        ),
        recipes: v.optional(v.array(v.any())),
        foodEntries: v.optional(v.array(v.any())),
        memories: v.optional(v.array(v.any())),
        checkIns: v.optional(v.array(v.any())),
        goals: v.optional(v.array(v.any())),
        recentWorkouts: v.optional(v.array(v.any())),
        recentActions: v.optional(v.array(v.any())),
        routine: v.array(
          v.object({
            day: v.string(),
            presetId: v.optional(v.union(v.string(), v.null())),
            presetName: v.union(v.string(), v.null()),
          }),
        ),
      }),
    ),
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    focusInsight: v.optional(
      v.object({
        label: v.string(),
        title: v.string(),
        detail: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<CoachChatResult> => {
    const user = await getAuthUser(ctx);
    const attachment: {
      url: string;
      mimeType: string;
      fileName: string;
    } | null = args.attachmentId
      ? await ctx.runQuery(internal.ai.coachState.resolveUploadForModel, {
          id: args.attachmentId,
          userId: user._id,
        })
      : null;
    if (args.attachmentId && !attachment) {
      throw new Error("That image is unavailable or has expired.");
    }
    const message =
      clampText(args.message, MAX_PROMPT_CHARS) ||
      (attachment ? "Analyze this image in the context of my goals." : "");
    if (message.length < 2) throw new Error("Ask a coaching question.");

    const context = sanitizeCoachContext(args.context);
    const coachMode = args.coachMode ?? "chat";
    const history = args.history
      .slice(-10)
      .map((item) => ({
        role: item.role,
        content: clampText(item.content, 700),
      }))
      .filter((item) => item.content.length > 0);
    const focusInsight = args.focusInsight
      ? {
          label: clampText(args.focusInsight.label, 28),
          title: clampText(args.focusInsight.title, 86),
          detail: clampText(args.focusInsight.detail, 240),
        }
      : undefined;
    const workspace = args.workspace
      ? {
          presets: args.workspace.presets.slice(0, 40).map((preset) => ({
            name: clampText(preset.name, 40),
            id: clampText(preset.id, 80),
            ...(preset.updatedAt !== undefined
              ? { updatedAt: preset.updatedAt }
              : {}),
            ...(preset.snapshot !== undefined
              ? { snapshot: preset.snapshot }
              : {}),
          })),
          ...(normalizeDate(args.workspace.today)
            ? { today: normalizeDate(args.workspace.today) }
            : {}),
          recipes: (args.workspace.recipes ?? []).slice(0, 30),
          foodEntries: (args.workspace.foodEntries ?? []).slice(0, 50),
          memories: (args.workspace.memories ?? []).slice(0, 50),
          checkIns: (args.workspace.checkIns ?? []).slice(0, 21),
          goals: (args.workspace.goals ?? []).slice(0, 20),
          recentWorkouts: (args.workspace.recentWorkouts ?? []).slice(0, 30),
          recentActions: (args.workspace.recentActions ?? []).slice(0, 30),
          routine: args.workspace.routine.slice(0, 7).map((entry) => ({
            day: clampText(entry.day, 3),
            presetId: entry.presetId ?? null,
            presetName: entry.presetName
              ? clampText(entry.presetName, 40)
              : null,
          })),
        }
      : undefined;

    await consumeAiUsageOrThrow(ctx, user._id, "progress_metrics");

    try {
      const response = await generateCoachChatWithOpenAi({
        context,
        message,
        coachMode,
        history,
        focusInsight,
        workspace,
        imageUrl: attachment?.url,
      });
      if (response) return { ...response, source: "openai" };
    } catch (error) {
      console.warn("Falling back to server coach chat", error);
    }

    const fallback = fallbackCoachChatResponse({
      message,
      context,
      focusInsight,
      coachMode,
    });
    return {
      ...fallback,
      artifacts: [],
      source: "fallback",
    };
  },
});
