import type { Doc } from "../_generated/dataModel";

type MacroTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type GoalSource = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  saturatedFatLimit?: number;
  sodiumLimit?: number;
  calorieStrategy?: string;
  safetyMode?: string;
  trackingMode?: string;
  guidance?: string[];
  source: "healthProfile" | "onboarding";
} | null;

type FoodLogDay = Pick<Doc<"foodLogs">, "date" | "entries">;
type BodyMeasurement = Pick<Doc<"bodyMeasurements">, "loggedAt" | "weightKg">;
type WorkoutLog = Pick<Doc<"workoutLogs">, "date" | "durationSeconds">;

const PROTECTED_MODES = new Set(["habit", "clinician", "recovery"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function dateMs(date: string) {
  return new Date(`${date}T12:00:00Z`).getTime();
}

function daysBetween(start: string, end: string) {
  const diff = dateMs(end) - dateMs(start);
  return Math.max(1, Math.round(diff / 86_400_000));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dayTotals(entries: unknown[]) {
  return entries.reduce<MacroTargets>(
    (acc, entry) => {
      const item = entry as Partial<Record<string, unknown>>;
      return {
        calories: acc.calories + (Number(item.calories) || 0),
        protein: acc.protein + (Number(item.protein) || 0),
        carbs: acc.carbs + (Number(item.carbs) || 0),
        fat: acc.fat + (Number(item.fat) || 0),
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function visibleMetrics(trackingMode: string, safetyMode: string) {
  if (safetyMode === "recovery" || trackingMode === "recovery") {
    return {
      calories: false,
      macros: false,
      protein: false,
      micros: false,
      habits: true,
      water: true,
      streaks: false,
    };
  }
  if (trackingMode === "habit") {
    return {
      calories: false,
      macros: false,
      protein: true,
      micros: true,
      habits: true,
      water: true,
      streaks: false,
    };
  }
  if (trackingMode === "protein_calories") {
    return {
      calories: true,
      macros: false,
      protein: true,
      micros: false,
      habits: false,
      water: true,
      streaks: true,
    };
  }
  if (trackingMode === "photo_portion") {
    return {
      calories: true,
      macros: false,
      protein: true,
      micros: false,
      habits: true,
      water: true,
      streaks: true,
    };
  }
  return {
    calories: true,
    macros: true,
    protein: true,
    micros: true,
    habits: false,
    water: true,
    streaks: true,
  };
}

function firstAction(onboarding: Doc<"onboardingProfiles"> | null) {
  switch (onboarding?.firstNutritionAction) {
    case "build_template":
      return {
        kind: "build_template",
        label: "Build a meal template",
        path: "/foods/recipe/new",
      };
    case "tomorrow_plan":
      return {
        kind: "tomorrow_plan",
        label: "Plan tomorrow",
        path: "/nutrition?plan=tomorrow",
      };
    case "import_yesterday":
      return {
        kind: "import_yesterday",
        label: "Import yesterday",
        path: "/foods?history=1",
      };
    case "skip_habit":
      return {
        kind: "skip_habit",
        label: "Start habit mode",
        path: "/nutrition?mode=habit",
      };
    case "log_first_meal":
    default:
      return {
        kind: "log_first_meal",
        label: "Log first meal",
        path: "/foods/search",
      };
  }
}

function mealSuggestionTags(onboarding: Doc<"onboardingProfiles"> | null) {
  return [
    onboarding?.dietType,
    onboarding?.budget === "low" ? "budget" : undefined,
    onboarding?.cookingSkill === "beginner" ? "simple" : undefined,
    ...(onboarding?.allergies?.map((item) => `no ${item}`) ?? []),
  ].filter((value): value is string => Boolean(value));
}

function buildMealSuggestions(args: {
  onboarding: Doc<"onboardingProfiles"> | null;
  mealPresets: Doc<"mealPresets">[];
  recipes: Doc<"recipes">[];
}) {
  const tags = mealSuggestionTags(args.onboarding);
  const suggestions = [];

  const preset = args.mealPresets[0];
  if (preset) {
    suggestions.push({
      id: `preset:${preset._id}`,
      title: `Repeat ${preset.name}`,
      detail: "Fastest path from your saved meal templates.",
      action: "log_preset",
      presetId: preset._id,
      tags: ["saved", ...tags].slice(0, 4),
    });
  }

  const recipe = args.recipes[0];
  if (recipe) {
    suggestions.push({
      id: `recipe:${recipe._id}`,
      title: `Log ${recipe.name}`,
      detail: "Use a saved recipe that already fits your diary.",
      action: "log_recipe",
      recipeId: recipe._id,
      tags: ["recipe", ...tags].slice(0, 4),
    });
  }

  const beginner = args.onboarding?.cookingSkill === "beginner";
  const budget = args.onboarding?.budget === "low";
  suggestions.push({
    id: "starter:protein-bowl",
    title: budget ? "Budget protein bowl" : "Simple protein bowl",
    detail: beginner
      ? "Low-prep base: protein, carb, vegetable, sauce."
      : "Build a reusable meal template around your protein target.",
    action: "create_recipe",
    tags: ["protein", ...tags].slice(0, 4),
  });

  if (args.onboarding?.trackingMode === "photo_portion") {
    suggestions.push({
      id: "starter:photo-log",
      title: "Snap your next meal",
      detail: "Use photo logging first, then refine portions if needed.",
      action: "photo_log",
      tags: ["photo", "portion"],
    });
  } else {
    suggestions.push({
      id: "starter:search",
      title: "Search a staple meal",
      detail: "Start with a food you eat often and save it for later.",
      action: "search_food",
      tags: ["starter", ...tags].slice(0, 4),
    });
  }

  return suggestions.slice(0, 4);
}

function calibration(args: {
  onboarding: Doc<"onboardingProfiles"> | null;
  effective: MacroTargets;
  health: GoalSource;
  foodLogs: FoodLogDay[];
  bodyMeasurements: BodyMeasurement[];
  workoutLogs: WorkoutLog[];
}) {
  const safetyMode =
    args.health?.safetyMode ?? args.onboarding?.safetyMode ?? "standard";
  const trackingMode =
    args.health?.trackingMode ?? args.onboarding?.trackingMode ?? "full";
  const protectedMode =
    PROTECTED_MODES.has(safetyMode) || trackingMode === "recovery";
  const foodDays = args.foodLogs.filter((day) => day.entries.length > 0);
  const weightEntries = args.bodyMeasurements
    .filter((entry) => typeof entry.weightKg === "number")
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  if (protectedMode) {
    return {
      status: "protected",
      title:
        safetyMode === "recovery"
          ? "Use recovery-safe feedback"
          : safetyMode === "clinician"
            ? "Keep clinician-guided targets"
            : "Keep habit-based targets",
      detail:
        "OneRep will avoid deficit recommendations and focus on consistency, meals, hydration, and support.",
      canApply: false,
    };
  }

  if (foodDays.length < 7 || weightEntries.length < 2) {
    return {
      status: "collect_more_data",
      title: "Collect more data",
      detail: `${foodDays.length}/7 food days and ${weightEntries.length}/2 weight check-ins logged.`,
      canApply: false,
    };
  }

  const avgCalories = average(
    foodDays.map((day) => dayTotals(day.entries).calories),
  );
  const avgProtein = average(
    foodDays.map((day) => dayTotals(day.entries).protein),
  );
  const proteinAdherence = args.effective.protein
    ? avgProtein / args.effective.protein
    : 0;
  const firstWeight = weightEntries[0];
  const lastWeight = weightEntries[weightEntries.length - 1];
  const weeks = daysBetween(firstWeight.loggedAt, lastWeight.loggedAt) / 7;
  const weightRate =
    ((lastWeight.weightKg ?? 0) - (firstWeight.weightKg ?? 0)) / weeks;
  const nutritionGoal = args.onboarding?.nutritionGoal ?? "maintain";
  const adherent = Math.abs(avgCalories - args.effective.calories) <= 220;
  const workoutDays14 = new Set(args.workoutLogs.map((log) => log.date)).size;

  if (avgCalories < Math.max(1200, args.effective.calories - 750)) {
    return {
      status: "increase_calories",
      title: "Intake looks too low",
      detail:
        "Recent logs are far below target. Increase food or simplify tracking before lowering targets.",
      canApply: true,
      targets: {
        ...args.effective,
        calories: Math.round(args.effective.calories + 150),
      },
    };
  }

  if (nutritionGoal === "lose_fat") {
    if (weightRate < -0.9) {
      return {
        status: "increase_calories",
        title: "Fat loss may be too fast",
        detail: `${weightRate.toFixed(2)} kg/week. Add a small calorie buffer.`,
        canApply: true,
        targets: {
          ...args.effective,
          calories: Math.round(args.effective.calories + 150),
        },
      };
    }
    if (weightRate > -0.1 && adherent && proteinAdherence >= 0.75) {
      return {
        status: "decrease_calories",
        title: "Adjust target modestly",
        detail:
          "Food adherence is usable but the weight trend is flat. Reduce gently.",
        canApply: true,
        targets: {
          ...args.effective,
          calories: Math.round(args.effective.calories - 120),
        },
      };
    }
  }

  if (
    (nutritionGoal === "gain_muscle" || nutritionGoal === "performance") &&
    (weightRate < 0.05 || workoutDays14 < 3)
  ) {
    return {
      status: "improve_fueling",
      title: "Improve training fuel",
      detail:
        workoutDays14 < 3
          ? "Training data is thin. Fuel workouts and log sessions before changing targets aggressively."
          : "Weight is not trending up. Add a small calorie buffer around training.",
      canApply: true,
      targets: {
        ...args.effective,
        calories: Math.round(args.effective.calories + 150),
        carbs: Math.round(args.effective.carbs + 25),
      },
    };
  }

  if (proteinAdherence < 0.65) {
    return {
      status: "simplify_tracking",
      title: "Simplify tracking first",
      detail:
        "Protein consistency is low. Fix repeatable meals before changing calories.",
      canApply: false,
    };
  }

  return {
    status: "keep_targets",
    title: "Keep current targets",
    detail:
      "Recent food, body, and training signals do not justify a target change yet.",
    canApply: false,
  };
}

function nextBestAction(args: {
  onboarding: Doc<"onboardingProfiles"> | null;
  calibrationResult: ReturnType<typeof calibration>;
  foodLogs: FoodLogDay[];
  bodyMeasurements: BodyMeasurement[];
}) {
  if (
    args.bodyMeasurements.filter((entry) => entry.weightKg != null).length < 2
  ) {
    return {
      kind: "add_check_in",
      label: "Add check-in",
      path: "/progress",
      detail: "Two weight check-ins unlock trend calibration.",
    };
  }
  if (args.foodLogs.filter((day) => day.entries.length > 0).length < 7) {
    return {
      kind: "log_food",
      label: "Log food",
      path: "/foods/search",
      detail: "Seven logged days unlock target calibration.",
    };
  }
  if (args.calibrationResult.canApply) {
    return {
      kind: "review_calibration",
      label: "Review adjustment",
      path: "/nutrition",
      detail: args.calibrationResult.detail,
    };
  }
  return firstAction(args.onboarding);
}

export function buildNutritionPlan(args: {
  effective: MacroTargets;
  health: GoalSource;
  onboarding: Doc<"onboardingProfiles"> | null;
  foodLogs: FoodLogDay[];
  bodyMeasurements: BodyMeasurement[];
  workoutLogs: WorkoutLog[];
  recipes: Doc<"recipes">[];
  mealPresets: Doc<"mealPresets">[];
}) {
  const safetyMode =
    args.health?.safetyMode ?? args.onboarding?.safetyMode ?? "standard";
  const trackingMode =
    args.health?.trackingMode ?? args.onboarding?.trackingMode ?? "full";
  const calibrationResult = calibration(args);

  return {
    targets: {
      ...args.effective,
      fiber: args.health?.fiber ?? 30,
      saturatedFatLimit: args.health?.saturatedFatLimit ?? 20,
      sodiumLimit: args.health?.sodiumLimit ?? 2300,
    },
    safetyMode,
    trackingMode,
    visibleMetrics: visibleMetrics(trackingMode, safetyMode),
    guidance: args.health?.guidance ?? [],
    nextBestAction: nextBestAction({
      onboarding: args.onboarding,
      calibrationResult,
      foodLogs: args.foodLogs,
      bodyMeasurements: args.bodyMeasurements,
    }),
    calibration: calibrationResult,
    mealSuggestions: buildMealSuggestions({
      onboarding: args.onboarding,
      mealPresets: args.mealPresets,
      recipes: args.recipes,
    }),
  };
}
