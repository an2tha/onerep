import type {
  SupplementCategory,
  SupplementForm,
  SupplementNutrients,
  SupplementSchedule,
} from "./supplements";

/** Longest question a user may send Coach in one message. */
export const COACH_MAX_MESSAGE_WORDS = 2_000;

/**
 * Words alone do not bound the payload, since a single "word" can be
 * arbitrarily long. This ceiling is generous headroom over 2,000 ordinary
 * words and exists only to stop a pathological paste reaching the model.
 */
export const COACH_MAX_MESSAGE_CHARS = 24_000;

/** Whitespace-delimited word count, matching what the composer counter shows. */
export function countCoachMessageWords(value: string): number {
  return value.trim().match(/\S+/g)?.length ?? 0;
}

export const COACH_SUPPLEMENT_CATEGORIES: readonly SupplementCategory[] = [
  "protein",
  "creatine",
  "multivitamin",
  "vitamin_mineral",
  "electrolyte",
  "caffeine_pre_workout",
  "omega_3",
  "fiber",
  "other",
];

export const COACH_SUPPLEMENT_FORMS: readonly SupplementForm[] = [
  "capsule",
  "tablet",
  "powder",
  "liquid",
  "gummy",
  "softgel",
  "other",
];

export const COACH_SUPPLEMENT_SCHEDULE_TYPES: readonly SupplementSchedule["type"][] =
  ["none", "daily", "weekdays", "training_days", "rest_days"];

export const COACH_SUPPLEMENT_NUTRIENT_KEYS: readonly (keyof SupplementNutrients)[] =
  [
    "calories",
    "protein",
    "carbs",
    "fat",
    "fiber",
    "sugar",
    "saturatedFat",
    "transFat",
    "cholesterol",
    "sodium",
    "potassium",
    "calcium",
    "iron",
    "magnesium",
    "phosphorus",
    "zinc",
    "vitaminA",
    "vitaminC",
    "vitaminD",
    "vitaminB12",
    "caffeine",
    "alcohol",
    "creatine",
    "omega3",
    "epa",
    "dha",
  ];

export const COACH_DAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
export type CoachDay = (typeof COACH_DAYS)[number];

export type CoachOperationMeta = {
  confirmation: "auto" | "confirm";
  summary: string;
  assumptions: string[];
  warnings: string[];
};

export type CoachRecipeIngredient = {
  id?: string;
  name: string;
  grams: number;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
};

export type CoachGoalTaskDraft = {
  title: string;
  detail?: string;
  completed?: boolean;
};

export type CoachWorkoutPresetDraft = {
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
  scheduleDays: CoachDay[];
};

export type CoachOperation = CoachOperationMeta &
  (
    | ({ type: "create_workout_preset" } & CoachWorkoutPresetDraft)
    | {
        type: "create_workout_plan";
        presets: CoachWorkoutPresetDraft[];
        assignments: Array<{ day: CoachDay; presetName: string | null }>;
      }
    | {
        type: "update_routine";
        assignments: Array<{ day: CoachDay; presetName: string | null }>;
      }
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
    | { type: "delete_nutrition"; entryId: string; date: string; name: string }
    | { type: "remember"; key: string; category: string; value: string }
    | { type: "forget_memory"; key: string; value: string }
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
    | { type: "undo_action"; actionId: string; actionSummary: string }
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function normalizeCoachOperations(value: unknown): CoachOperation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((operation): operation is CoachOperation => {
    if (!isRecord(operation) || typeof operation.type !== "string")
      return false;
    const row = operation;
    if (
      typeof row.summary !== "string" ||
      !Array.isArray(row.assumptions) ||
      !Array.isArray(row.warnings)
    )
      return false;
    if (row.confirmation !== "auto" && row.confirmation !== "confirm")
      return false;
    switch (row.type) {
      case "save_recipe":
        return typeof row.name === "string" && Array.isArray(row.ingredients);
      case "log_nutrition":
        return typeof row.name === "string";
      case "delete_nutrition":
        return typeof row.entryId === "string" && typeof row.date === "string";
      case "create_workout_preset":
        return typeof row.name === "string" && Array.isArray(row.exercises);
      case "create_workout_plan":
        return (
          Array.isArray(row.presets) &&
          row.presets.length > 0 &&
          Array.isArray(row.assignments)
        );
      case "update_routine":
        return Array.isArray(row.assignments);
      case "remember":
        return typeof row.key === "string" && typeof row.value === "string";
      case "forget_memory":
        return typeof row.key === "string";
      case "save_check_in":
        return typeof row.date === "string";
      case "save_weekly_plan":
        return typeof row.weekStart === "string" && Array.isArray(row.days);
      case "save_goal":
        return (
          typeof row.title === "string" &&
          typeof row.startDate === "string" &&
          Array.isArray(row.tasks) &&
          row.tasks.length > 0
        );
      case "save_progress_metric":
        return (
          typeof row.title === "string" &&
          typeof row.tab === "string" &&
          typeof row.kind === "string" &&
          typeof row.step === "number"
        );
      case "save_dashboard_widget":
        return (
          typeof row.title === "string" &&
          typeof row.kind === "string" &&
          typeof row.sourceMetricTitle === "string"
        );
      case "save_supplement":
        return (
          typeof row.name === "string" &&
          typeof row.servingLabel === "string" &&
          typeof row.defaultServingQuantity === "number" &&
          isRecord(row.schedule) &&
          isRecord(row.nutrientsPerServing)
        );
      case "undo_action":
        return typeof row.actionId === "string";
      default:
        return false;
    }
  });
}

export function validateCoachOperations(
  operations: CoachOperation[],
): string[] {
  const errors: string[] = [];
  for (const operation of operations) {
    if (operation.type === "save_recipe") {
      if (!operation.ingredients.length)
        errors.push(`${operation.name} has no ingredients.`);
      if (
        operation.ingredients.some(
          (item) =>
            item.grams <= 0 ||
            item.caloriesPer100 < 0 ||
            item.proteinPer100 < 0 ||
            item.carbsPer100 < 0 ||
            item.fatPer100 < 0,
        )
      )
        errors.push(`${operation.name} has invalid nutrition estimates.`);
    }
    if (
      operation.type === "save_goal" &&
      (operation.durationDays < 1 || operation.durationDays > 365)
    )
      errors.push(`${operation.title} has an invalid duration.`);
    if (operation.type === "save_progress_metric") {
      if (operation.step <= 0 || operation.step > 10_000)
        errors.push(`${operation.title} has an invalid increment.`);
      if (
        operation.target != null &&
        (operation.target < 0 || operation.target > 1_000_000)
      )
        errors.push(`${operation.title} has an invalid target.`);
    }
    if (operation.type === "save_dashboard_widget") {
      if (
        operation.windowDays != null &&
        (operation.windowDays < 2 || operation.windowDays > 30)
      )
        errors.push(`${operation.title} has an invalid history window.`);
      if (
        operation.halfLifeHours != null &&
        (operation.halfLifeHours < 1 || operation.halfLifeHours > 12)
      )
        errors.push(`${operation.title} has an invalid half-life.`);
    }
    if (operation.type === "create_workout_preset") {
      const names = operation.exercises.map((item) =>
        item.name.trim().toLowerCase(),
      );
      if (new Set(names).size !== names.length)
        errors.push(`${operation.name} repeats an exercise.`);
      if (
        operation.exercises.reduce((sum, item) => sum + item.sets.length, 0) >
        40
      )
        errors.push(`${operation.name} exceeds a practical 40-set session.`);
      const groups = new Map<string, number>();
      for (const item of operation.exercises)
        if (item.supersetGroup)
          groups.set(
            item.supersetGroup,
            (groups.get(item.supersetGroup) ?? 0) + 1,
          );
      for (const [group, count] of groups)
        if (count < 2 || count > 3)
          errors.push(
            `${operation.name} superset ${group} must contain 2 or 3 exercises.`,
          );
    }
    if (operation.type === "save_supplement") {
      if (!operation.name.trim()) errors.push("The supplement needs a name.");
      if (!operation.servingLabel.trim())
        errors.push(`${operation.name} needs a serving size.`);
      if (
        !(operation.defaultServingQuantity > 0) ||
        operation.defaultServingQuantity > 100
      )
        errors.push(`${operation.name} has an invalid serving quantity.`);
      if (!COACH_SUPPLEMENT_CATEGORIES.includes(operation.category))
        errors.push(`${operation.name} has an unsupported category.`);
      if (!COACH_SUPPLEMENT_FORMS.includes(operation.form))
        errors.push(`${operation.name} has an unsupported form.`);
      if (!COACH_SUPPLEMENT_SCHEDULE_TYPES.includes(operation.schedule.type))
        errors.push(`${operation.name} has an unsupported schedule.`);
      if (
        Object.entries(operation.nutrientsPerServing).some(
          ([key, value]) =>
            !COACH_SUPPLEMENT_NUTRIENT_KEYS.includes(
              key as keyof SupplementNutrients,
            ) ||
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0,
        )
      )
        errors.push(`${operation.name} has invalid per-serving nutrients.`);
    }
    if (operation.type === "update_routine") {
      const days = operation.assignments.map((item) => item.day);
      if (new Set(days).size !== days.length)
        errors.push("The routine proposal changes the same day twice.");
    }
  }
  return errors;
}
