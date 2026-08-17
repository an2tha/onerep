import type { Exercise, Food } from "./core/types.ts";

/**
 * The wire format, and the only file allowed to care about it.
 *
 * Responses are shaped like Open Food Facts because that is what the mobile app
 * already parses, and replacing the upstream catalog was never supposed to
 * require a client release. Providers normalise to {@link Food}; this maps that
 * onto the legacy shape at the last possible moment, so the day the clients
 * move on, this file is the only thing that has to change.
 */

/** The client treats a missing nutrient as an absent key, not as zero. */
function value(input: number | null): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0;
}

export function toCompatProduct(food: Food) {
  return {
    code: food.id,
    product_name: food.name,
    brands: food.brand ?? undefined,
    serving_size: food.serving?.description ?? "100 g",
    serving_quantity: food.serving?.grams ?? undefined,
    image_front_small_url: food.imageUrl ?? undefined,
    ingredients_text: food.ingredients ?? undefined,
    nutriments: {
      "energy-kcal_100g": value(food.nutrients.kcal),
      proteins_100g: value(food.nutrients.protein),
      carbohydrates_100g: value(food.nutrients.carbs),
      fat_100g: value(food.nutrients.fat),
      fiber_100g: value(food.nutrients.fiber),
      sugars_100g: value(food.nutrients.sugar),
      "saturated-fat_100g": value(food.nutrients.saturatedFat),
      "trans-fat_100g": value(food.nutrients.transFat),
      sodium_100g: value(food.nutrients.sodium),
      sodium_unit: "mg",
      cholesterol_100g: value(food.nutrients.cholesterol),
      cholesterol_unit: "mg",
      potassium_100g: value(food.nutrients.potassium),
      potassium_unit: "mg",
      calcium_100g: value(food.nutrients.calcium),
      calcium_unit: "mg",
      iron_100g: value(food.nutrients.iron),
      iron_unit: "mg",
      "vitamin-a_100g": value(food.nutrients.vitaminA),
      "vitamin-a_unit": "mcg",
      "vitamin-c_100g": value(food.nutrients.vitaminC),
      "vitamin-c_unit": "mg",
      "vitamin-d_100g": value(food.nutrients.vitaminD),
      "vitamin-d_unit": "mcg",
    },
    // Extra context the FatSecret payload never carried.
    source: food.variant ?? food.providerId,
    barcode: food.barcode ?? undefined,
    servings: food.servings.map((serving) => ({
      description: serving.description,
      grams: serving.grams,
    })),
  };
}

/**
 * Exercises were never modelled on Open Food Facts, so this is a straight
 * rename of the normalised shape into the camelCase the client reads, minus the
 * provider bookkeeping it has no use for.
 */
export function toCompatExercise(exercise: Exercise) {
  const { providerId, id, uuid, ...rest } = exercise;
  return {
    // The client has always seen the provider's bare numeric id here, and the
    // provider's own uuid — not the qualified `wger:123` form — beside it.
    id: Number.parseInt(id.slice(id.indexOf(":") + 1), 10),
    uuid,
    ...rest,
  };
}
