import { describe, expect, test } from "bun:test"
import {
  caloriesFromMacros,
  customFoodDraftFromDatabaseFood,
  customFoodDraftFromFood,
  customFoodNutrientsFromDraft,
  emptyCustomFoodDraft,
  filterCustomFoods,
  foodLogEntryFromCustomFood,
  macroCalorieMismatch,
  parseNutrientInput,
  scaleCustomFoodNutrients,
  servingsLabel,
  validateCustomFoodDraft,
  type CustomFood,
  type CustomFoodDraft,
} from "@/lib/custom-foods"

function draftWith(overrides: Partial<CustomFoodDraft> = {}): CustomFoodDraft {
  const base = emptyCustomFoodDraft()
  return {
    ...base,
    name: "Protein shake",
    servingLabel: "1 scoop",
    ...overrides,
    nutrients: {
      ...base.nutrients,
      calories: "120",
      protein: "24",
      carbs: "3",
      fat: "1.5",
      ...(overrides.nutrients ?? {}),
    },
  }
}

const shake: CustomFood = {
  id: "food-1",
  name: "Protein shake",
  brand: "House brand",
  servingLabel: "1 scoop",
  servingGrams: 30,
  nutrientsPerServing: {
    calories: 120,
    protein: 24,
    carbs: 3,
    fat: 1.5,
    sodium: 60,
  },
}

describe("parsing", () => {
  test("blank, negative and junk input read as absent", () => {
    expect(parseNutrientInput("")).toBeUndefined()
    expect(parseNutrientInput("  ")).toBeUndefined()
    expect(parseNutrientInput("-5")).toBeUndefined()
    expect(parseNutrientInput("abc")).toBeUndefined()
  })

  test("decimal commas are accepted", () => {
    expect(parseNutrientInput("1,5")).toBe(1.5)
    expect(parseNutrientInput("12.345")).toBe(12.35)
  })

  test("only supplied micronutrients survive into the saved profile", () => {
    const nutrients = customFoodNutrientsFromDraft(
      draftWith({ nutrients: { sodium: "60" } as CustomFoodDraft["nutrients"] })
    )
    expect(nutrients.sodium).toBe(60)
    expect("iron" in nutrients).toBe(false)
  })
})

describe("validation", () => {
  test("a complete draft passes", () => {
    expect(validateCustomFoodDraft(draftWith()).valid).toBe(true)
  })

  test("name and serving label are required", () => {
    const result = validateCustomFoodDraft(
      draftWith({ name: " ", servingLabel: "" })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeDefined()
    expect(result.errors.servingLabel).toBeDefined()
  })

  test("a food with macros but no calories is still valid", () => {
    const result = validateCustomFoodDraft(
      draftWith({
        nutrients: {
          ...emptyCustomFoodDraft().nutrients,
          calories: "",
          protein: "24",
        },
      })
    )
    expect(result.valid).toBe(true)
  })

  test("a food with no nutrition at all is rejected", () => {
    const result = validateCustomFoodDraft(
      draftWith({ nutrients: emptyCustomFoodDraft().nutrients })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.calories).toBeDefined()
  })
})

describe("macro sanity check", () => {
  test("matching macros do not warn", () => {
    expect(
      macroCalorieMismatch({ calories: 120, protein: 24, carbs: 3, fat: 1.5 })
    ).toBe(false)
  })

  test("a mistyped calorie count warns", () => {
    expect(
      macroCalorieMismatch({ calories: 1200, protein: 24, carbs: 3, fat: 1.5 })
    ).toBe(true)
    expect(
      caloriesFromMacros({ calories: 0, protein: 24, carbs: 3, fat: 1.5 })
    ).toBe(122)
  })

  test("no warning when calories were left blank", () => {
    expect(
      macroCalorieMismatch({ calories: 0, protein: 24, carbs: 3, fat: 1.5 })
    ).toBe(false)
  })
})

describe("scaling and logging", () => {
  test("half a serving halves every nutrient", () => {
    expect(scaleCustomFoodNutrients(shake.nutrientsPerServing, 0.5)).toEqual({
      calories: 60,
      protein: 12,
      carbs: 1.5,
      fat: 0.75,
      sodium: 30,
    })
  })

  test("a log entry names the brand and the portion", () => {
    const entry = foodLogEntryFromCustomFood(shake, {
      meal: "breakfast",
      servings: 2,
      loggedAt: "2026-07-30T08:00:00.000Z",
    })
    expect(entry).toMatchObject({
      name: "Protein shake (House brand)",
      calories: 240,
      protein: 48,
      sodium: 120,
      meal: "breakfast",
      servingLabel: "2 × 1 scoop",
      quantityGrams: 60,
      foodCode: "food-1",
    })
  })

  test("servings default to one", () => {
    expect(foodLogEntryFromCustomFood(shake, { meal: "snack" }).calories).toBe(
      120
    )
    expect(servingsLabel(1, "1 scoop")).toBe("1 × 1 scoop")
  })
})

describe("editing and searching", () => {
  test("a saved food round-trips through the editor draft", () => {
    const nutrients = customFoodNutrientsFromDraft(
      customFoodDraftFromFood(shake)
    )
    expect(nutrients).toEqual(shake.nutrientsPerServing)
  })

  test("search matches name and brand, case-insensitively", () => {
    const other: CustomFood = {
      ...shake,
      id: "food-2",
      name: "Oat bake",
      brand: undefined,
    }
    expect(filterCustomFoods([shake, other], "HOUSE")).toEqual([shake])
    expect(filterCustomFoods([shake, other], "oat")).toEqual([other])
    expect(filterCustomFoods([shake, other], "  ")).toHaveLength(2)
  })
})

describe("customFoodDraftFromDatabaseFood", () => {
  test("pre-fills the draft from the database values and keeps the barcode", () => {
    const draft = customFoodDraftFromDatabaseFood({
      code: "3017620422003",
      name: "Some Spread",
      brand: "A Brand",
      servingLabel: "1 bar",
      servingGrams: 40,
      // Per-100g macros in, per-serving macros out: the declared serving is
      // kept, so the numbers must be rebased (40/100 = 0.4).
      calories: 190.4,
      protein: 20.12,
      carbs: 12.36,
      fat: 9.02,
    })
    expect(draft.id).toBeUndefined()
    expect(draft.name).toBe("Some Spread")
    expect(draft.brand).toBe("A Brand")
    expect(draft.barcode).toBe("3017620422003")
    expect(draft.servingLabel).toBe("1 bar")
    expect(draft.servingGrams).toBe("40")
    expect(draft.nutrients.calories).toBe("76")
    expect(draft.nutrients.protein).toBe("8")
    expect(draft.nutrients.carbs).toBe("4.9")
    expect(draft.nutrients.fat).toBe("3.6")
  })

  test("a declared 100 g serving carries the macros over as typed", () => {
    const draft = customFoodDraftFromDatabaseFood({
      name: "Water Packed Tuna",
      servingLabel: "1 can",
      servingGrams: 100,
      calories: 116,
      protein: 25.5,
      carbs: 0,
      fat: 0.8,
    })
    expect(draft.servingGrams).toBe("100")
    expect(draft.nutrients.calories).toBe("116")
    expect(draft.nutrients.protein).toBe("25.5")
    expect(draft.nutrients.carbs).toBe("0")
    expect(draft.nutrients.fat).toBe("0.8")
  })

  test("a missing serving label gets a per-100g fallback instead of failing validation", () => {
    const draft = customFoodDraftFromDatabaseFood({
      name: "Mystery Item",
      calories: 100,
      protein: 1,
      carbs: 2,
      fat: 3,
    })
    expect(draft.servingLabel).toBe("100 g")
    expect(draft.barcode).toBe("")
    expect(validateCustomFoodDraft(draft).valid).toBe(true)
  })
})
