import type { FoodLog, Recipe, WorkoutPreset } from "@/types/domain";

export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function emptyMacros(): MacroTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function addMacros(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export function totalFoodMacros(
  foods: Pick<FoodLog, "calories" | "protein" | "carbs" | "fat">[],
): MacroTotals {
  return foods.reduce((total, food) => addMacros(total, food), emptyMacros());
}

export function recipeTotals(recipe: Recipe): MacroTotals {
  return recipe.ingredients.reduce(
    (total, ingredient) => addMacros(total, ingredient),
    emptyMacros(),
  );
}

export function recipePerServing(recipe: Recipe): MacroTotals {
  const servings = Math.max(1, recipe.servings);
  const totals = recipeTotals(recipe);
  return {
    calories: Math.round(totals.calories / servings),
    protein: Math.round((totals.protein / servings) * 10) / 10,
    carbs: Math.round((totals.carbs / servings) * 10) / 10,
    fat: Math.round((totals.fat / servings) * 10) / 10,
  };
}

export function workoutVolumeKg(preset: WorkoutPreset): number {
  return preset.exercises
    .flatMap((exercise) => exercise.sets)
    .reduce((sum, set) => sum + set.weight * set.reps, 0);
}

export function completedSetCount(preset: WorkoutPreset): number {
  return preset.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.done).length;
}

export function totalSetCount(preset: WorkoutPreset): number {
  return preset.exercises.flatMap((exercise) => exercise.sets).length;
}
