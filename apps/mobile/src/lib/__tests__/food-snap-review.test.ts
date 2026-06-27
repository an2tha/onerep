import { describe, expect, test } from "bun:test"
import {
  buildSnapFoodLogEntry,
  mapSnapDetectionsToReviewItems,
  parseSnapQuantityGrams,
  snapDetectionsFromAiResult,
  toConvexSafe,
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

  test("keeps AI-provided search queries for broader matching", () => {
    const detections = snapDetectionsFromAiResult({
      ingredients: [
        {
          name: "Grilled chicken pieces",
          quantityInGrams: "120 g",
          searchQueries: ["chicken breast", "cooked chicken", "grilled chicken"],
        },
      ],
    })

    expect(detections[0]).toMatchObject({
      name: "Grilled chicken pieces",
      searchQueries: ["chicken breast", "cooked chicken", "grilled chicken"],
    })
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

  test("uses AI-ranked provided matches before client fallback search", async () => {
    const rice = food({ id: "rice", code: "rice", name: "White rice" })
    const chicken = food({ id: "chicken", code: "chicken" })
    const search: FoodSearchFn = async () => {
      throw new Error("client search should not run")
    }

    const items = await mapSnapDetectionsToReviewItems(
      [{ id: "row-rice", name: "rice side", estimatedGrams: 90 }],
      search,
      {
        providedMatches: [
          {
            detectionIndex: 0,
            food: rice,
            alternatives: [rice, chicken],
          },
        ],
      }
    )

    expect(items[0]).toMatchObject({
      food: { id: "rice" },
      alternatives: [{ id: "rice" }, { id: "chicken" }],
      selected: true,
      grams: 90,
    })
  })

  test("searches AI query alternatives when the detected label misses", async () => {
    const calls: string[] = []
    const search: FoodSearchFn = async (query) => {
      calls.push(query)
      return query === "white rice" ? [food({ id: "rice", name: "White rice" })] : []
    }

    const items = await mapSnapDetectionsToReviewItems(
      [
        {
          id: "row-rice",
          name: "rice side",
          estimatedGrams: 90,
          searchQueries: ["cooked rice", "white rice"],
        },
      ],
      search
    )

    expect(calls).toContain("rice side")
    expect(calls).toContain("white rice")
    expect(items[0]).toMatchObject({
      food: { id: "rice" },
      selected: true,
      grams: 90,
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

  test("removes nested undefined values before writing Open Food Facts data", () => {
    expect(
      toConvexSafe({
        code: "abc",
        image_url: undefined,
        nutriments: { proteins_100g: 10, missing: undefined },
        tags: ["food", undefined, "snap"],
      })
    ).toEqual({
      code: "abc",
      nutriments: { proteins_100g: 10 },
      tags: ["food", "snap"],
    })
  })
})
