// Ported from apps/server/src/lib/estimateOnboardingCalories.ts

import type { CaloricGoals } from "./calculateCalories";

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
}): CaloricGoals {
  const calorieGoal = onboardingGoalToCalorieGoal(input.goal);
  const base = Math.round(1500 + input.heightCm * 2.8 - input.age * 3.2);
  const bmr = Math.max(1200, base - 220);
  const tdee = Math.max(base + 120, bmr + 400);
  const targetCalories = Math.max(
    1400,
    base +
      (calorieGoal === "lose" ? -280 : calorieGoal === "gain" ? 240 : 0),
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
