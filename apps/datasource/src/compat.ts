/**
 * Maps a `foods` row onto the Open Food Facts-shaped product the mobile app
 * already consumes, so replacing FatSecret needs no client changes.
 *
 * USDA publishes every nutrient per 100 g in exactly the units this shape
 * expects (g, mg, mcg), so no unit conversion happens here.
 */
export type FoodRow = {
  fdc_id: number;
  name: string;
  brand: string | null;
  source: string;
  barcode: string | null;
  ingredients: string | null;
  serving_text: string | null;
  serving_grams: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  saturated_fat: number | null;
  trans_fat: number | null;
  sodium: number | null;
  cholesterol: number | null;
  potassium: number | null;
  calcium: number | null;
  iron: number | null;
  vitamin_a: number | null;
  vitamin_c: number | null;
  vitamin_d: number | null;
};

export type Portion = { amount: number | null; unit: string | null; gram_weight: number };

function value(input: number | null | undefined): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0;
}

function describePortion(portion: Portion): string {
  const parts = [portion.amount ? String(portion.amount) : null, portion.unit].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : `${portion.gram_weight} g`;
}

export function toCompatProduct(row: FoodRow, portions: Portion[] = []) {
  const portion = portions[0];
  const servingText = row.serving_text ?? (portion ? describePortion(portion) : "100 g");
  const servingGrams = row.serving_grams ?? portion?.gram_weight ?? undefined;

  return {
    code: `usda:${row.fdc_id}`,
    product_name: row.name,
    brands: row.brand ?? undefined,
    serving_size: servingText,
    serving_quantity: servingGrams,
    image_front_small_url: undefined,
    ingredients_text: row.ingredients ?? undefined,
    nutriments: {
      "energy-kcal_100g": value(row.kcal),
      proteins_100g: value(row.protein),
      carbohydrates_100g: value(row.carbs),
      fat_100g: value(row.fat),
      fiber_100g: value(row.fiber),
      sugars_100g: value(row.sugar),
      "saturated-fat_100g": value(row.saturated_fat),
      "trans-fat_100g": value(row.trans_fat),
      sodium_100g: value(row.sodium),
      sodium_unit: "mg",
      cholesterol_100g: value(row.cholesterol),
      cholesterol_unit: "mg",
      potassium_100g: value(row.potassium),
      potassium_unit: "mg",
      calcium_100g: value(row.calcium),
      calcium_unit: "mg",
      iron_100g: value(row.iron),
      iron_unit: "mg",
      "vitamin-a_100g": value(row.vitamin_a),
      "vitamin-a_unit": "mcg",
      "vitamin-c_100g": value(row.vitamin_c),
      "vitamin-c_unit": "mg",
      "vitamin-d_100g": value(row.vitamin_d),
      "vitamin-d_unit": "mcg",
    },
    // Extra context the FatSecret payload never carried.
    source: row.source,
    barcode: row.barcode ?? undefined,
    servings: portions.map((item) => ({
      description: describePortion(item),
      grams: item.gram_weight,
    })),
  };
}
