import { describe, expect, test } from "bun:test"
import type { FoodDetail } from "@repo/models"
import { withCorrectedMacros } from "../food-barcode-correction"
import { foodCardMacros } from "../food-search-nutrition"
import { scaleFoodForGrams } from "../food-snap-review"

const original: FoodDetail = {
  id: "bar",
  code: "123",
  source: "openfoodfacts",
  name: "Bar",
  serving: "1 bar (40 g)",
  servingLabel: "1 bar (40 g)",
  servingGrams: 40,
  calories: 450,
  protein: 8.5,
  carbs: 60,
  fat: 20,
  openFoodFacts: { code: "123" },
  extraNutrients: [],
  nutrients: [
    { key: "energy", name: "Calories", unit: "kcal", per100g: 450 },
    { key: "protein", name: "Protein", unit: "g", per100g: 8.5 },
    { key: "carbs", name: "Carbs", unit: "g", per100g: 60 },
    { key: "fat", name: "Fat", unit: "g", per100g: 20 },
    { key: "fiber", name: "Fiber", unit: "g", per100g: 3 },
  ],
}

describe("barcode corrections", () => {
  for (const grams of [40, 50]) {
    test(`uses corrected macros for a ${grams} g serving and partial portions`, () => {
      const corrected = withCorrectedMacros(original, {
        name: "Corrected bar",
        servingLabel: `1 bar (${grams} g)`,
        servingGrams: grams,
        nutrientsPerServing: { calories: 100, protein: 4, carbs: 20, fat: 0 },
      })
      expect(foodCardMacros(corrected)).toEqual({
        grams,
        servingLabel: `1 bar (${grams} g)`,
        calories: 100,
        protein: 4,
        carbs: 20,
        fat: 0,
      })
      expect(scaleFoodForGrams(corrected, grams / 2)).toEqual({
        calories: 50,
        protein: 2,
        carbs: 10,
        fat: 0,
      })
      expect(
        corrected.nutrients.find((row) => row.key === "fiber")?.per100g,
      ).toBe(3)
      expect(original.nutrients[0].per100g).toBe(450)
    })
  }
  test("falls back to corrected compact macros when nutrient rows are absent", () => {
    const corrected = withCorrectedMacros(
      { ...original, nutrients: [] },
      {
        name: "Corrected bar",
        servingLabel: "1 bar (40 g)",
        servingGrams: 40,
        nutrientsPerServing: { calories: 100, protein: 4, carbs: 20, fat: 0 },
      },
    )
    expect(foodCardMacros(corrected).calories).toBe(100)
  })
})
