import { describe, expect, test } from "bun:test"
import {
  applyCorrectedCopy,
  customFoodDraftFromDatabaseFood,
  customFoodDraftInBasis,
  customFoodFromDraft,
  emptyCustomFoodDraft,
  foodLogEntryFromCustomFood,
  type CustomFoodDraft,
} from "@/lib/custom-foods"
import { foodCardMacros, scaledFoodMacros } from "@/lib/food-search-nutrition"
import { scaleFoodForGrams } from "@/lib/food-snap-review"
import type { FoodDetail } from "@repo/models"

/**
 * A US label that prints two columns — Barilla's "Grain & Legume" spaghetti,
 * per 2 oz (56 g) and per 3.5 oz (100 g) — and the barcode row the app held
 * for it. That row was built from the rounded per-serving column (190 kcal and
 * 10 g protein per 56 g), which is why at 193 g the card read 654 kcal and
 * 34.5 g protein where the box's own 100 g column gives 656 and 32.8.
 *
 * The point of this file is the end to end of the remedy: what the card shows
 * before, which basis has to be typed into the correction sheet for every
 * quantity to agree afterwards, and what the card, the diary and a later scan
 * then show.
 */
const BOX = {
  /** The label's per 2 oz (56 g) column, as printed. */
  per56: { calories: 190, protein: 10, carbs: 38, fat: 1 },
  /** The label's per 3.5 oz (100 g) column, as printed. */
  per100: { calories: 340, protein: 17, carbs: 68, fat: 2 },
}

/** The catalogue row the app really held: the per-serving column ÷ 0.56. */
const ROW: FoodDetail = {
  id: "off:spaghetti",
  source: "openfoodfacts",
  code: "0000000000000",
  name: "Spaghetti Grain & Legume Pasta",
  brand: "Barilla",
  serving: "2 oz (56g)",
  servingLabel: "2 oz (56g)",
  servingGrams: 56,
  calories: 339,
  protein: 17.9,
  carbs: 67.9,
  fat: 1.79,
  openFoodFacts: { code: "0000000000000" },
  nutrients: [],
  extraNutrients: [],
}

function draftFrom(values: {
  servingLabel: string
  servingGrams: string
  perServing: { calories: number; protein: number; carbs: number; fat: number }
}): CustomFoodDraft {
  const draft = {
    ...emptyCustomFoodDraft(),
    name: "Spaghetti Grain & Legume Pasta",
    brand: "Barilla",
    barcode: "0000000000000",
    servingLabel: values.servingLabel,
    servingGrams: values.servingGrams,
  }
  draft.nutrients = {
    ...draft.nutrients,
    calories: String(values.perServing.calories),
    protein: String(values.perServing.protein),
    carbs: String(values.perServing.carbs),
    fat: String(values.perServing.fat),
  }
  return draft
}

describe("correcting a two-column label", () => {
  test("before the correction the card agrees with the box only at one serving", () => {
    // The row was derived from the per-serving column, so the box's own serving
    // is exactly reproduced — and the rounded 10 g protein is what makes every
    // other quantity drift high.
    expect(foodCardMacros(ROW)).toMatchObject({
      servingLabel: "2 oz (56g)",
      ...BOX.per56,
    })

    const at193 = scaledFoodMacros(ROW, 193)
    expect(at193).toEqual({
      // displayed 654 / 35 / 131 / 4 on the entry, which rounds each of these
      calories: 654,
      protein: 34.5,
      carbs: 131,
      fat: 3.5,
    })
    // The box's own 100 g column at the same 193 g.
    expect({
      calories: Math.round((BOX.per100.calories * 193) / 100),
      protein: Math.round((BOX.per100.protein * 193) / 100),
      carbs: Math.round((BOX.per100.carbs * 193) / 100),
      fat: Math.round((BOX.per100.fat * 193) / 100),
    }).toEqual({ calories: 656, protein: 33, carbs: 131, fat: 4 })
  })

  test("typing the per-serving column keeps the drift, because that column is rounded", () => {
    // What most people would enter: the numbers next to "Serving size".
    const copy = customFoodFromDraft(
      draftFrom({
        servingLabel: "2 oz (56 g)",
        servingGrams: "56",
        perServing: BOX.per56,
      })
    )
    const corrected = applyCorrectedCopy(ROW, copy)

    // The per-100 g basis is reconstructed from rounded per-serving grams —
    // 10 g protein per 56 g is 17.9 g per 100 g — so the row barely moves.
    expect(corrected.protein).toBe(17.9)
    expect(corrected.calories).toBe(339)
    expect(scaledFoodMacros(corrected, 193).protein).toBe(34.5)
  })

  test("typing the per-100 g column fixes every quantity", () => {
    const copy = customFoodFromDraft(
      draftFrom({
        servingLabel: "3.5 oz (100 g)",
        servingGrams: "100",
        perServing: BOX.per100,
      })
    )
    const corrected = applyCorrectedCopy(ROW, copy)

    // The card rebases to per 100 g, which is the column that is exact.
    expect(corrected).toMatchObject({
      name: "Spaghetti Grain & Legume Pasta",
      servingLabel: "3.5 oz (100 g)",
      serving: "3.5 oz (100 g)",
      servingGrams: 100,
      ...BOX.per100,
    })

    // One serving now reads the box's 100 g column…
    expect(foodCardMacros(corrected)).toMatchObject({
      servingLabel: "3.5 oz (100 g)",
      grams: 100,
      ...BOX.per100,
    })
    // …and so does the 193 g portion that started this, to the box's rounding.
    expect(scaleFoodForGrams(corrected, 193)).toEqual({
      calories: 656,
      protein: 32.8,
      carbs: 131.2,
      fat: 3.9,
    })
    // Nothing else about the row is lost.
    expect(corrected.brand).toBe("Barilla")
    expect(corrected.code).toBe(ROW.code)
  })

  test("the same copy logged from My foods carries the box's serving", () => {
    const copy = customFoodFromDraft(
      draftFrom({
        servingLabel: "3.5 oz (100 g)",
        servingGrams: "100",
        perServing: BOX.per100,
      })
    )
    const entry = foodLogEntryFromCustomFood(copy, {
      meal: "dinner",
      loggedAt: "2026-09-13T00:30:00.000Z",
    })

    expect(entry).toMatchObject({
      calories: BOX.per100.calories,
      protein: BOX.per100.protein,
      carbs: BOX.per100.carbs,
      fat: BOX.per100.fat,
      servingLabel: "1 × 3.5 oz (100 g)",
      servingGrams: 100,
      quantityGrams: 100,
    })
  })

  test("a later scan of the same barcode serves the corrected copy", () => {
    // What the scanner does on the next scan of this packet: the row it just
    // fetched, overlaid with the copy the user saved.
    const copy = customFoodFromDraft(
      draftFrom({
        servingLabel: "3.5 oz (100 g)",
        servingGrams: "100",
        perServing: BOX.per100,
      })
    )
    const rescanned = applyCorrectedCopy(ROW, copy)

    expect(foodCardMacros(rescanned).calories).toBe(340)
    expect(scaleFoodForGrams(rescanned, 56).calories).toBe(190)
    expect(scaleFoodForGrams(rescanned, 100)).toMatchObject(BOX.per100)
  })

  test("the per-100 g toggle takes the label's second column without retyping the serving", () => {
    // The remedy as the sheet now offers it: the prefill arrives on the serving
    // basis, one tap re-keys the numbers to 100 g, and the column the user types
    // is what the card, the diary and every later scan follow.
    const prefill = customFoodDraftFromDatabaseFood({ ...ROW })
    expect(prefill.basis).toBe("serving")
    expect(prefill.servingLabel).toBe("2 oz (56g)")
    expect(prefill.servingGrams).toBe("56")
    expect(prefill.nutrients.calories).toBe("190")

    const per100 = customFoodDraftInBasis(prefill, "100g")
    // Reconstructed from the rounded per-serving numbers, so it opens a calorie
    // under the box's column — which the user is about to type over. The point
    // is that no serving field moved to get here.
    expect(per100.nutrients.calories).toBe("339.29")
    expect(per100.servingLabel).toBe(prefill.servingLabel)
    expect(per100.servingGrams).toBe(prefill.servingGrams)

    const copy = customFoodFromDraft({
      ...per100,
      nutrients: {
        ...per100.nutrients,
        calories: String(BOX.per100.calories),
        protein: String(BOX.per100.protein),
        carbs: String(BOX.per100.carbs),
        fat: String(BOX.per100.fat),
      },
    })
    const corrected = applyCorrectedCopy(ROW, copy)

    // The card keeps the packet's own serving and now carries its exact column.
    expect(corrected).toMatchObject({
      servingLabel: "2 oz (56g)",
      serving: "2 oz (56g)",
      servingGrams: 56,
      ...BOX.per100,
    })
    // One packet serving reads the box's per-2 oz column…
    expect(foodCardMacros(corrected)).toMatchObject({
      servingLabel: "2 oz (56g)",
      grams: 56,
      calories: 190,
      protein: 9.5,
      carbs: 38.1,
      fat: 1.1,
    })
    // …and the 193 g portion that started all of this matches the 100 g column.
    expect(scaleFoodForGrams(corrected, 193)).toEqual({
      calories: 656,
      protein: 32.8,
      carbs: 131.2,
      fat: 3.9,
    })
    // Logged from My foods, one serving is the packet's own 190 kcal row.
    expect(
      foodLogEntryFromCustomFood(copy, { meal: "dinner" })
    ).toMatchObject({
      calories: 190,
      protein: 9.52,
      carbs: 38.08,
      fat: 1.12,
      servingLabel: "1 × 2 oz (56g)",
      servingGrams: 56,
      quantityGrams: 56,
    })
  })
})
