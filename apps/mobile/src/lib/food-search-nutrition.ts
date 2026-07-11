import type { FoodDetail, FoodResult } from "@repo/models"

type FoodMacros = Pick<FoodResult, "calories" | "protein" | "carbs" | "fat">

function nonNegativeFiniteNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function detailNutrient(
  detail: FoodDetail | null | undefined,
  key: string,
  fallback: unknown
) {
  const row = detail?.nutrients.find((nutrient) => nutrient.key === key)
  // A present zero is meaningful (for example, zero fat), so prefer the
  // detailed row whenever it is finite rather than falling back on truthiness.
  return row && Number.isFinite(row.per100g) && row.per100g >= 0
    ? row.per100g
    : nonNegativeFiniteNumber(fallback)
}

/**
 * Scale calories and macros from the loaded product detail when it is
 * available. Search-card values are retained as a resilient fallback while a
 * detail request is unavailable.
 */
export function scaledFoodMacros(
  food: FoodMacros,
  grams: number,
  detail?: FoodDetail | null
) {
  const factor = nonNegativeFiniteNumber(grams) / 100
  const roundMacro = (value: number) => Math.round(value * factor * 10) / 10

  return {
    calories: Math.round(
      detailNutrient(detail, "energy", food.calories) * factor
    ),
    protein: roundMacro(detailNutrient(detail, "protein", food.protein)),
    carbs: roundMacro(detailNutrient(detail, "carbs", food.carbs)),
    fat: roundMacro(detailNutrient(detail, "fat", food.fat)),
  }
}
