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
  const servingGrams = foodServingGrams(item)
  const grams = servingGrams ?? 100
  const named = (item as Partial<FoodDetail>).servingLabel || item.serving

  return {
    grams,
    // A serving we cannot weigh is not a serving we can count. The catalogue
    // says "1 Can" for a great many rows without ever saying what a can weighs,
    // and printing that beside per-100 g numbers is how a scanned bottle reads
    // as a third of its calories; a scanned granola bar opened on 100 g under a
    // label that said 40 g. No weight means the card says per 100 g and means
    // it, which is the rule this function exists to enforce.
    servingLabel: servingGrams === null ? "100 g" : named || "100 g",
    ...scaledFoodMacros(item, grams, initialDetail(item)),
  }
}

/**
 * The serving weight a food declares, or null when the catalogue has none.
 *
 * Serving *text* is far more common than serving *grams* — "1 Can", "one pack",
 * "2 slices" describe a portion nobody wrote a weight for. Only a weight can be
 * scaled to, and only a weight makes the serving the honest label for the
 * numbers beside it.
 */
export function foodServingGrams(item: FoodResult): number | null {
  const declared = (item as Partial<FoodDetail>).servingGrams
  return typeof declared === "number" && declared > 0 ? declared : null
}

/** A search hit already carries its nutrient rows; a bare result does not. */
function initialDetail(item: FoodResult): FoodDetail | null {
  const maybe = item as Partial<FoodDetail>
  return Array.isArray(maybe.nutrients) ? (item as FoodDetail) : null
}
