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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
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

function nextBestAction(args: {
  onboarding: Doc<"onboardingProfiles"> | null;
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
      detail: "Two weight check-ins unlock your weight trend.",
    };
  }
  if (args.foodLogs.filter((day) => day.entries.length > 0).length < 7) {
    return {
      kind: "log_food",
      label: "Log food",
      path: "/foods/search",
      detail: "Seven logged days unlock reliable nutrition trends.",
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
  recipes: Doc<"recipes">[];
  mealPresets: Doc<"mealPresets">[];
}) {
  const safetyMode =
    args.health?.safetyMode ?? args.onboarding?.safetyMode ?? "standard";
  const trackingMode =
    args.health?.trackingMode ?? args.onboarding?.trackingMode ?? "full";
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
      foodLogs: args.foodLogs,
      bodyMeasurements: args.bodyMeasurements,
    }),
    mealSuggestions: buildMealSuggestions({
      onboarding: args.onboarding,
      mealPresets: args.mealPresets,
      recipes: args.recipes,
    }),
  };
}
