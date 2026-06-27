import { describe, expect, test } from "bun:test"
import {
  buildSnapFoodLogEntry,
  mapSnapDetectionsToReviewItems,
  parseSnapQuantityGrams,
  snapDetectionsFromAiResult,
  type FoodSearchFn,
} from "../food-snap-review"
import type { FoodResult } from "@repo/models"

function food(overrides: Partial<FoodResult>): FoodResult {
  return {
    id: "food-1",
    source: "openfoodfacts",
    code: "food-1",
    name: "Chicken breast",
    serving: "100 g",
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    openFoodFacts: { code: "food-1" },
    ...overrides,
  }
}

describe("snap review helpers", () => {
  test("parses AI gram estimates from strings", () => {
    expect(parseSnapQuantityGrams("120")).toBe(120)
    expect(parseSnapQuantityGrams("80-100 g")).toBe(90)
    expect(parseSnapQuantityGrams("1 cup")).toBe(240)
    expect(parseSnapQuantityGrams("unknown")).toBeUndefined()
  })

  test("normalizes ingredient detections before food search mapping", () => {
    const detections = snapDetectionsFromAiResult({
      foodName: null,
      ingredients: [
        { name: " Chicken breast ", quantityInGrams: "150g" },
        { name: "Rice", quantityInGrams: "90 g" },
        { name: "" },
      ],
    })

    expect(detections).toEqual([
      {
        id: "0-chicken-breast",
        name: "Chicken breast",
        quantityText: "150g",
        estimatedGrams: 150,
      },
      {
        id: "1-rice",
        name: "Rice",
        quantityText: "90 g",
        estimatedGrams: 90,
      },
    ])
  })

  test("maps detections to searchable food entries and keeps misses reviewable", async () => {
    const search: FoodSearchFn = async (query) =>
      query === "Chicken breast" ? [food({ id: "chicken" })] : []

    const items = await mapSnapDetectionsToReviewItems(
      snapDetectionsFromAiResult({
        ingredients: [
          { name: "Chicken breast", quantityInGrams: "150" },
          { name: "Mystery sauce", quantityInGrams: "30" },
        ],
      }),
      search
    )

    expect(items[0]).toMatchObject({
      detectedName: "Chicken breast",
      grams: 150,
      selected: true,
      food: { id: "chicken" },
    })
    expect(items[1]).toMatchObject({
      detectedName: "Mystery sauce",
      grams: 30,
      selected: false,
      food: null,
    })
  })

  test("builds scaled food log entries from confirmed snap rows", () => {
    const entry = buildSnapFoodLogEntry(
      {
        id: "row-1",
        detectedName: "Chicken",
        grams: 150,
        selected: true,
        food: food({ code: "chicken-code" }),
        alternatives: [],
      },
      "lunch",
      { id: "log-1", loggedAt: "2026-06-25T12:00:00.000Z" }
    )

    expect(entry).toMatchObject({
      id: "log-1",
      name: "Chicken breast (150 g)",
      calories: 248,
      protein: 46.5,
      fat: 5.4,
      meal: "lunch",
      foodCode: "chicken-code",
      quantityGrams: 150,
    })
  })
})
