// Ported from apps/server/src/lib/calculateCalories.ts

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

const GOAL_CALORIE_DELTA: Record<string, number> = {
  lose: -500,
  maintain: 0,
  gain: 500,
};

export interface CaloricGoals {
  bmr: number;
  tdee: number;
  targetCalories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function calculateCalories(params: {
  sex: string;
  age: number;
  weightKg: number;
  heightCm: number;
  activityLevel: string;
  goal: string;
}): CaloricGoals {
  const { sex, age, weightKg, heightCm, activityLevel, goal } = params;

  // Mifflin-St Jeor equation
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);

  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.55;
  const delta = GOAL_CALORIE_DELTA[goal] ?? 0;

  const tdee = Math.round(bmr * multiplier);
  const targetCalories = Math.round(tdee + delta);

  // Macro split: 30% protein, 40% carbs, 30% fat
  const protein = Math.round((targetCalories * 0.3) / 4);
  const carbs = Math.round((targetCalories * 0.4) / 4);
  const fat = Math.round((targetCalories * 0.3) / 9);

  return { bmr: Math.round(bmr), tdee, targetCalories, protein, carbs, fat };
}
