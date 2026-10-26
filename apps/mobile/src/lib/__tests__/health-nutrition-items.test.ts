import { describe, expect, test } from "bun:test"
import {
  healthStoreMeal,
  toHealthNutritionItems,
} from "../health-nutrition-items"

describe("meal vocabulary", () => {
  test("the four meals both stores know are passed through", () => {
    expect(healthStoreMeal("breakfast")).toBe("breakfast")
    expect(healthStoreMeal("lunch")).toBe("lunch")
    expect(healthStoreMeal("dinner")).toBe("dinner")
    expect(healthStoreMeal("snack")).toBe("snack")
  })

  test("the app's own snack ids are snacks, not breakfasts", () => {
    // `snack-post-breakfast` is the default 10:00 meal: a naive substring match
    // would file it as breakfast, which is the kind of quiet wrongness a health
    // record should never carry.
    expect(healthStoreMeal("snack-post-breakfast")).toBe("snack")
    expect(healthStoreMeal("snack-post-lunch")).toBe("snack")
    expect(healthStoreMeal("snack-post-dinner")).toBe("snack")
  })

  test("a meal nobody has heard of is unknown, not guessed at", () => {
    expect(healthStoreMeal("second-breakfast")).toBe("unknown")
    expect(healthStoreMeal("Elevenses")).toBe("unknown")
    expect(healthStoreMeal("")).toBe("unknown")
    expect(healthStoreMeal(undefined)).toBe("unknown")
  })

  test("case and surrounding space do not change the answer", () => {
    expect(healthStoreMeal(" Lunch ")).toBe("lunch")
    expect(healthStoreMeal("DINNER")).toBe("dinner")
  })
})

describe("food entries become store records", () => {
  test("each item keeps its name, meal and time", () => {
    const items = toHealthNutritionItems([
      {
        id: "e1",
        name: "Greek yoghurt",
        loggedAt: "2026-10-16T08:12:00.000Z",
        meal: "breakfast",
        calories: 180,
        protein: 17,
        carbs: 9,
        fat: 6,
      },
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: "e1",
      name: "Greek yoghurt",
      loggedAt: "2026-10-16T08:12:00.000Z",
      meal: "breakfast",
      calories: 180,
      protein: 17,
      carbs: 9,
      fat: 6,
    })
  })

  test("an entry with nothing in it is not filed as a food", () => {
    expect(
      toHealthNutritionItems([{ id: "e2", meal: "lunch" }])
    ).toHaveLength(0)
    expect(
      toHealthNutritionItems([{ id: "e3", name: "   ", calories: 0 }])
    ).toHaveLength(0)
  })

  test("a nameless entry with numbers still gets a legible name", () => {
    const items = toHealthNutritionItems([
      { id: "e4", calories: 90, meal: "snack" },
    ])
    expect(items[0]?.name).toBe("Logged food")
  })

  test("values are whole numbers, and nonsense reads as zero", () => {
    const items = toHealthNutritionItems([
      {
        id: "e5",
        name: "Toast",
        calories: 120.4,
        protein: -3,
        carbs: Number.NaN,
        fat: 5.6,
      },
    ])
    expect(items[0]).toMatchObject({
      calories: 120,
      protein: 0,
      carbs: 0,
      fat: 6,
    })
  })

  test("an entry with no id still gets a stable one", () => {
    const [first] = toHealthNutritionItems([
      { name: "Chicken & rice", calories: 500 },
    ])
    const [again] = toHealthNutritionItems([
      { name: "Chicken & rice", calories: 500 },
    ])
    expect(first?.id).toBe("chicken-rice-0")
    expect(again?.id).toBe(first?.id)
  })

  test("a day keeps its order and misses nothing", () => {
    const items = toHealthNutritionItems([
      { id: "a", name: "Oats", calories: 300, meal: "breakfast" },
      { id: "b", name: "Apple", calories: 80, meal: "snack-post-lunch" },
      { id: "c", name: "", calories: 0, protein: 0, carbs: 0, fat: 0 },
      { id: "d", name: "Curry", calories: 700, meal: "dinner" },
    ])
    expect(items.map((item) => item.name)).toEqual(["Oats", "Apple", "Curry"])
    expect(items.map((item) => item.meal)).toEqual([
      "breakfast",
      "snack",
      "dinner",
    ])
  })
})
