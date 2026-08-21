import { describe, expect, test } from "bun:test"
import {
  batchIsEmpty,
  daysBetweenDateKeys,
  foodLogEntryFromMealPrep,
  formatServings,
  mealPrepDraftFromBatch,
  mealPrepFreshness,
  mealPrepInventory,
  perServingFromBatchTotals,
  recipeBatchTotals,
  resolveMealPrepDraft,
  roundServings,
  scaleMealPrepNutrients,
  servingsRemaining,
  sortMealPrepBatches,
  suggestedUseByDate,
  type MealPrepBatch,
} from "@/lib/meal-prep"
import type { Recipe } from "@/lib/food-log"

function batch(overrides: Partial<MealPrepBatch> = {}): MealPrepBatch {
  return {
    id: overrides.id ?? "batch-1",
    name: "Chicken and rice",
    preppedOn: "2026-07-27",
    useByOn: "2026-07-31",
    storage: "fridge",
    servingsTotal: 4,
    servingsLogged: 1,
    nutrientsPerServing: {
      calories: 520,
      protein: 42,
      carbs: 60,
      fat: 12,
      fiber: 5,
    },
    createdAt: 1,
    ...overrides,
  }
}

describe("servings math", () => {
  test("servings round to quarters so half portions survive a round trip", () => {
    expect(roundServings(1.3)).toBe(1.25)
    expect(roundServings(0.6)).toBe(0.5)
    expect(roundServings(Number.NaN)).toBe(0)
  })

  test("remaining servings never go negative", () => {
    expect(servingsRemaining(batch())).toBe(3)
    expect(
      servingsRemaining(batch({ servingsLogged: 9, servingsTotal: 4 }))
    ).toBe(0)
    expect(batchIsEmpty(batch({ servingsLogged: 4 }))).toBe(true)
  })

  test("formatServings keeps whole numbers clean", () => {
    expect(formatServings(2)).toBe("2")
    expect(formatServings(1.5)).toBe("1.5")
  })
})

describe("per-serving nutrition", () => {
  test("batch totals divide across servings", () => {
    const perServing = perServingFromBatchTotals(
      { calories: 2000, protein: 160, carbs: 240, fat: 50, fiber: 20 },
      4
    )
    expect(perServing).toEqual({
      calories: 500,
      protein: 40,
      carbs: 60,
      fat: 12.5,
      fiber: 5,
    })
  })

  test("zero servings does not produce Infinity", () => {
    const perServing = perServingFromBatchTotals(
      { calories: 2000, protein: 160, carbs: 240, fat: 50 },
      0
    )
    expect(Number.isFinite(perServing.calories)).toBe(true)
    expect(perServing.calories).toBe(2000)
  })

  test("scaling and dividing are inverses", () => {
    const totals = { calories: 2000, protein: 160, carbs: 240, fat: 50 }
    expect(
      scaleMealPrepNutrients(perServingFromBatchTotals(totals, 5), 5)
    ).toEqual(totals)
  })
})

describe("freshness", () => {
  test("day arithmetic is UTC-stable across a DST boundary", () => {
    expect(daysBetweenDateKeys("2026-03-27", "2026-03-31")).toBe(4)
    expect(daysBetweenDateKeys("2026-10-24", "2026-10-28")).toBe(4)
  })

  test("labels track the use-by date", () => {
    expect(mealPrepFreshness(batch(), "2026-07-28").status).toBe("fresh")
    expect(mealPrepFreshness(batch(), "2026-07-31")).toMatchObject({
      status: "use-soon",
      label: "Use today",
    })
    expect(mealPrepFreshness(batch(), "2026-08-02")).toMatchObject({
      status: "expired",
      label: "Past use-by by 2 days",
    })
    expect(
      mealPrepFreshness(batch({ useByOn: undefined }), "2026-07-28").status
    ).toBe("unknown")
  })

  test("use-by defaults come from where the batch is stored", () => {
    expect(suggestedUseByDate("2026-07-27", "fridge")).toBe("2026-07-31")
    expect(suggestedUseByDate("2026-07-27", "freezer")).toBe("2026-09-25")
  })
})

describe("sorting and inventory", () => {
  test("emptied batches sink and soonest use-by floats", () => {
    const sorted = sortMealPrepBatches(
      [
        batch({ id: "empty", servingsLogged: 4, useByOn: "2026-07-28" }),
        batch({ id: "later", useByOn: "2026-08-05" }),
        batch({ id: "sooner", useByOn: "2026-07-29" }),
      ],
      "2026-07-28"
    )
    expect(sorted.map((item) => item.id)).toEqual(["sooner", "later", "empty"])
  })

  test("inventory counts only what is left to eat", () => {
    const inventory = mealPrepInventory(
      [
        batch({ id: "a", servingsTotal: 4, servingsLogged: 1 }),
        batch({ id: "b", servingsTotal: 2, servingsLogged: 2 }),
      ],
      "2026-07-30"
    )
    expect(inventory).toMatchObject({
      batches: 1,
      servings: 3,
      calories: 1560,
      protein: 126,
      expiringSoon: 1,
    })
  })
})

describe("draft resolution", () => {
  test("a complete draft resolves to per-serving nutrition", () => {
    const result = resolveMealPrepDraft({
      name: "Chilli",
      meal: "dinner",
      notes: "",
      preppedOn: "2026-07-27",
      useByOn: "2026-07-31",
      storage: "fridge",
      servingsTotal: "5",
      batchNutrients: {
        calories: "2500",
        protein: "150",
        carbs: "250",
        fat: "80",
      },
    })
    expect(result.valid).toBe(true)
    expect(result.servingsTotal).toBe(5)
    expect(result.nutrientsPerServing.calories).toBe(500)
    expect(result.nutrientsPerServing.protein).toBe(30)
  })

  test("missing name, servings and nutrition are each reported", () => {
    const result = resolveMealPrepDraft({
      name: "  ",
      meal: "dinner",
      notes: "",
      preppedOn: "2026-07-27",
      useByOn: "",
      storage: "fridge",
      servingsTotal: "0",
      batchNutrients: { calories: "", protein: "", carbs: "", fat: "" },
    })
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors).sort()).toEqual([
      "name",
      "nutrition",
      "servingsTotal",
    ])
  })

  test("editing a batch round-trips through the draft", () => {
    const original = batch({ servingsTotal: 4 })
    const resolved = resolveMealPrepDraft(mealPrepDraftFromBatch(original))
    expect(resolved.servingsTotal).toBe(original.servingsTotal)
    expect(resolved.nutrientsPerServing.calories).toBe(
      original.nutrientsPerServing.calories
    )
  })
})

describe("recipe import", () => {
  test("whole-recipe totals come from per-100g ingredients", () => {
    const recipe = {
      name: "Rice bowl",
      createdAt: 0,
      ingredients: [
        {
          id: "1",
          name: "Rice",
          grams: 200,
          caloriesPer100: 130,
          proteinPer100: 2.7,
          carbsPer100: 28,
          fatPer100: 0.3,
        },
        {
          id: "2",
          name: "Chicken",
          grams: 300,
          caloriesPer100: 165,
          proteinPer100: 31,
          carbsPer100: 0,
          fatPer100: 3.6,
        },
      ],
    } satisfies Recipe

    expect(recipeBatchTotals(recipe)).toEqual({
      calories: 755,
      protein: 98.4,
      carbs: 56,
      fat: 11.4,
    })
  })
})

describe("logging", () => {
  test("a logged serving carries scaled macros and micros", () => {
    const entry = foodLogEntryFromMealPrep(batch(), {
      servings: 2,
      meal: "dinner",
      loggedAt: "2026-07-30T18:00:00.000Z",
    })
    expect(entry).toMatchObject({
      name: "Chicken and rice",
      calories: 1040,
      protein: 84,
      fiber: 10,
      meal: "dinner",
      servingLabel: "2 servings · meal prep",
    })
  })

  test("the batch's default meal is used when none is given", () => {
    const entry = foodLogEntryFromMealPrep(batch({ meal: "lunch" }))
    expect(entry.meal).toBe("lunch")
    expect(entry.servingLabel).toBe("1 serving · meal prep")
  })
})
