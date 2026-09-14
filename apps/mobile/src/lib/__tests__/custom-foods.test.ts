import { describe, expect, test } from "bun:test"
import type { FoodDetail, FoodResult } from "@repo/models"
import {
  applyCorrectedCopy,
  caloriesFromMacros,
  correctedCopyForBarcode,
  customFoodDraftBasisGrams,
  customFoodDraftFromDatabaseFood,
  customFoodDraftFromFood,
  customFoodDraftFromFoodResult,
  customFoodDraftInBasis,
  customFoodFromDraft,
  customFoodNutrientsFromDraft,
  customFoodSaveArgs,
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

describe("corrections", () => {
  test("a typed serving weight is read tolerantly", () => {
    // "85 g" straight off the packet is not a number, and NaN is not a number
    // Convex accepts — the save used to fail its validator instead of reading
    // the field.
    const draft = { ...emptyCustomFoodDraft(), name: "Meatballs", servingLabel: "3 meatballs" }
    const grams = (raw: string) =>
      customFoodSaveArgs({ ...draft, servingGrams: raw }).servingGrams

    expect(grams("85 g")).toBe(85)
    expect(grams("85g")).toBe(85)
    expect(grams("85,5")).toBe(85.5)
    expect(grams(" 85.5 ")).toBe(85.5)
    expect(grams("")).toBeUndefined()
    expect(grams("   ")).toBeUndefined()
    expect(grams("n/a")).toBeUndefined()
    expect(grams("0")).toBeUndefined()
    expect(grams("-5")).toBeUndefined()
  })

  test("the row that is saved and the row that is shown are one description", () => {
    const draft = {
      ...emptyCustomFoodDraft(),
      name: "  Meatballs  ",
      brand: " Cooked Perfect ",
      servingLabel: " 3 meatballs ",
      servingGrams: "85",
      barcode: "0856772001122",
    }
    draft.nutrients = { ...draft.nutrients, calories: "240" }

    expect(customFoodFromDraft(draft, "abc")).toMatchObject({
      id: "abc",
      name: "Meatballs",
      brand: "Cooked Perfect",
      servingLabel: "3 meatballs",
      servingGrams: 85,
      barcode: "0856772001122",
      nutrientsPerServing: { calories: 240 },
    })
    // An empty brand is absent, not an empty string on the row.
    expect(
      customFoodFromDraft({ ...draft, brand: "   " }).brand
    ).toBeUndefined()
  })

  test("a correction overlays the catalogue result on its per-100 g basis", () => {
    // Every card scales from per-100 g, so the user's per-serving numbers are
    // rebased on the way in — the same trip the catalogue's numbers make on the
    // way out — and the correction's own serving becomes the card's serving.
    const result: FoodResult &
      Pick<FoodDetail, "servingGrams" | "servingLabel"> = {
      id: "62233",
      source: "openfoodfacts",
      code: "62233",
      name: "Italian Style Meatballs",
      brand: "Cooked Perfect",
      serving: "85 g",
      servingGrams: 85,
      servingLabel: "85 g",
      calories: 282,
      protein: 13,
      carbs: 5,
      fat: 19,
      openFoodFacts: { code: "62233" },
    }
    const draft = {
      ...emptyCustomFoodDraft(),
      name: "Italian Style Meatballs",
      servingLabel: "3 meatballs",
      servingGrams: "85",
    }
    draft.nutrients = {
      ...draft.nutrients,
      calories: "240",
      protein: "13",
      carbs: "5",
      fat: "19",
    }

    const corrected = applyCorrectedCopy(result, customFoodFromDraft(draft))

    expect(corrected.servingLabel).toBe("3 meatballs")
    expect(corrected.serving).toBe("3 meatballs")
    expect(corrected.servingGrams).toBe(85)
    expect(corrected.calories).toBe(282)
    expect(corrected.protein).toBe(15.3)
    expect(corrected.carbs).toBe(5.9)
    expect(corrected.fat).toBe(22.4)
    // The result the user was looking at keeps every other field.
    expect(corrected.imageUrl).toBeUndefined()
    expect(corrected.brand).toBe("Cooked Perfect")
  })

  test("a correction updates the copy the barcode already has", () => {
    // Insert-only corrections left a row per attempt, and a pinned one
    // outranked every later correction because pinned foods sort first.
    const foods: CustomFood[] = [
      food("other", "999"),
      food("mit", "0856772001122"),
      food("mit-old", " 0856772001122 "),
    ]
    expect(correctedCopyForBarcode(foods, "0856772001122")?.id).toBe("mit")
    expect(correctedCopyForBarcode(foods, " 0856772001122 ")?.id).toBe("mit")
    expect(correctedCopyForBarcode(foods, null)).toBeNull()
    expect(correctedCopyForBarcode(foods, "   ")).toBeNull()
    expect(correctedCopyForBarcode(foods, "404")).toBeNull()
  })
})

describe("nutrition basis", () => {
  /** Barilla's two-column packet: per 2 oz (56 g), and per 3.5 oz (100 g). */
  function twoColumnDraft(): CustomFoodDraft {
    const draft = {
      ...emptyCustomFoodDraft(),
      name: "Spaghetti Grain & Legume Pasta",
      servingLabel: "2 oz (56 g)",
      servingGrams: "56",
    }
    return {
      ...draft,
      nutrients: {
        ...draft.nutrients,
        calories: "190",
        protein: "10",
        carbs: "38",
        fat: "1",
        iron: "2",
      },
    }
  }

  test("switching basis re-scales the numbers instead of reinterpreting them", () => {
    const per100 = customFoodDraftInBasis(twoColumnDraft(), "100g")

    expect(per100.basis).toBe("100g")
    expect(per100.nutrients.calories).toBe("339.29")
    expect(per100.nutrients.protein).toBe("17.86")
    expect(per100.nutrients.carbs).toBe("67.86")
    expect(per100.nutrients.fat).toBe("1.79")
    expect(per100.nutrients.iron).toBe("3.57")
    // The packet's serving is left exactly as typed, which is the point: nothing
    // has to be retyped to work in the packet's other column.
    expect(per100.servingLabel).toBe("2 oz (56 g)")
    expect(per100.servingGrams).toBe("56")
    expect(customFoodDraftBasisGrams(per100)).toBe(100)
    expect(customFoodDraftBasisGrams(twoColumnDraft())).toBe(56)
  })

  test("a round trip returns the numbers that were typed", () => {
    const back = customFoodDraftInBasis(
      customFoodDraftInBasis(twoColumnDraft(), "100g"),
      "serving"
    )

    expect(back.basis).toBe("serving")
    expect(back.nutrients.calories).toBe("190")
    expect(back.nutrients.protein).toBe("10")
    expect(back.nutrients.carbs).toBe("38")
    expect(back.nutrients.fat).toBe("1")
    expect(back.nutrients.iron).toBe("2")

    // And it settles: toggling again lands on the same numbers rather than
    // drifting a decimal each way.
    const again = customFoodDraftInBasis(
      customFoodDraftInBasis(back, "100g"),
      "serving"
    )
    expect(again.nutrients).toEqual(back.nutrients)
  })

  test("an empty field is not a number in either basis", () => {
    const draft = {
      ...twoColumnDraft(),
      nutrients: emptyCustomFoodDraft().nutrients,
    }
    const per100 = customFoodDraftInBasis(draft, "100g")
    expect(per100.nutrients.calories).toBe("")
    expect(per100.nutrients.iron).toBe("")
  })

  test("the basis that is already selected is left alone", () => {
    const draft = twoColumnDraft()
    expect(customFoodDraftInBasis(draft, "serving")).toBe(draft)
  })

  test("with no weight to scale from, the numbers carry over as typed", () => {
    // The contract the prefill already has for a row that declares no serving:
    // a catalogue "1 Can" has no weight to convert, so nothing is converted.
    const draft = {
      ...emptyCustomFoodDraft(),
      name: "Coca-Cola Zero",
      servingLabel: "1 Can",
    }
    draft.nutrients = { ...draft.nutrients, calories: "0.3" }

    expect(customFoodDraftBasisGrams(draft)).toBeUndefined()
    expect(customFoodDraftInBasis(draft, "100g").nutrients.calories).toBe("0.3")
  })

  test("the per-100 g basis keeps the packet's serving and converts onto it", () => {
    const typed = customFoodDraftInBasis(twoColumnDraft(), "100g")
    const saved = customFoodSaveArgs({
      ...typed,
      nutrients: {
        ...typed.nutrients,
        calories: "340",
        protein: "17",
        carbs: "68",
        fat: "2",
      },
    })

    // Stored against the packet's own portion, at two decimals, so the per-100 g
    // column comes back out exactly as the label printed it.
    expect(saved.servingLabel).toBe("2 oz (56 g)")
    expect(saved.servingGrams).toBe(56)
    expect(saved.nutrientsPerServing).toMatchObject({
      calories: 190.4,
      protein: 9.52,
      carbs: 38.08,
      fat: 1.12,
      // Micronutrients make the same trip as the macros.
      iron: 2,
    })
  })

  test("a serving named without a weight gets the per-100 g copy instead", () => {
    const typed = {
      ...customFoodDraftInBasis(twoColumnDraft(), "100g"),
      servingLabel: "1 Can",
      servingGrams: "",
    }
    const saved = customFoodSaveArgs(typed)

    // Calling a can 100 g because the numbers are on that basis would be a
    // weight the catalogue never gave us, so the copy says what it is.
    expect(saved.servingLabel).toBe("100 g")
    expect(saved.servingGrams).toBe(100)
    expect(saved.nutrientsPerServing.calories).toBe(339.29)
  })

  test("the serving basis saves exactly what it always saved", () => {
    const saved = customFoodSaveArgs(twoColumnDraft())

    expect(saved.servingLabel).toBe("2 oz (56 g)")
    expect(saved.servingGrams).toBe(56)
    expect(saved.nutrientsPerServing.calories).toBe(190)
  })

  test("a row with no serving weight opens on the per-100 g basis", () => {
    // `foodCardMacros` says per 100 g and means it for these rows, so the sheet
    // opens on the column the numbers are actually in.
    const unweighted = customFoodDraftFromDatabaseFood({
      name: "Coca-Cola Zero",
      servingLabel: "1 Can",
      servingGrams: null,
      calories: 0.3,
      protein: 0,
      carbs: 0,
      fat: 0,
    })
    expect(unweighted.basis).toBe("100g")
    expect(unweighted.servingLabel).toBe("1 Can")

    const weighed = customFoodDraftFromDatabaseFood({
      name: "Spaghetti",
      servingLabel: "2 oz (56 g)",
      servingGrams: 56,
      calories: 339,
      protein: 17.9,
      carbs: 67.9,
      fat: 1.79,
    })
    expect(weighed.basis).toBe("serving")
    expect(weighed.nutrients.calories).toBe("190")

    // A scan result carries the card's own serving text, and the copy is still
    // keyed to the 100 g its numbers are on.
    const scanned = customFoodDraftFromFoodResult({
      name: "Mystery Bar",
      serving: "1 bar",
      calories: 400,
      protein: 5,
      carbs: 40,
      fat: 20,
    })
    expect(scanned.servingLabel).toBe("1 bar")
    expect(scanned.servingGrams).toBe("100")
    expect(scanned.nutrients.calories).toBe("400")
  })
})

function food(id: string, barcode?: string): CustomFood {
  return {
    id,
    name: "Italian Style Meatballs",
    servingLabel: "1 serving (85 g)",
    ...(barcode ? { barcode } : {}),
    nutrientsPerServing: { calories: 240, protein: 13, carbs: 5, fat: 19 },
  }
}
