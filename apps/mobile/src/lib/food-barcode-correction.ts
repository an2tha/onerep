import type { FoodDetail } from "@repo/models"
import type { CustomFood } from "./custom-foods"

/**
 * Overlays a user's corrected copy onto a scan result.
 *
 * Custom foods store macros per serving; a `FoodResult`'s macros are per
 * 100 g — the basis the whole scanner (portion scaling, presets, entry
 * building) is built on. Rebasing keeps that machinery intact and only the
 * numbers change, so the review card shows and logs the user's own values
 * for any quantity they pick.
 */
export function withCorrectedMacros(
  food: FoodDetail,
  corrected: CustomFood,
): FoodDetail {
  const per100 =
    corrected.servingGrams && corrected.servingGrams > 0
      ? 100 / corrected.servingGrams
      : 1
  const macros = {
    energy: corrected.nutrientsPerServing.calories * per100,
    protein: corrected.nutrientsPerServing.protein * per100,
    carbs: corrected.nutrientsPerServing.carbs * per100,
    fat: corrected.nutrientsPerServing.fat * per100,
  }
  return {
    ...food,
    // Cards prefer detailed nutrient rows over the compact macro fields.
    // Replace those rows too, so the default serving uses the correction.
    nutrients: food.nutrients.map((row) =>
      Object.hasOwn(macros, row.key)
        ? { ...row, per100g: macros[row.key as keyof typeof macros] }
        : row,
    ),
    name: corrected.name,
    brand: corrected.brand ?? food.brand,
    serving: corrected.servingLabel || food.serving,
    // The correction carries its own serving. Keeping the catalogue's grams
    // here would scale the user's numbers by the ratio between the two.
    servingGrams: corrected.servingGrams ?? food.servingGrams,
    servingLabel: corrected.servingLabel || food.servingLabel,
    calories: Math.round(corrected.nutrientsPerServing.calories * per100),
    protein:
      Math.round(corrected.nutrientsPerServing.protein * per100 * 10) / 10,
    carbs: Math.round(corrected.nutrientsPerServing.carbs * per100 * 10) / 10,
    fat: Math.round(corrected.nutrientsPerServing.fat * per100 * 10) / 10,
  }
}
