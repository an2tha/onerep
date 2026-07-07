// Ported from apps/server/src/lib/estimateOnboardingCalories.ts

import {
  calculateCalories,
  type CaloricGoals,
  type NutritionPersonalizationContext,
} from "./calculateCalories";

function onboardingGoalToCalorieGoal(
  goal: string,
): "lose" | "gain" | "maintain" {
  switch (goal) {
    case "lose":
      return "lose";
    case "build":
    case "performance":
      return "gain";
    default:
      return "maintain";
  }
}

export function estimateOnboardingCalories(input: {
  age: number;
  heightCm: number;
  goal: string;
  nutritionGoal?: string;
  safetyMode?: string;
  weightTrend?: string;
  occupationActivity?: string;
  dietType?: string;
  allergies?: string[];
  cookingSkill?: string;
  budget?: string;
  mealFrequency?: number;
  trackingMode?: string;
  loggingFeatures?: string[];
  firstNutritionAction?: string;
}): CaloricGoals {
  const richContext: NutritionPersonalizationContext = {
    nutritionGoal: input.nutritionGoal,
    safetyMode: input.safetyMode,
    weightTrend: input.weightTrend,
    occupationActivity: input.occupationActivity,
    dietType: input.dietType,
    allergies: input.allergies,
    cookingSkill: input.cookingSkill,
    budget: input.budget,
    mealFrequency: input.mealFrequency,
    trackingMode: input.trackingMode,
    loggingFeatures: input.loggingFeatures,
    firstNutritionAction: input.firstNutritionAction,
  };
  if (
    Object.values(richContext).some((value) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined,
    )
  ) {
    return calculateCalories(
      {
        sex: "female",
        age: input.age,
        weightKg: 75,
        heightCm: input.heightCm,
        activityLevel: "moderately_active",
        goal: onboardingGoalToCalorieGoal(input.goal),
      },
      richContext,
    );
  }

  const calorieGoal = onboardingGoalToCalorieGoal(input.goal);
  const base = Math.round(1500 + input.heightCm * 2.8 - input.age * 3.2);
  const bmr = Math.max(1200, base - 220);
  const tdee = Math.max(base + 120, bmr + 400);
  const targetCalories = Math.max(
    1400,
    base + (calorieGoal === "lose" ? -280 : calorieGoal === "gain" ? 240 : 0),
  );

  return {
    bmr,
    tdee,
    targetCalories,
    protein: Math.round((targetCalories * 0.3) / 4),
    carbs: Math.round((targetCalories * 0.4) / 4),
    fat: Math.round((targetCalories * 0.3) / 9),
  };
}
