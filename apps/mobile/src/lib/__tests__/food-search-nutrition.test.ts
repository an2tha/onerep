import { describe, expect, test } from "bun:test"
import { scaledFoodMacros } from "../food-search-nutrition"

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
})
