import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUser } from "../lib/auth";
import {
  assertCatalogModel,
  hasOpenAiApiKey,
  requestOpenAiJson,
} from "./provider";
import { renderSystemPrompt } from "./prompts.generated";
import { consumeAiUsageOrThrow } from "./usage";
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
  | "open_supplements"
  | "log_food";

type CoachGoalTaskDraft = {
  title: string;
  detail?: string;
  completed?: boolean;
};

type CoachInteractiveElement =
  | { type: "text"; text: string; emphasis?: "quiet" | "strong" }
  | { type: "section"; title: string; detail?: string }
  | { type: "divider"; label?: string }
  | {
      type: "key_value";
      items: Array<{ label: string; value: string; detail?: string }>;
    }
  | {
      type: "progress";
      label: string;
      value: number;
      max: number;
      unit?: string;
      detail?: string;
    }
  | {
      type: "list";
      style: "bullet" | "number" | "timeline";
      items: Array<{ title: string; detail?: string }>;
    }
  | {
      type: "metric_group";
      metrics: Array<{
        label: string;
        value: number;
        unit?: string;
        detail?: string;
        scaleWith?: string;
      }>;
    }
  | {
      type: "stepper";
      id: string;
      label: string;
      value: number;
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | {
      type: "range";
      id: string;
      label: string;
      value: number;
      min: number;
      max: number;
      step: number;
      unit?: string;
      lowLabel?: string;
      highLabel?: string;
    }
  | {
      type: "choice";
      id: string;
      label: string;
      value: string;
      options: string[];
    }
  | {
      type: "rating";
      id: string;
      label: string;
      value: number;
      max: number;
      lowLabel?: string;
      highLabel?: string;
    }
  | {
      type: "toggle";
      id: string;
      label: string;
      detail?: string;
      value: boolean;
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
    }
  | {
      type: "interactive_card";
      label: string;
      title: string;
      detail?: string;
      accent: "nutrition" | "training" | "progress" | "neutral";
      elements: CoachInteractiveElement[];
      submit?: {
        type: "log_nutrition";
        label: string;
        name: string;
        meal: string;
        date?: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        quantityControlId?: string;
        baseQuantity?: number;
        mealControlId?: string;
        assumptions: string[];
      };
      actions?: Array<{ label: string; action: CoachUiAction }>;
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

function normalizeInteractiveElements(
  value: unknown,
): CoachInteractiveElement[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CoachInteractiveElement | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const type = clampText(row.type, 20);
      if (type === "text") {
        const text = clampText(row.text, 220);
        if (!text) return null;
        return {
          type,
          text,
          ...(row.emphasis === "strong" || row.emphasis === "quiet"
            ? { emphasis: row.emphasis }
            : {}),
        };
      }
      if (type === "section") {
        const title = clampText(row.title, 64);
        if (!title) return null;
        return {
          type,
          title,
          ...(clampText(row.detail, 140)
            ? { detail: clampText(row.detail, 140) }
            : {}),
        };
      }
      if (type === "divider") {
        return {
          type,
          ...(clampText(row.label, 32)
            ? { label: clampText(row.label, 32) }
            : {}),
        };
      }
      if (type === "key_value") {
        const items = (Array.isArray(row.items) ? row.items : [])
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const pair = item as Record<string, unknown>;
            const label = clampText(pair.label, 36);
            const pairValue = clampText(pair.value, 48);
            if (!label || !pairValue) return null;
            return {
              label,
              value: pairValue,
              ...(clampText(pair.detail, 64)
                ? { detail: clampText(pair.detail, 64) }
                : {}),
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 6);
        return items.length > 0 ? { type, items } : null;
      }
      if (type === "progress") {
        const label = clampText(row.label, 48);
        if (!label) return null;
        const max = clampNumber(row.max, 0.01, 1_000_000, 100);
        return {
          type,
          label,
          value: clampNumber(row.value, 0, max),
          max,
          ...(clampText(row.unit, 12) ? { unit: clampText(row.unit, 12) } : {}),
          ...(clampText(row.detail, 100)
            ? { detail: clampText(row.detail, 100) }
            : {}),
        };
      }
      if (type === "list") {
        const items = (Array.isArray(row.items) ? row.items : [])
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const listItem = item as Record<string, unknown>;
            const title = clampText(listItem.title, 72);
            if (!title) return null;
            return {
              title,
              ...(clampText(listItem.detail, 120)
                ? { detail: clampText(listItem.detail, 120) }
                : {}),
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 8);
        if (items.length === 0) return null;
        return {
          type,
          style:
            row.style === "number" || row.style === "timeline"
              ? row.style
              : "bullet",
          items,
        };
      }
      if (type === "metric_group") {
        const metrics = (Array.isArray(row.metrics) ? row.metrics : [])
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const metric = item as Record<string, unknown>;
            const label = clampText(metric.label, 32);
            if (!label) return null;
            return {
              label,
              value: clampNumber(metric.value, 0, 100_000),
              ...(clampText(metric.unit, 12)
                ? { unit: clampText(metric.unit, 12) }
                : {}),
              ...(clampText(metric.detail, 48)
                ? { detail: clampText(metric.detail, 48) }
                : {}),
              ...(clampText(metric.scaleWith, 32)
                ? { scaleWith: clampText(metric.scaleWith, 32) }
                : {}),
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 4);
        return metrics.length > 0 ? { type, metrics } : null;
      }
      if (type === "stepper") {
        const id = clampText(row.id, 32);
        const label = clampText(row.label, 48);
        if (!id || !label) return null;
        const min = clampNumber(row.min, 0, 100_000);
        const max = clampNumber(row.max, min, 100_000, Math.max(min, 10));
        return {
          type,
          id,
          label,
          value: clampNumber(row.value, min, max, min),
          min,
          max,
          step: clampNumber(row.step, 0.01, Math.max(0.01, max - min), 1),
          ...(clampText(row.unit, 12) ? { unit: clampText(row.unit, 12) } : {}),
        };
      }
      if (type === "range") {
        const id = clampText(row.id, 32);
        const label = clampText(row.label, 48);
        if (!id || !label) return null;
        const min = clampNumber(row.min, 0, 100_000);
        const max = clampNumber(row.max, min, 100_000, Math.max(min, 10));
        return {
          type,
          id,
          label,
          value: clampNumber(row.value, min, max, min),
          min,
          max,
          step: clampNumber(row.step, 0.01, Math.max(0.01, max - min), 1),
          ...(clampText(row.unit, 12) ? { unit: clampText(row.unit, 12) } : {}),
          ...(clampText(row.lowLabel, 24)
            ? { lowLabel: clampText(row.lowLabel, 24) }
            : {}),
          ...(clampText(row.highLabel, 24)
            ? { highLabel: clampText(row.highLabel, 24) }
            : {}),
        };
      }
      if (type === "choice") {
        const id = clampText(row.id, 32);
        const label = clampText(row.label, 48);
        const options = (Array.isArray(row.options) ? row.options : [])
          .map((option) => clampText(option, 32))
          .filter(Boolean)
          .slice(0, 6);
        if (!id || !label || options.length === 0) return null;
        const requestedValue = clampText(row.value, 32);
        return {
          type,
          id,
          label,
          value: options.includes(requestedValue) ? requestedValue : options[0],
          options,
        };
      }
      if (type === "rating") {
        const id = clampText(row.id, 32);
        const label = clampText(row.label, 48);
        const max = clampInteger(row.max, 2, 10, 5);
        if (!id || !label) return null;
        return {
          type,
          id,
          label,
          value: clampInteger(row.value, 1, max, 3),
          max,
          ...(clampText(row.lowLabel, 24)
            ? { lowLabel: clampText(row.lowLabel, 24) }
            : {}),
          ...(clampText(row.highLabel, 24)
            ? { highLabel: clampText(row.highLabel, 24) }
            : {}),
        };
      }
      if (type === "toggle") {
        const id = clampText(row.id, 32);
        const label = clampText(row.label, 64);
        if (!id || !label) return null;
        return {
          type,
          id,
          label,
          value: row.value === true,
          ...(clampText(row.detail, 100)
            ? { detail: clampText(row.detail, 100) }
            : {}),
        };
      }
      return null;
    })
    .filter((item): item is CoachInteractiveElement => Boolean(item))
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

      if (type === "interactive_card") {
        const label = clampText(row.label, 28);
        const title = clampText(row.title, 72);
        const detail = clampText(row.detail, 180);
        const elements = normalizeInteractiveElements(row.elements);
        const accent =
          row.accent === "training" ||
          row.accent === "progress" ||
          row.accent === "neutral"
            ? row.accent
            : "nutrition";
        if (!label || !title || elements.length === 0) return null;

        let submit: Extract<
          CoachUiBlock,
          { type: "interactive_card" }
        >["submit"];
        if (row.submit && typeof row.submit === "object") {
          const rawSubmit = row.submit as Record<string, unknown>;
          const submitLabel = clampText(rawSubmit.label, 32);
          const name = clampText(rawSubmit.name, 80);
          if (rawSubmit.type === "log_nutrition" && submitLabel && name) {
            submit = {
              type: "log_nutrition",
              label: submitLabel,
              name,
              meal: clampText(rawSubmit.meal, 32) || "Meal",
              ...(normalizeDate(rawSubmit.date)
                ? { date: normalizeDate(rawSubmit.date) }
                : {}),
              calories: clampNumber(rawSubmit.calories, 0, 10_000),
              protein: clampNumber(rawSubmit.protein, 0, 1_000),
              carbs: clampNumber(rawSubmit.carbs, 0, 2_000),
              fat: clampNumber(rawSubmit.fat, 0, 1_000),
              ...(clampText(rawSubmit.quantityControlId, 32)
                ? {
                    quantityControlId: clampText(
                      rawSubmit.quantityControlId,
                      32,
                    ),
                  }
                : {}),
              ...(typeof rawSubmit.baseQuantity === "number"
                ? {
                    baseQuantity: clampNumber(
                      rawSubmit.baseQuantity,
                      0.01,
                      100_000,
                      1,
                    ),
                  }
                : {}),
              ...(clampText(rawSubmit.mealControlId, 32)
                ? { mealControlId: clampText(rawSubmit.mealControlId, 32) }
                : {}),
              assumptions: (Array.isArray(rawSubmit.assumptions)
                ? rawSubmit.assumptions
                : []
              )
                .map((item) => clampText(item, 120))
                .filter(Boolean)
                .slice(0, 3),
            };
          }
        }

        const allowedActions = new Set<CoachUiAction>([
          "open_nutrition",
          "open_workouts",
          "open_progress",
          "open_settings",
          "open_workout_builder",
          "open_recipe_builder",
          "open_supplements",
          "log_food",
        ]);
        const actions = (Array.isArray(row.actions) ? row.actions : [])
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const action = item as Record<string, unknown>;
            const actionName = clampText(action.action, 32) as CoachUiAction;
            const actionLabel = clampText(action.label, 32);
            return actionLabel && allowedActions.has(actionName)
              ? { label: actionLabel, action: actionName }
              : null;
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 2);

        return {
          type,
          label,
          title,
          ...(detail ? { detail } : {}),
          accent,
          elements,
          ...(submit ? { submit } : {}),
          ...(actions.length > 0 ? { actions } : {}),
        };
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
          "open_supplements",
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
    .slice(0, 3);
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
  const uiBlocks = isCasualCoachMessage(message)
    ? []
    : normalizeCoachUiBlocks(input.uiBlocks);
  let reply = clampText(input.reply, 280);
  if (!reply) {
    // Some catalog models put the whole answer in blocks and never write the
    // orienting sentence the shape asks for. Blocks alone are still an answer;
    // borrow the first block's own words rather than discarding the turn.
    const first = uiBlocks[0] as
      { title?: string; detail?: string; label?: string } | undefined;
    reply = clampText(first?.title || first?.detail || first?.label, 280);
  }
  if (!reply) return null;
  return {
    reply,
    uiBlocks,
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

/** Like clampText, but never mid-word: "…within the heal" reads as a bug. */
function clampWords(value: string, max: number) {
  const text = clampText(value, max);
  if (text.length < max) return text;
  const cut = text.slice(0, text.lastIndexOf(" "));
  return `${(cut || text).replace(/[,;:]$/, "")}…`;
}

function makeFallbackUiFirst(
  response: Pick<CoachChatResult, "reply" | "uiBlocks" | "operations">,
  message: string,
): Pick<CoachChatResult, "reply" | "uiBlocks" | "operations"> {
  if (isCasualCoachMessage(message)) return response;
  if (response.uiBlocks.length > 0) {
    return {
      ...response,
      reply: "Here’s the clearest view from your recent data.",
      uiBlocks: response.uiBlocks.slice(0, 3),
    };
  }
  return {
    ...response,
    reply: "Here’s the most useful next step.",
    uiBlocks: [
      {
        type: "card",
        label: "Coach recommendation",
        title: "What to do next",
        detail: clampWords(response.reply, 280),
      },
    ],
  };
}

function fallbackCoachChatResponse({
  message,
  context,
  focusInsight,
  coachMode = "chat",
  history = [],
}: {
  message: string;
  context: CoachContext;
  focusInsight?: CoachAdvice;
  coachMode?: "chat" | "chef" | "personal_trainer";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Pick<CoachChatResult, "reply" | "uiBlocks" | "operations"> {
  const uiBlocks = shouldUseFallbackUi(message)
    ? fallbackCoachUiBlocks(context)
    : [];
  const normalizedMessage = message.toLowerCase();
  const recentText = history
    .slice(-4)
    .map((item) => item.content)
    .join(" ")
    .toLowerCase();
  if (
    normalizedMessage.includes("widget") &&
    /\b(?:implement|add|create|make)\b/.test(normalizedMessage) &&
    (normalizedMessage.includes("caffeine") || recentText.includes("caffeine"))
  ) {
    const decay = /\b(?:decay|half-life|remaining)\b/.test(normalizedMessage);
    const parentWidgetId = message.match(
      /dashboard widget ([a-z0-9_-]+)/i,
    )?.[1];
    return {
      reply: decay
        ? "I’ll create a compact estimated caffeine decay widget."
        : "I’ll create a compact caffeine dashboard widget.",
      uiBlocks: [],
      operations: [
        {
          type: "save_dashboard_widget",
          confirmation: "auto",
          summary: decay
            ? "Create an estimated caffeine decay widget"
            : "Create a compact caffeine total widget",
          assumptions: decay
            ? ["Uses a general five-hour caffeine half-life estimate."]
            : [],
          warnings: [],
          title: decay ? "Estimated caffeine decay" : "Caffeine today",
          description: decay
            ? "Estimated caffeine remaining over the next 12 hours."
            : "Today’s logged caffeine total.",
          kind: decay ? "decay" : "counter",
          sourceMetricTitle: "Caffeine",
          unit: "mg",
          accent: "food",
          target: 400,
          ...(decay ? { halfLifeHours: 5, windowDays: 7 } : {}),
          ...(parentWidgetId ? { parentWidgetId } : {}),
          ...(!decay
            ? {
                followUpTitle: "Estimated caffeine decay",
                followUpKind: "decay" as const,
              }
            : {}),
        },
      ],
    };
  }
  if (
    /\b(?:implement|add|create|track|set up)\b/.test(normalizedMessage) &&
    (normalizedMessage.includes("caffeine") || recentText.includes("caffeine"))
  ) {
    return {
      reply: "I’ll add the caffeine tracker to Nutrition Progress.",
      uiBlocks: [],
      operations: [
        {
          type: "save_progress_metric",
          confirmation: "auto",
          summary: "Add a daily caffeine tracker to Nutrition Progress",
          assumptions: ["Caffeine is logged as a daily milligram total."],
          warnings: [],
          title: "Caffeine",
          description:
            "Track daily caffeine intake from coffee, tea, energy drinks, and supplements.",
          tab: "nutrition",
          kind: "counter",
          unit: "mg",
          step: 50,
          target: 400,
          accent: "food",
        },
      ],
    };
  }
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
    system: `${renderSystemPrompt("coach_chat")}\n\nDOMAIN ROUTE: ${domain}\n${domainInstructions[domain]}`,
    user: JSON.stringify({
      context,
      workspace: sliceWorkspaceForDomain(workspace, domain),
      focusInsight,
      mealPhoto: mealPhoto
        ? {
            note: "Foods detected in the attached photo, matched against the food database. Build an interactive_card to log the meal from these matched entries — use their macros as the base, scale by the estimated quantity with a quantity stepper, and state assumptions. Fall back to your own estimate only for items with no match.",
            ...mealPhoto,
          }
        : undefined,
      recentConversation: history.slice(-8),
      coachMode,
      message,
      responseShape: {
        reply:
          "one short orienting sentence; put recommendations and details in uiBlocks",
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
            type: "interactive_card",
            label: "short context label",
            title: "custom card title",
            detail: "optional concise orientation",
            accent: "nutrition | training | progress | neutral",
            elements: [
              {
                type: "section",
                title: "section heading",
                detail: "optional section context",
              },
              { type: "divider", label: "optional divider label" },
              {
                type: "key_value",
                items: [
                  {
                    label: "compact fact",
                    value: "display value",
                    detail: "optional context",
                  },
                ],
              },
              {
                type: "progress",
                label: "bounded progress",
                value: 3,
                max: 5,
                unit: "sessions",
                detail: "optional context",
              },
              {
                type: "list",
                style: "bullet | number | timeline",
                items: [{ title: "list item", detail: "optional item detail" }],
              },
              {
                type: "metric_group",
                metrics: [
                  {
                    label: "Calories",
                    value: 520,
                    unit: "kcal",
                    detail: "estimate",
                    scaleWith: "quantity",
                  },
                ],
              },
              {
                type: "stepper",
                id: "quantity",
                label: "Serving size",
                value: 1,
                min: 0.25,
                max: 6,
                step: 0.25,
                unit: "servings",
              },
              {
                type: "range",
                id: "intensity",
                label: "Intensity",
                value: 5,
                min: 1,
                max: 10,
                step: 1,
                unit: "RPE",
                lowLabel: "Easy",
                highLabel: "Hard",
              },
              {
                type: "choice",
                id: "meal",
                label: "Add to",
                value: "Lunch",
                options: ["Breakfast", "Lunch", "Dinner", "Snack"],
              },
              {
                type: "rating",
                id: "readiness",
                label: "Readiness",
                value: 3,
                max: 5,
                lowLabel: "Low",
                highLabel: "High",
              },
              {
                type: "toggle",
                id: "optional-control",
                label: "Custom boolean choice",
                detail: "only include when useful",
                value: false,
              },
              {
                type: "text",
                text: "Optional custom note inside the card",
                emphasis: "quiet | strong",
              },
            ],
            submit: {
              type: "log_nutrition",
              label: "Log meal",
              name: "meal name",
              meal: "Lunch",
              date: "optional YYYY-MM-DD",
              calories: 520,
              protein: 35,
              carbs: 58,
              fat: 16,
              quantityControlId: "quantity",
              baseQuantity: 1,
              mealControlId: "meal",
              assumptions: ["brief estimate assumption"],
            },
            actions: [{ label: "optional link", action: "open_nutrition" }],
          },
          {
            type: "action_row",
            title: "short title",
            actions: [
              {
                label: "button label",
                action:
                  "open_nutrition | open_workouts | open_progress | open_settings | open_workout_builder | open_recipe_builder | open_supplements | log_food",
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
    const modelAttempts: Array<string | undefined> = args.model
      ? [args.model, undefined]
      : [undefined];
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
        });
        if (response) return { ...response, source: "openai" };
      } catch (error) {
        console.warn("Falling back to server coach chat", {
          model: model ?? "default",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const fallback = makeFallbackUiFirst(
      fallbackCoachChatResponse({
        message,
        context,
        focusInsight,
        coachMode,
        history,
      }),
      message,
    );
    return {
      ...fallback,
      artifacts: [],
      source: "fallback",
    };
  },
});
