import type { Food, Nutrients, Serving } from "../../core/types.ts";
import type { foods, portions } from "./schema.ts";

/**
 * Turns USDA rows into the shape the rest of the service speaks.
 *
 * USDA publishes every nutrient per 100 g in exactly the units {@link Nutrients}
 * declares (g, mg, mcg), so nothing is converted here — if that ever stops
 * being true, this is the file that has to do the arithmetic.
 */

export type FoodRow = typeof foods.$inferSelect;
export type PortionRow = typeof portions.$inferSelect;

function describe(portion: PortionRow): string {
  const parts = [portion.amount ? String(portion.amount) : null, portion.unit].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : `${portion.gramWeight} g`;
}

function nutrients(row: FoodRow): Nutrients {
  return {
    kcal: row.kcal,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    sugar: row.sugar,
    saturatedFat: row.saturatedFat,
    transFat: row.transFat,
    sodium: row.sodium,
    cholesterol: row.cholesterol,
    potassium: row.potassium,
    calcium: row.calcium,
    iron: row.iron,
    vitaminA: row.vitaminA,
    vitaminC: row.vitaminC,
    vitaminD: row.vitaminD,
  };
}

export function toFood(row: FoodRow, portionRows: PortionRow[] = []): Food {
  const servings: Serving[] = portionRows.map((portion) => ({
    description: describe(portion),
    grams: portion.gramWeight,
  }));

  // Branded records carry their own serving text; generic foods borrow the
  // smallest portion, and anything with neither falls back to the 100 g basis
  // the nutrients are already expressed in.
  const preferred = servings[0];
  const serving: Serving = {
    description: row.servingText ?? preferred?.description ?? "100 g",
    grams: row.servingGrams ?? preferred?.grams ?? null,
  };

  return {
    id: `usda:${row.fdcId}`,
    providerId: "usda",
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    ingredients: row.ingredients,
    variant: row.source,
    serving,
    servings,
    nutrients: nutrients(row),
    // FoodData Central publishes no images.
    imageUrl: null,
  };
}
