import type { FoodLog } from "@/types/domain";
export function macroTotals(foods: FoodLog[]) {
  return foods.reduce(
    (a, f) => ({
      calories: a.calories + f.calories,
      protein: a.protein + f.protein,
      carbs: a.carbs + f.carbs,
      fat: a.fat + f.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
export function pct(value: number, target: number) {
  return Math.max(0, Math.min(1, value / target));
}
