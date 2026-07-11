import { describe, expect, test } from "bun:test"
import { buildQuickRepeatFoods, type FoodLogDay } from "../food-quick-repeat"

function day(date: string, ...entries: FoodLogDay["entries"]): FoodLogDay {
  return { date, entries }
}

function food(
  id: string,
  name: string,
  loggedAt: string,
  overrides: Partial<FoodLogDay["entries"][number]> = {}
) {
  return {
    id,
    name,
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 2,
    loggedAt,
    meal: "lunch",
    ...overrides,
  }
}

describe("quick repeat foods", () => {
  test("ranks frequent foods while retaining the latest logged portion", () => {
    const foods = buildQuickRepeatFoods([
      day(
        "2026-07-10",
        food("yogurt-latest", "Greek yogurt", "2026-07-10T09:00:00.000Z", {
          foodCode: "yogurt",
          quantityGrams: 170,
          calories: 180,
        }),
        food("banana", "Banana", "2026-07-10T08:00:00.000Z")
      ),
      day(
        "2026-07-09",
        food("yogurt-earlier", "Greek yogurt", "2026-07-09T09:00:00.000Z", {
          foodCode: "yogurt",
          quantityGrams: 100,
        }),
        food("eggs", "Eggs", "2026-07-09T08:00:00.000Z")
      ),
      day(
        "2026-07-08",
        food("yogurt-oldest", "Greek yogurt", "2026-07-08T09:00:00.000Z", {
          foodCode: "yogurt",
        })
      ),
    ])

    expect(foods.map((item) => [item.entry.name, item.count])).toEqual([
      ["Greek yogurt", 3],
      ["Banana", 1],
      ["Eggs", 1],
    ])
    expect(foods[0]?.entry.quantityGrams).toBe(170)
    expect(foods[0]?.entry.calories).toBe(180)
  })

  test("keeps distinct portions of foods without a product code distinct", () => {
    const foods = buildQuickRepeatFoods([
      day(
        "2026-07-10",
        food("oats-small", "Oats", "2026-07-10T08:00:00.000Z", {
          quantityGrams: 40,
        }),
        food("oats-large", "Oats", "2026-07-10T07:00:00.000Z", {
          quantityGrams: 80,
          calories: 200,
        })
      ),
    ])

    expect(foods).toHaveLength(2)
  })

  test("caps the compact rail without mutating the source entries", () => {
    const source = day(
      "2026-07-10",
      food("one", "One", "2026-07-10T04:00:00.000Z"),
      food("two", "Two", "2026-07-10T03:00:00.000Z"),
      food("three", "Three", "2026-07-10T02:00:00.000Z")
    )

    expect(
      buildQuickRepeatFoods([source], 2).map((item) => item.entry.name)
    ).toEqual(["One", "Two"])
    expect(source.entries).toHaveLength(3)
  })
})
