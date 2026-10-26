import { describe, expect, test } from "bun:test"
import {
  buildSnapFoodLogEntry,
  mapSnapDetectionsToReviewItems,
  parseSnapQuantityGrams,
  snapDetectionsFromAiResult,
  snapItemWithRematch,
  snapNamedServing,
  snapPortionPresets,
  toConvexSafe,
  type FoodSearchFn,
  type SnapReviewItem,
} from "../food-snap-review"
import { DEFAULT_DRINK_ML } from "../hydration"
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
          searchQueries: [
            "chicken breast",
            "cooked chicken",
            "grilled chicken",
          ],
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
      return query === "white rice"
        ? [food({ id: "rice", name: "White rice" })]
        : []
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

  test("uses the selected measurement system in the logged quantity label", () => {
    const entry = buildSnapFoodLogEntry(
      {
        id: "row-oz",
        detectedName: "Chicken",
        grams: 250,
        selected: true,
        food: food({ code: "chicken-code" }),
        alternatives: [],
      },
      "lunch",
      { quantityLabel: "8.8 oz" }
    )

    expect(entry?.name).toBe("Chicken breast (8.8 oz)")
    expect(entry?.quantityGrams).toBe(250)
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

describe("snapPortionPresets", () => {
  test("offers the product's own serving in its own words, plus household units", () => {
    const presets = snapPortionPresets(
      { name: "Granola bar", serving: "1 bar (40 g)" },
      40
    )
    expect(presets[0]).toEqual({ label: "1 bar (40 g)", grams: 40 })
    const labels = presets.map((preset) => preset.label)
    expect(labels).toContain("1 oz")
    expect(labels).toContain("1 cup")
    expect(labels).toContain("1 tbsp")
  })

  test("keeps the product's own serving words even when they are not parseable units", () => {
    // "one pack" carries no parsable unit, so grams come from the product's
    // serving size — but the chip still speaks the label's language, the same
    // way the food detail sheet does.
    const presets = snapPortionPresets(
      { name: "Mystery snack", serving: "one pack" },
      50
    )
    expect(presets[0]).toEqual({ label: "one pack", grams: 50 })
  })

  test("names the serving in the label's own words, for the quantity field", () => {
    // The barcode card offers this as the unit to count in, which is the only
    // thing that makes "3.5 oz" of a 40 g bar avoidable.
    expect(
      snapNamedServing({ name: "Granola bar", serving: "1 bar (40 g)" }, 40)
    ).toEqual({ label: "1 bar (40 g)", grams: 40 })
    expect(
      snapNamedServing({ name: "Mystery snack", serving: "one pack" }, 50)
    ).toEqual({ label: "one pack", grams: 50 })
  })

  test("refuses a serving word the catalogue never weighed", () => {
    // "1 Can" with no grams anywhere is a name, not a portion: counting it
    // would log the per-100 g fallback under a label that says a whole can.
    expect(snapNamedServing({ name: "Cola", serving: "1 Can" }, null)).toBeNull()
    expect(snapNamedServing({ name: "Cola", serving: "1 Can" }, 0)).toBeNull()
    // A label that carries its own weight needs no help from the catalogue.
    expect(snapNamedServing({ name: "Bar", serving: "1 bar (40 g)" }, null)).toEqual(
      { label: "1 bar (40 g)", grams: 40 }
    )
  })

  test("stays out of the way when the units already spell the serving", () => {
    // "100 g" is grams, not a portion of its own; offering it as a unit would
    // just be the same number with a longer name.
    expect(
      snapNamedServing({ name: "Chicken breast", serving: "100 g" }, 100)
    ).toBeNull()
    expect(snapNamedServing({ name: "Butter", serving: "15 g" }, 15)).toBeNull()
    expect(snapNamedServing({ name: "Milk", serving: "" }, 100)).toBeNull()
  })

  test("drops duplicate gram amounts instead of showing the same value twice", () => {
    // 1 tbsp ≈ 15 g, and a 15 g serving would collide with it.
    const presets = snapPortionPresets({ name: "Butter", serving: "15 g" }, 15)
    const grams = presets.map((preset) => preset.grams)
    expect(new Set(grams).size).toBe(grams.length)
    expect(presets[0].label).toBe("1 serving")
  })
})

describe("a snapped drink's hydration", () => {
  const cola = food({ id: "cola", code: "cola", name: "Coca-Cola" })

  test("a counted drink carries its millilitres onto the logged entry", () => {
    const entry = buildSnapFoodLogEntry(
      {
        id: "row-cola",
        detectedName: "Coca-Cola",
        grams: 330,
        selected: true,
        food: cola,
        alternatives: [],
        countsWater: true,
      },
      "lunch",
      { id: "log-1", loggedAt: "2026-06-25T12:00:00.000Z" }
    )
    expect(entry?.hydrationMl).toBe(330)
  })

  test("an unticked drink writes no hydration at all", () => {
    // The whole hydration rule is "an entry contributes only when it carries
    // hydrationMl" — so the field has to be absent, not zero.
    const entry = buildSnapFoodLogEntry(
      {
        id: "row-cola",
        detectedName: "Coca-Cola",
        grams: 330,
        selected: true,
        food: cola,
        alternatives: [],
        countsWater: false,
      },
      "lunch",
      { id: "log-1" }
    )
    expect(entry).not.toBeNull()
    expect("hydrationMl" in entry!).toBe(false)
  })

  test("a drink the catalogue never weighed opens on a glass, not 100 g", async () => {
    const search: FoodSearchFn = async () => [
      food({ id: "juice", code: "juice", name: "Orange juice", serving: "100 g" }),
    ]
    const items = await mapSnapDetectionsToReviewItems(
      [{ id: "row-juice", name: "Orange juice" }],
      search
    )
    // 100 g was a third of a glass of juice and a third of its calories.
    expect(items[0].grams).toBe(DEFAULT_DRINK_ML)
  })

  test("a drink whose label names its own volume keeps it", async () => {
    const search: FoodSearchFn = async () => [
      food({ id: "juice", code: "juice", name: "Orange juice", serving: "330 ml" }),
    ]
    const items = await mapSnapDetectionsToReviewItems(
      [{ id: "row-juice", name: "Orange juice" }],
      search
    )
    expect(items[0].grams).toBe(330)
  })

  test("an estimated amount still wins over the glass default", async () => {
    const search: FoodSearchFn = async () => [
      food({ id: "juice", code: "juice", name: "Orange juice", serving: "100 g" }),
    ]
    const items = await mapSnapDetectionsToReviewItems(
      [{ id: "row-juice", name: "Orange juice", estimatedGrams: 500 }],
      search
    )
    expect(items[0].grams).toBe(500)
  })
})

describe("describing a food to re-match it", () => {
  const item = (): SnapReviewItem => ({
    id: "row-1",
    detectedName: "Chicken salad",
    grams: 220,
    selected: true,
    food: food({ id: "wrong", name: "Caesar salad" }),
    alternatives: [food({ id: "wrong", name: "Caesar salad" })],
    countsWater: false,
  })

  test("replaces the row's matches with the user's search results", () => {
    const rematched = snapItemWithRematch(item(), "the chicken salad", [
      food({ id: "right", code: "right", name: "Chicken salad" }),
    ])
    expect(rematched.food?.id).toBe("right")
    expect(rematched.alternatives.map((a) => a.id)).toEqual(["right"])
    // The portion the user already set is untouched: correcting which food it
    // was says nothing about how much of it there was.
    expect(rematched.grams).toBe(220)
    expect(rematched.detectedName).toBe("the chicken salad")
    expect(rematched.selected).toBe(true)
  })

  test("a description that finds nothing empties the row rather than lying", () => {
    const rematched = snapItemWithRematch(item(), "unicorn steak", [])
    expect(rematched.food).toBeNull()
    expect(rematched.alternatives).toEqual([])
    expect(rematched.selected).toBe(false)
    expect(rematched.detectedName).toBe("unicorn steak")
  })
})
