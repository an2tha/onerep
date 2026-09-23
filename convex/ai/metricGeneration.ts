import { AiProviderError, defaultOpenRouterModel } from "./provider";
import { coachOpenUIPrompt } from "./coachOpenUI.generated";
import { normalizeCoachOpenUI } from "./coachOpenUI";
import { prepareWithJev } from "./jev";
import { coachPreparationCandidates } from "./coachPreparationCandidates";
import type { JevHandoff } from "../../packages/models/src/coachPreparation";
import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUser } from "../lib/auth";
import {
  assertCatalogModel,
  hasOpenAiApiKey,
  requestOpenAiJson,
} from "./provider";
import { renderSystemPrompt } from "./prompts.generated";
import { consumeAiUsageOrThrow, refundAiUsage } from "./usage";
import type { CoachWorkspace } from "./coachWorkspace";
import {
  analyzeMealPhotoForCoach,
  type CoachMealPhotoAnalysis,
} from "../logs/snap";
import {
  COACH_SUPPLEMENT_CATEGORIES,
  COACH_SUPPLEMENT_FORMS,
  COACH_SUPPLEMENT_NUTRIENT_KEYS,
  COACH_SUPPLEMENT_SCHEDULE_TYPES,
  NUTRITION_TARGET_FIELDS,
  NUTRITION_TARGET_RANGES,
} from "../../packages/models/src/coach";
import type { CoachWeeklyPlanMeal } from "../../packages/models/src/coach";
import type {
  SupplementCategory,
  SupplementForm,
  SupplementNutrients,
  SupplementSchedule,
} from "../../packages/models/src/supplements";
import { COACH_MAX_MESSAGE_CHARS } from "../../packages/models/src/coach";

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

type CoachGoalTaskDraft = {
  title: string;
  detail?: string;
  completed?: boolean;
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
    supersetGroup?: string;
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
        type: "start_recovery";
        symptoms?: string;
        energy?: "low" | "okay" | "good";
        manageable?: string;
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
        type: "create_scheduled_check_in";
        checkInId?: string;
        title: string;
        prompt: string;
        cadence: "daily";
        hour: number;
        minute: number;
        timezone: string;
      }
    | {
        type: "save_weekly_plan";
        weekStart: string;
        title: string;
        days: Array<{
          day: string;
          workoutPresetId?: string;
          workoutLabel?: string;
          meals: CoachWeeklyPlanMeal[];
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
        type: "save_progress_metric";
        title: string;
        description: string;
        tab: "body" | "nutrition" | "training";
        kind: "counter" | "number" | "toggle";
        unit: string;
        step: number;
        target?: number;
        accent: "food" | "water" | "workout" | "progress";
      }
    | {
        type: "save_dashboard_widget";
        title: string;
        description: string;
        kind: "stat" | "counter" | "progress" | "sparkline" | "decay";
        sourceMetricId?: string;
        sourceMetricTitle: string;
        unit: string;
        accent: "food" | "water" | "workout" | "progress";
        target?: number;
        windowDays?: number;
        halfLifeHours?: number;
        parentWidgetId?: string;
        followUpTitle?: string;
        followUpKind?: "stat" | "counter" | "progress" | "sparkline" | "decay";
      }
    | {
        type: "save_supplement";
        supplementId?: string;
        name: string;
        brand?: string;
        category: SupplementCategory;
        form: SupplementForm;
        servingLabel: string;
        defaultServingQuantity: number;
        notes?: string;
        active: boolean;
        schedule: SupplementSchedule;
        nutrientsPerServing: SupplementNutrients;
      }
    | {
        type: "set_nutrition_targets";
        calories?: number;
        protein?: number;
        carbs?: number;
        fat?: number;
        waterMl?: number;
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

/**
 * The workspace shape older installed clients still send.
 *
 * Kept only so their calls validate — the client-supplied workspace is never
 * forwarded to the model. `buildCoachWorkspace` on the server is the single
 * source of context; see `legacyWorkspace` below.
 */
type LegacyClientWorkspace = {
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
  progressMetrics?: Array<{
    id: string;
    title: string;
    description: string;
    tab: string;
    kind: string;
    unit: string;
    target?: number;
  }>;
  dashboardWidgets?: Array<{
    id: string;
    title: string;
    description: string;
    kind: string;
    sourceMetricId: string;
    sourceMetricTitle: string;
    pinned: boolean;
    parentWidgetId?: string;
  }>;
  routine: Array<{
    day: string;
    presetId?: string | null;
    presetName: string | null;
  }>;
};

type CoachChatResult = {
  reply: string;
  sleepMode?: boolean;
  openui: string;
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
  /** Oldest to newest, today last, so the strip reads left to right. */
  weekDays: CoachWeekDay[];
  todayProtein: number;
  todayCalories: number;
  lastWorkout: { name: string; date: string; sets: number } | null;
  /** Nothing logged anywhere, so the coach opens differently. */
  hasAnyData: boolean;
  existingInsights: CoachAdvice[];
};

type CoachWeekDay = {
  date: string;
  /** Single letter, Monday-agnostic: the strip is anchored on today. */
  label: string;
  trained: boolean;
  today: boolean;
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

function clampNumber(value: unknown, min: number, max: number, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
              ...(clampText(exercise.supersetGroup, 24)
                ? { supersetGroup: clampText(exercise.supersetGroup, 24) }
                : {}),
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

      if (type === "start_recovery") {
        return {
          ...meta,
          type,
          symptoms: clampText(row.symptoms, 600),
          manageable: clampText(row.manageable, 600),
          ...(row.energy === "low" ||
          row.energy === "okay" ||
          row.energy === "good"
            ? { energy: row.energy }
            : {}),
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

      if (type === "create_scheduled_check_in") {
        const title = clampText(row.title, 64);
        const prompt = clampText(row.prompt, 240);
        const timezone = clampText(row.timezone, 80);
        if (!title || !prompt || !timezone) return null;
        return {
          ...meta,
          type,
          ...(clampText(row.checkInId, 100)
            ? { checkInId: clampText(row.checkInId, 100) }
            : {}),
          title,
          prompt,
          cadence: "daily",
          hour: Math.round(clampNumber(row.hour, 0, 23, 9)),
          minute: Math.round(clampNumber(row.minute, 0, 59, 0)),
          timezone,
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
                  const macro = (field: string, max: number) =>
                    typeof meal[field] === "number"
                      ? Math.round(clampNumber(meal[field], 0, max, 0))
                      : undefined;
                  const calories = macro("calories", 5000);
                  const protein = macro("protein", 500);
                  const carbs = macro("carbs", 1000);
                  const fat = macro("fat", 400);
                  return {
                    label,
                    ...(clampText(meal.recipeId, 100)
                      ? { recipeId: clampText(meal.recipeId, 100) }
                      : {}),
                    ...(clampText(meal.note, 180)
                      ? { note: clampText(meal.note, 180) }
                      : {}),
                    ...(calories == null ? {} : { calories }),
                    ...(protein == null ? {} : { protein }),
                    ...(carbs == null ? {} : { carbs }),
                    ...(fat == null ? {} : { fat }),
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

      if (type === "save_progress_metric") {
        const title = clampText(row.title, 48);
        const description = clampText(row.description, 180);
        const tab = clampText(row.tab, 16);
        const kind = clampText(row.kind, 16);
        const accent = clampText(row.accent, 16);
        if (!title || !description) return null;
        return {
          ...meta,
          type,
          title,
          description,
          tab: tab === "body" || tab === "training" ? tab : "nutrition",
          kind: kind === "number" || kind === "toggle" ? kind : "counter",
          unit: clampText(row.unit, 16) || "count",
          step: clampNumber(row.step, 0.01, 10_000, 1),
          ...(typeof row.target === "number"
            ? { target: clampNumber(row.target, 0, 1_000_000, 0) }
            : {}),
          accent:
            accent === "water" || accent === "workout" || accent === "progress"
              ? accent
              : "food",
        };
      }

      if (type === "save_dashboard_widget") {
        const title = clampText(row.title, 48);
        const description = clampText(row.description, 140);
        const sourceMetricTitle = clampText(row.sourceMetricTitle, 48);
        const kind = clampText(row.kind, 16);
        const accent = clampText(row.accent, 16);
        const followUpKind = clampText(row.followUpKind, 16);
        if (!title || !description || !sourceMetricTitle) return null;
        return {
          ...meta,
          type,
          title,
          description,
          kind:
            kind === "counter" ||
            kind === "progress" ||
            kind === "sparkline" ||
            kind === "decay"
              ? kind
              : "stat",
          ...(clampText(row.sourceMetricId, 100)
            ? { sourceMetricId: clampText(row.sourceMetricId, 100) }
            : {}),
          sourceMetricTitle,
          unit: clampText(row.unit, 16) || "count",
          accent:
            accent === "water" || accent === "workout" || accent === "progress"
              ? accent
              : "food",
          ...(typeof row.target === "number"
            ? { target: clampNumber(row.target, 0, 1_000_000, 0) }
            : {}),
          ...(typeof row.windowDays === "number"
            ? { windowDays: clampInteger(row.windowDays, 2, 30, 7) }
            : {}),
          ...(typeof row.halfLifeHours === "number"
            ? {
                halfLifeHours: clampNumber(row.halfLifeHours, 1, 12, 5),
              }
            : {}),
          ...(clampText(row.parentWidgetId, 100)
            ? { parentWidgetId: clampText(row.parentWidgetId, 100) }
            : {}),
          ...(clampText(row.followUpTitle, 48)
            ? { followUpTitle: clampText(row.followUpTitle, 48) }
            : {}),
          ...(followUpKind === "stat" ||
          followUpKind === "counter" ||
          followUpKind === "progress" ||
          followUpKind === "sparkline" ||
          followUpKind === "decay"
            ? { followUpKind }
            : {}),
        };
      }

      if (type === "set_nutrition_targets") {
        const target = (field: (typeof NUTRITION_TARGET_FIELDS)[number]) => {
          const value = row[field];
          if (typeof value !== "number" || !Number.isFinite(value))
            return undefined;
          const [low, high] = NUTRITION_TARGET_RANGES[field];
          return Math.round(clampNumber(value, low, high, low));
        };
        const targets = {
          ...(target("calories") == null
            ? {}
            : { calories: target("calories") }),
          ...(target("protein") == null ? {} : { protein: target("protein") }),
          ...(target("carbs") == null ? {} : { carbs: target("carbs") }),
          ...(target("fat") == null ? {} : { fat: target("fat") }),
          ...(target("waterMl") == null ? {} : { waterMl: target("waterMl") }),
        };
        if (Object.keys(targets).length === 0) return null;
        return { ...meta, type, ...targets };
      }

      if (type === "save_supplement") {
        const name = clampText(row.name, 60);
        const servingLabel = clampText(row.servingLabel, 40);
        if (!name || !servingLabel) return null;
        const category = clampText(row.category, 24) as SupplementCategory;
        const form = clampText(row.form, 16) as SupplementForm;
        const rawSchedule = isRecord(row.schedule) ? row.schedule : {};
        const scheduleType = clampText(
          rawSchedule.type,
          16,
        ) as SupplementSchedule["type"];
        const weekdays = (
          Array.isArray(rawSchedule.weekdays) ? rawSchedule.weekdays : []
        )
          .filter(
            (day): day is number =>
              typeof day === "number" &&
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6,
          )
          .slice(0, 7);
        const rawNutrients = isRecord(row.nutrientsPerServing)
          ? row.nutrientsPerServing
          : {};
        const nutrientsPerServing: SupplementNutrients = {};
        for (const key of COACH_SUPPLEMENT_NUTRIENT_KEYS) {
          const value = rawNutrients[key];
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          nutrientsPerServing[key] = clampNumber(value, 0, 100_000, 0);
        }
        return {
          ...meta,
          type,
          ...(clampText(row.supplementId, 100)
            ? { supplementId: clampText(row.supplementId, 100) }
            : {}),
          name,
          ...(clampText(row.brand, 60)
            ? { brand: clampText(row.brand, 60) }
            : {}),
          category: COACH_SUPPLEMENT_CATEGORIES.includes(category)
            ? category
            : "other",
          form: COACH_SUPPLEMENT_FORMS.includes(form) ? form : "other",
          servingLabel,
          defaultServingQuantity: clampNumber(
            row.defaultServingQuantity,
            0.01,
            100,
            1,
          ),
          ...(clampText(row.notes, 280)
            ? { notes: clampText(row.notes, 280) }
            : {}),
          active: row.active !== false,
          schedule: {
            type: COACH_SUPPLEMENT_SCHEDULE_TYPES.includes(scheduleType)
              ? scheduleType
              : "none",
            ...(weekdays.length ? { weekdays } : {}),
            ...(/^\d{2}:\d{2}$/.test(String(rawSchedule.preferredTime ?? ""))
              ? { preferredTime: String(rawSchedule.preferredTime) }
              : {}),
          },
          nutrientsPerServing,
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
  const openui = isCasualCoachMessage(message)
    ? ""
    : normalizeCoachOpenUI(input.openui);
  const reply = clampText(input.reply, 280);
  if (!reply) return null;
  return {
    reply,
    openui,
    sleepMode: input.sleepMode === true,
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
  apiKey,
}: {
  subapp: MetricSubapp;
  prompt: string;
  catalog: MetricCatalogItem[];
  maxResults: number;
  apiKey: string | null;
}) {
  if (!hasOpenAiApiKey(apiKey)) return null;

  const allowedIds = new Set(catalog.map((metric) => metric.id));
  const content = await requestOpenAiJson({
    apiKey,
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

async function generateCoachAdviceWithOpenAi(
  context: CoachContext,
  apiKey: string | null,
) {
  if (!hasOpenAiApiKey(apiKey)) return null;
  const content = await requestOpenAiJson({
    apiKey,
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

/**
 * Workspace sections withheld per domain route. The chef has no business
 * paying for programming logs, and the trainer none for recipe cards; the
 * general route keeps everything and lets the size budget do its work.
 */
const DOMAIN_WITHHELD_SECTIONS = {
  nutrition: [
    "programming",
    "recovery",
    "formChecks",
    "recentWorkouts",
    "presets",
    "dashboardWidgets",
  ],
  training: [
    "recipes",
    "foodEntries",
    "water",
    "fasting",
    "supplements",
    "dashboardWidgets",
  ],
  progress: ["recipes", "presets", "dashboardWidgets"],
  general: [],
} as const;

function sliceWorkspaceForDomain(
  workspace: CoachWorkspace | undefined,
  domain: keyof typeof DOMAIN_WITHHELD_SECTIONS,
) {
  const sections: readonly string[] = DOMAIN_WITHHELD_SECTIONS[domain];
  if (!workspace || sections.length === 0) return workspace;
  const sliced: Record<string, unknown> = { ...workspace };
  const withheld: string[] = [];
  for (const key of sections) {
    if (key in sliced) {
      delete sliced[key];
      withheld.push(key);
    }
  }
  if (withheld.length === 0) return workspace;
  return {
    ...sliced,
    // Without this the model reads an absent section as an empty life —
    // "you haven't logged any food" to a user who logs every meal.
    withheldSections: {
      sections: withheld,
      note: "these sections exist but were left out as off-topic for this question; never claim the user lacks this data",
    },
  };
}

async function generateCoachChatWithOpenAi({
  context,
  message,
  coachMode,
  history,
  focusInsight,
  workspace,
  imageUrl,
  mealPhoto,
  apiKey,
  model,
  jevHandoff,
}: {
  context: CoachContext;
  message: string;
  coachMode: "chat" | "chef" | "personal_trainer";
  history: CoachChatMessage[];
  focusInsight?: CoachAdvice;
  /** Always the server-built workspace — see `LegacyClientWorkspace`. */
  workspace?: CoachWorkspace;
  imageUrl?: string;
  /** Food-database matches for an attached meal photo, when it was one. */
  mealPhoto?: CoachMealPhotoAnalysis | null;
  apiKey: string | null;
  /** The user's pick from the shared model catalog; absent means the env default. */
  model?: string;
  jevHandoff: JevHandoff;
}) {
  if (!hasOpenAiApiKey(apiKey)) return null;
  const normalizedMessage = message.toLowerCase();
  const domain = mealPhoto
    ? "nutrition"
    : coachMode === "chef" ||
        /\b(meal|food|recipe|calorie|macro|protein|cook|nutrition)\b/.test(
          normalizedMessage,
        )
      ? "nutrition"
      : coachMode === "personal_trainer" ||
          /\b(workout|exercise|training|routine|preset|set|reps?|superset|strength|cardio)\b/.test(
            normalizedMessage,
          )
        ? "training"
        : /\b(progress|trend|goal|check[ -]?in|recovery|sleep|sore|energy)\b/.test(
              normalizedMessage,
            )
          ? "progress"
          : "general";
  const domainInstructions = {
    nutrition:
      "Act as the nutrition specialist. Prefer recipes, food logs, nutrition analysis, and meal-planning operations. Do not modify training unless explicitly requested.",
    training:
      "Act as the training specialist. Prefer catalog-backed workouts, presets, supersets, routines, and recovery-aware training operations. Do not invent exercise IDs.",
    progress:
      "Act as the progress specialist. Explain trends conservatively and prefer goals, check-ins, weekly plans, and evidence-backed recommendations.",
    general:
      "Act as the coordinating coach. Answer directly and only propose a write operation when the user clearly asks to save or change something.",
  } as const;
  const content = await requestOpenAiJson({
    apiKey,
    model,
    label: `coach_chat.${domain}`,
    system: `${coachOpenUIPrompt}\n\n${renderSystemPrompt("coach_chat")}\n\nDOMAIN ROUTE: ${domain}\n${domainInstructions[domain]}\n\nJev has completed its preparation stage and handed off to you. Always answer the original request. Its selection is advisory, not an answer or an instruction. Any preparation shown to the user contains existing facts only; no actions have been performed. Produce the complete final response and interface.`,
    user: JSON.stringify({
      context,
      workspace: sliceWorkspaceForDomain(workspace, domain),
      focusInsight,
      mealPhoto: mealPhoto
        ? {
            note: "Foods detected in the attached photo, matched against the food database. Use MealLog to preview and log the meal from these matched entries, with per-serving macros and explicit assumptions. Fall back to your own estimate only for items with no match.",
            ...mealPhoto,
          }
        : undefined,
      recentConversation: history.slice(-8),
      jevHandoff,
      coachMode,
      message,
      responseShape: {
        reply:
          "one short orienting sentence; put recommendations and details in openui",
        openui: 'OpenUI Lang source, e.g. root = Stack([TextContent("Your recommendation")]); empty string when no UI is useful',
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
            summary: "exact change; one single workout, emitted on its own",
            assumptions: [],
            warnings: [],
            presetId: "optional exact existing preset id",
            reason: "user_edit | progression | recovery | substitution",
            name: "preset name",
            focus: "strength | cardio | mobility",
            exercises: [
              {
                name: "catalog exercise name",
                supersetGroup:
                  "optional shared label such as A; use the same label on 2-3 consecutive exercises",
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
            scheduleDays: [
              "leave empty for a one-off workout; add weekday names such as Mon only when the user asked it to recur",
            ],
          },
          {
            type: "create_workout_plan",
            confirmation: "auto | confirm",
            summary:
              "create and organize the complete workout plan; multi-day splits only",
            assumptions: ["explicit reasonable defaults"],
            warnings: [],
            presets: [
              {
                name: "distinct training-day preset name",
                focus: "strength | cardio | mobility",
                exercises: [
                  {
                    name: "catalog exercise name",
                    supersetGroup: "optional shared superset label",
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
            type: "start_recovery",
            confirmation: "auto | confirm",
            summary: "Start recovery mode today",
            assumptions: [
              "Defer training, quiet training reminders, simplify food, and leave recovery check-ins off.",
            ],
            warnings: [],
            symptoms: "optional symptoms the user reported",
            energy: "optional low | okay | good, only if reported",
            manageable: "optional activities the user says feel manageable",
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
            type: "create_scheduled_check_in",
            confirmation: "auto | confirm",
            summary: "recurring check-in being created or updated",
            assumptions: [],
            warnings: [],
            checkInId: "optional exact existing scheduled check-in id",
            title: "short check-in title",
            prompt: "what Coach should ask or remind the user to do",
            cadence: "daily",
            hour: 15,
            minute: 0,
            timezone: "IANA timezone from workspace",
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
                    calories: 520,
                    protein: 40,
                    carbs: 55,
                    fat: 14,
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
            type: "save_progress_metric",
            confirmation: "auto | confirm",
            summary: "custom tracker being added to Progress",
            assumptions: [],
            warnings: [],
            title: "short metric title",
            description: "one-sentence tracking purpose",
            tab: "body | nutrition | training",
            kind: "counter | number | toggle",
            unit: "short unit such as mg, hours, min, count",
            step: 50,
            target: 400,
            accent: "food | water | workout | progress",
          },
          {
            type: "save_dashboard_widget",
            confirmation: "auto | confirm",
            summary: "compact widget being created",
            assumptions: [],
            warnings: [],
            title: "short widget title",
            description: "one short context line",
            kind: "stat | counter | progress | sparkline | decay",
            sourceMetricId: "exact workspace progress metric id",
            sourceMetricTitle: "exact workspace progress metric title",
            unit: "short source unit",
            accent: "food | water | workout | progress",
            target: 400,
            windowDays: 7,
            halfLifeHours: 5,
            parentWidgetId: "optional exact existing dashboard widget id",
            followUpTitle: "optional useful compact follow-up",
            followUpKind: "stat | counter | progress | sparkline | decay",
          },
          {
            type: "save_supplement",
            confirmation: "auto | confirm",
            summary: "supplement being added to the catalog",
            assumptions: [],
            warnings: [],
            supplementId: "optional exact existing workspace supplement id",
            name: "product name without the brand",
            brand: "optional brand",
            category:
              "protein | creatine | multivitamin | vitamin_mineral | electrolyte | caffeine_pre_workout | omega_3 | fiber | other",
            form: "capsule | tablet | powder | liquid | gummy | softgel | other",
            servingLabel: "one serving such as 1 scoop (5 g) or 2 capsules",
            defaultServingQuantity: 1,
            notes: "optional short note",
            active: true,
            schedule: {
              type: "none | daily | weekdays | training_days | rest_days",
              weekdays: [1, 3, 5],
              preferredTime: "optional HH:mm",
            },
            nutrientsPerServing: {
              calories: 0,
              protein: 0,
              creatine: 5,
              caffeine: 0,
            },
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
            type: "set_nutrition_targets",
            confirmation: "auto | confirm",
            summary: "daily targets being set",
            assumptions: [],
            warnings: [],
            calories: 1800,
            protein: 130,
            carbs: 180,
            fat: 60,
            waterMl: 2400,
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
    // A week of meals with their macros, a batch recipe and a set of targets
    // is a large object, and 3200 cut it off mid-JSON — which surfaced as the
    // canned fallback card, the one failure that looks like a feature. This
    // is a ceiling, not a spend: short answers still cost what they cost.
    maxTokens: 8000,
  });
  const normalized = normalizeCoachChatResponse(JSON.parse(content), message);
  if (!normalized) {
    // The provider answered, but with nothing a user could read — an empty
    // reply, usually. Keep the evidence: without this line the only visible
    // symptom is the canned fallback text, which looks like a working feature
    // and is the hardest kind of broken to notice.
    console.warn("coach chat reply unusable", {
      model: model ?? "default",
      content: content.slice(0, 400),
    });
  }
  return normalized;
}

export const generateCustomProgressMetric = action({
  args: {
    tab: v.union(
      v.literal("body"),
      v.literal("nutrition"),
      v.literal("training"),
    ),
    request: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const request = args.request.trim().slice(0, 400);
    if (request.length < 3) throw new Error("Describe what you want to track.");
    const quota = await consumeAiUsageOrThrow(
      ctx,
      user._id,
      "progress_metrics",
    );

    const fallback = () => {
      const lower = request.toLowerCase();
      if (lower.includes("caffeine"))
        return {
          title: "Caffeine",
          description:
            "Track daily caffeine intake from coffee, tea, and supplements.",
          tab: "nutrition" as const,
          kind: "counter" as const,
          unit: "mg",
          step: 50,
          target: 400,
          accent: "food" as const,
        };
      if (lower.includes("sleep"))
        return {
          title: "Sleep",
          description: "Log nightly sleep duration and watch the recent trend.",
          tab: "body" as const,
          kind: "number" as const,
          unit: "hours",
          step: 0.5,
          target: 8,
          accent: "progress" as const,
        };
      return {
        title: request.slice(0, 36),
        description: `Track ${request.toLowerCase()} over time.`,
        tab: args.tab,
        kind: "counter" as const,
        unit: "count",
        step: 1,
        target: 1,
        accent:
          args.tab === "nutrition"
            ? ("food" as const)
            : args.tab === "training"
              ? ("workout" as const)
              : ("progress" as const),
      };
    };

    if (!hasOpenAiApiKey(quota.apiKey))
      return { ...fallback(), source: "fallback" as const };
    try {
      const content = await requestOpenAiJson({
        apiKey: quota.apiKey,
        system:
          "You design safe, simple fitness progress trackers. Return one JSON tracker definition. Use kind counter for increment buttons, number for decimal input, or toggle for yes/no. Never create diagnostic or medication dosing trackers.",
        user: JSON.stringify({
          requestedTab: args.tab,
          request,
          responseShape: {
            title: "short title",
            description: "one sentence",
            tab: "body | nutrition | training",
            kind: "counter | number | toggle",
            unit: "short unit",
            step: "positive number",
            target: "optional positive number or null",
            accent: "food | water | workout | progress",
          },
        }),
        temperature: 0.2,
        maxTokens: 400,
      });
      const raw = JSON.parse(content) as Record<string, unknown>;
      const kinds = new Set(["counter", "number", "toggle"]);
      const accents = new Set(["food", "water", "workout", "progress"]);
      const tabs = new Set(["body", "nutrition", "training"]);
      const generated = fallback();
      return {
        title: clampText(raw.title, 48) || generated.title,
        description: clampText(raw.description, 180) || generated.description,
        tab: tabs.has(String(raw.tab))
          ? (raw.tab as "body" | "nutrition" | "training")
          : args.tab,
        kind: kinds.has(String(raw.kind))
          ? (raw.kind as "counter" | "number" | "toggle")
          : generated.kind,
        unit: clampText(raw.unit, 16) || generated.unit,
        step:
          typeof raw.step === "number" && raw.step > 0
            ? Math.min(raw.step, 10_000)
            : generated.step,
        ...(typeof raw.target === "number" && raw.target >= 0
          ? { target: Math.min(raw.target, 1_000_000) }
          : {}),
        accent: accents.has(String(raw.accent))
          ? (raw.accent as "food" | "water" | "workout" | "progress")
          : generated.accent,
        source: "openai" as const,
      };
    } catch (error) {
      console.warn("Falling back to custom metric template", error);
      return { ...fallback(), source: "fallback" as const };
    }
  },
});

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

    const quota = await consumeAiUsageOrThrow(
      ctx,
      user._id,
      "progress_metrics",
    );

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
        apiKey: quota.apiKey,
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
  // Today's own numbers and the week strip. The client has always sent these;
  // the validator had not caught up, and Convex rejects extra fields outright,
  // so every coach chat and every advice call failed on the way in.
  weekDays: v.array(
    v.object({
      date: v.string(),
      label: v.string(),
      trained: v.boolean(),
      today: v.boolean(),
    }),
  ),
  todayProtein: v.number(),
  todayCalories: v.number(),
  lastWorkout: v.union(
    v.object({
      name: v.string(),
      date: v.string(),
      sets: v.number(),
    }),
    v.null(),
  ),
  hasAnyData: v.boolean(),
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
    weekDays: input.weekDays.slice(0, 14).map((day) => ({
      date: clampText(day.date, 10),
      label: clampText(day.label, 3),
      trained: day.trained === true,
      today: day.today === true,
    })),
    lastWorkout: input.lastWorkout
      ? {
          name: clampText(input.lastWorkout.name, 80),
          date: clampText(input.lastWorkout.date, 10),
          sets: clampInteger(input.lastWorkout.sets, 0, 999, 0),
        }
      : null,
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

    const quota = await consumeAiUsageOrThrow(
      ctx,
      user._id,
      "progress_metrics",
    );

    try {
      const advice = await generateCoachAdviceWithOpenAi(context, quota.apiKey);
      if (advice) return { advice, source: "openai" };
    } catch (error) {
      console.warn("Falling back to server coach advice", error);
    }

    return { advice: fallbackCoachAdvice(context), source: "fallback" };
  },
});

export const generateCoachChatMessage = action({
  args: {
    requestId: v.optional(v.string()),
    context: coachContextValidator,
    message: v.string(),
    coachMode: v.optional(
      v.union(
        v.literal("chat"),
        v.literal("chef"),
        v.literal("personal_trainer"),
      ),
    ),
    attachmentId: v.optional(v.id("fileUploads")),
    today: v.optional(v.string()),
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
    /** The chat's model picker choice, an id from the shared catalog. */
    model: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CoachChatResult> => {
    const user = await getAuthUser(ctx);
    if (args.requestId !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(args.requestId)) {
      throw new Error("Invalid Coach request identifier.");
    }
    // Checked before the credit spend: a made-up model id is a client bug,
    // not a reason to charge the user a credit finding out.
    if (args.model !== undefined) assertCatalogModel(args.model);
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
      clampText(args.message, COACH_MAX_MESSAGE_CHARS) ||
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
    const today =
      normalizeDate(args.today ?? args.workspace?.today ?? "") ??
      new Date().toISOString().slice(0, 10);
    const workspace = await ctx.runQuery(
      internal.ai.coachWorkspace.loadForModel,
      { userId: user._id, today },
    );
    // The client-built workspace arg is accepted for old app versions but
    // never read: the server-built workspace above is the only one the model
    // sees, and has been since the migration.
    if (args.workspace && normalizeDate(args.workspace.today) !== today) {
      console.warn("Ignoring stale client Coach workspace", {
        clientToday: args.workspace.today,
        serverToday: today,
      });
    }

    const quota = await consumeAiUsageOrThrow(
      ctx,
      user._id,
      "progress_metrics",
    );

    // All accepted coach requests pass through Jev exactly once, before any
    // image analysis or Luna attempt. Empty/error exits still hand off.
    const jevHandoff = await prepareWithJev({
      message, history, coachMode, hasAttachment: Boolean(attachment),
      candidates: coachPreparationCandidates(workspace),
    });
    if (args.requestId) {
      try {
        await ctx.runMutation(internal.ai.coachPreparations.publish, {
          userId: user._id, requestId: args.requestId, handoff: jevHandoff,
        });
      } catch {
        // Losing the optional preview must not prevent the full answer.
        console.warn("Coach preparation could not be published");
      }
    }

    // A photo of food should get database-matched macros, not a guess. This
    // rides the snap pipeline; if the image isn't food (or anything in the
    // pipeline fails), the coach just answers with the image alone as before.
    let mealPhoto: CoachMealPhotoAnalysis | null = null;
    if (attachment?.mimeType.startsWith("image/")) {
      try {
        mealPhoto = await analyzeMealPhotoForCoach(ctx, {
          imageUrl: attachment.url,
          apiKey: quota.apiKey,
        });
      } catch (error) {
        console.warn("Coach meal photo analysis failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // The picked model first; the deployment default as the understudy. A
    // catalog model that errors or answers unusably should degrade to a real
    // model's answer, not to the canned templates below — those are a last
    // resort for "no provider at all", not a personality.
    const defaultModel = defaultOpenRouterModel();
    const modelAttempts = [...new Set([args.model ?? defaultModel, defaultModel])];
    let providerFailure: AiProviderError | undefined;
    for (const model of modelAttempts) {
      try {
        const response = await generateCoachChatWithOpenAi({
          context,
          message,
          coachMode,
          history,
          focusInsight,
          workspace,
          imageUrl: attachment?.url,
          mealPhoto,
          apiKey: quota.apiKey,
          model,
          jevHandoff,
        });
        if (response) return { ...response, source: "openai" };
      } catch (error) {
        if (error instanceof AiProviderError) providerFailure = error;
        console.warn("Coach model attempt failed", {
          model: model ?? "default",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // A failed chat request is not an answer. In particular, do not turn
    // template advice into recommendation cards or executable operations.
    // Rejecting also lets the client retain the prompt for its retry control.
    // And because the credit was spent up front, a request that produces no
    // answer is refunded — otherwise provider outages would silently drain
    // the monthly allowance with nothing to show for it.
    await refundAiUsage(ctx, user._id, "progress_metrics");
    if (providerFailure?.status === 429) throw new ConvexError("The AI provider is temporarily rate-limiting this model. Please wait a moment and try again, or choose another model. Your message is saved for retry.");
    if (providerFailure?.status === 402) throw new ConvexError("The AI provider has insufficient credits. Check your AI billing or API key settings, then try again.");
    throw new ConvexError(
      "Coach couldn’t answer your message right now. Please try again in a moment.",
    );
  },
});
