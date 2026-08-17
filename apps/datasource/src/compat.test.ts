import { expect, test } from "bun:test";
import { toCompatExercise, toCompatProduct } from "./compat.ts";
import { EMPTY_NUTRIENTS, type Exercise, type Food } from "./core/types.ts";

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

function food(overrides: Partial<Food> = {}): Food {
  return {
    id: "usda:1",
    providerId: "usda",
    name: "Test Food",
    brand: null,
    barcode: null,
    ingredients: null,
    variant: "branded",
    serving: { description: "100 g", grams: null },
    servings: [],
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 100, protein: 5, carbs: 10, fat: 2 },
    imageUrl: null,
    ...overrides,
  };
}

test("emits exactly the nutriment keys FatSecret did", () => {
  const product = toCompatProduct(food());
  expect(Object.keys(product.nutriments).sort()).toEqual(FATSECRET_NUTRIMENT_KEYS);
});

test("keeps the units the client assumes", () => {
  const { nutriments } = toCompatProduct(food());
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
  const product = toCompatProduct(
    food({ brand: "ACME", serving: { description: "1 cup", grams: 240 } }),
  );
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
  const { nutriments } = toCompatProduct(food());
  for (const key of ["fiber_100g", "sugars_100g", "cholesterol_100g", "vitamin-d_100g"]) {
    expect(nutriments[key as keyof typeof nutriments]).toBe(0);
  }
});

test("credits the provider's sub-catalog, falling back to the provider itself", () => {
  expect(toCompatProduct(food()).source).toBe("branded");
  expect(toCompatProduct(food({ variant: null })).source).toBe("usda");
});

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "wger:345",
    providerId: "wger",
    uuid: "b1d4f0e2-0000-4000-8000-000000000000",
    name: "Bench Press",
    category: "Chest",
    description: "Press the bar.",
    equipment: ["Barbell"],
    primaryMuscles: ["Pectoralis major"],
    secondaryMuscles: ["Triceps"],
    images: [],
    videos: [],
    license: "CC-BY-SA 4.0",
    licenseAuthor: "someone",
    ...overrides,
  };
}

test("keeps the exercise id numeric and the uuid the provider's own", () => {
  // Clients have always seen wger's bare integer id and its uuid, not the
  // provider-qualified "wger:345" the registry routes on.
  const compat = toCompatExercise(exercise());
  expect(compat.id).toBe(345);
  expect(compat.uuid).toBe("b1d4f0e2-0000-4000-8000-000000000000");
  expect(compat).not.toHaveProperty("providerId");
});

test("carries the licence through, which CC-BY-SA requires be displayed", () => {
  const compat = toCompatExercise(exercise());
  expect(compat.license).toBe("CC-BY-SA 4.0");
  expect(compat.licenseAuthor).toBe("someone");
});
