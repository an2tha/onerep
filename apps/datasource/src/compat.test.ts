import { expect, test } from "bun:test";
import { toCompatProduct, type FoodRow } from "./compat.ts";

/**
 * The exact nutriment keys the retired FatSecret proxy emitted. The mobile
 * client reads these directly, so the datasource must keep producing all of
 * them with the same units.
 */
const FATSECRET_NUTRIMENT_KEYS = [
  "energy-kcal_100g",
  "proteins_100g",
  "carbohydrates_100g",
  "fat_100g",
  "fiber_100g",
  "sugars_100g",
  "saturated-fat_100g",
  "trans-fat_100g",
  "sodium_100g",
  "sodium_unit",
  "cholesterol_100g",
  "cholesterol_unit",
  "potassium_100g",
  "potassium_unit",
  "calcium_100g",
  "calcium_unit",
  "iron_100g",
  "iron_unit",
  "vitamin-a_100g",
  "vitamin-a_unit",
  "vitamin-c_100g",
  "vitamin-c_unit",
  "vitamin-d_100g",
  "vitamin-d_unit",
].sort();

function row(overrides: Partial<FoodRow> = {}): FoodRow {
  return {
    fdc_id: 1,
    name: "Test Food",
    brand: null,
    source: "branded",
    barcode: null,
    ingredients: null,
    serving_text: null,
    serving_grams: null,
    kcal: 100,
    protein: 5,
    carbs: 10,
    fat: 2,
    fiber: null,
    sugar: null,
    saturated_fat: null,
    trans_fat: null,
    sodium: null,
    cholesterol: null,
    potassium: null,
    calcium: null,
    iron: null,
    vitamin_a: null,
    vitamin_c: null,
    vitamin_d: null,
    ...overrides,
  };
}

test("emits exactly the nutriment keys FatSecret did", () => {
  const product = toCompatProduct(row());
  expect(Object.keys(product.nutriments).sort()).toEqual(FATSECRET_NUTRIMENT_KEYS);
});

test("keeps the units the client assumes", () => {
  const { nutriments } = toCompatProduct(row());
  expect(nutriments.sodium_unit).toBe("mg");
  expect(nutriments.cholesterol_unit).toBe("mg");
  expect(nutriments.potassium_unit).toBe("mg");
  expect(nutriments.calcium_unit).toBe("mg");
  expect(nutriments.iron_unit).toBe("mg");
  expect(nutriments["vitamin-a_unit"]).toBe("mcg");
  expect(nutriments["vitamin-c_unit"]).toBe("mg");
  expect(nutriments["vitamin-d_unit"]).toBe("mcg");
});

test("emits the top-level fields the client reads", () => {
  const product = toCompatProduct(row({ brand: "ACME", serving_text: "1 cup", serving_grams: 240 }));
  expect(product.code).toBe("usda:1");
  expect(product.product_name).toBe("Test Food");
  expect(product.brands).toBe("ACME");
  expect(product.serving_size).toBe("1 cup");
  expect(product.serving_quantity).toBe(240);
  expect(product).toHaveProperty("image_front_small_url");
});

test("reports absent nutrients as 0 rather than null", () => {
  // normalizeProduct in the mobile client treats null as a missing nutrient
  // and would render blanks where FatSecret rendered zeroes.
  const { nutriments } = toCompatProduct(row());
  for (const key of ["fiber_100g", "sugars_100g", "cholesterol_100g", "vitamin-d_100g"]) {
    expect(nutriments[key as keyof typeof nutriments]).toBe(0);
  }
});

test("falls back to a portion, then to 100 g, for serving text", () => {
  expect(toCompatProduct(row()).serving_size).toBe("100 g");
  expect(
    toCompatProduct(row(), [{ amount: 1, unit: "cup", gram_weight: 240 }]).serving_size,
  ).toBe("1 cup");
});
