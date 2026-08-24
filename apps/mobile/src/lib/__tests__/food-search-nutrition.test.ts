import { describe, expect, test } from "bun:test"
import { foodCardMacros, scaledFoodMacros } from "../food-search-nutrition"

const food = {
  calories: 120,
  protein: 12,
  carbs: 15,
  fat: 4,
}

describe("food search nutrition", () => {
  test("uses loaded detail nutrients instead of stale search-card macros", () => {
    const detail = {
      nutrients: [
        { key: "energy", per100g: 132, name: "Calories", unit: "kcal" },
        { key: "protein", per100g: 13.25, name: "Protein", unit: "g" },
        { key: "carbs", per100g: 14.44, name: "Carbs", unit: "g" },
        { key: "fat", per100g: 0, name: "Fat", unit: "g" },
      ],
    } as never

    expect(scaledFoodMacros(food, 150, detail)).toEqual({
      calories: 198,
      protein: 19.9,
      carbs: 21.7,
      fat: 0,
    })
  })

  test("keeps search-card values as a fallback before detail is available", () => {
    expect(scaledFoodMacros(food, 50)).toEqual({
      calories: 60,
      protein: 6,
      carbs: 7.5,
      fat: 2,
    })
  })

  test("a card quotes the serving it names, not a hidden 100 g", () => {
    const card = foodCardMacros({
      ...food,
      id: "1",
      source: "openfoodfacts",
      name: "Oat Bar",
      serving: "1 bar (30 g)",
      servingGrams: 30,
      servingLabel: "1 bar (30 g)",
    } as never)

    expect(card).toEqual({
      grams: 30,
      servingLabel: "1 bar (30 g)",
      calories: 36,
      protein: 3.6,
      carbs: 4.5,
      fat: 1.2,
    })
  })

  test("a product with no serving of its own falls back to 100 g, and says so", () => {
    const card = foodCardMacros({
      ...food,
      id: "2",
      source: "openfoodfacts",
      name: "Loose Oats",
      serving: "100 g",
    } as never)

    expect(card).toEqual({
      grams: 100,
      servingLabel: "100 g",
      calories: 120,
      protein: 12,
      carbs: 15,
      fat: 4,
    })
  })
})
