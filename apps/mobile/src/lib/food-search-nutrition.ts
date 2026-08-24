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

/**
 * What a search or camera card should actually print.
 *
 * Every macro on a `FoodResult` is per 100 g, and every card used to print
 * those numbers directly beneath the product's own serving size — so a 30 g
 * biscuit was billed at the calories of three of them, under a label that
 * said 30 g. The label was right, which is what made it convincing.
 *
 * So the number and the label are decided in one place. Where the product
 * names a serving, the macros are scaled to it; where it does not, the card
 * says per 100 g and means it.
 */
export function foodCardMacros(item: FoodResult) {
  const servingGrams = (item as Partial<FoodDetail>).servingGrams
  const grams =
    typeof servingGrams === "number" && servingGrams > 0 ? servingGrams : 100
  const named = (item as Partial<FoodDetail>).servingLabel || item.serving

  return {
    grams,
    servingLabel: named || "100 g",
    ...scaledFoodMacros(item, grams, initialDetail(item)),
  }
}

/** A search hit already carries its nutrient rows; a bare result does not. */
function initialDetail(item: FoodResult): FoodDetail | null {
  const maybe = item as Partial<FoodDetail>
  return Array.isArray(maybe.nutrients) ? (item as FoodDetail) : null
}
