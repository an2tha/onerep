import { describe, expect, test } from "bun:test"
import {
  carbLabel,
  carbLabelLong,
  carbLabelLower,
  displayCarbGoal,
  displayCarbs,
  ingredientCarbSource,
  netCarbs,
  sumDisplayCarbs,
} from "@/lib/carb-display"

describe("netCarbs", () => {
  test("subtracts fiber from carbs", () => {
    expect(netCarbs({ carbs: 20, fiber: 7 })).toBe(13)
  })

  test("clamps to zero when fiber exceeds carbs", () => {
    expect(netCarbs({ carbs: 5, fiber: 9 })).toBe(0)
  })

  test("treats a missing fiber value as zero fiber", () => {
    expect(netCarbs({ carbs: 20 })).toBe(20)
    expect(netCarbs({ carbs: 20, fiber: null })).toBe(20)
  })

  test("non-finite and negative values are ignored", () => {
    expect(netCarbs({ carbs: Number.NaN, fiber: 5 })).toBe(0)
    expect(netCarbs({ carbs: Number.POSITIVE_INFINITY, fiber: 5 })).toBe(0)
    expect(netCarbs({ carbs: -30, fiber: 5 })).toBe(0)
    expect(netCarbs({ carbs: 20, fiber: -5 })).toBe(20)
    expect(netCarbs({ carbs: 20, fiber: Number.NaN })).toBe(20)
  })

  test("an empty source is zero", () => {
    expect(netCarbs({})).toBe(0)
  })
})

describe("displayCarbs", () => {
  test("total mode ignores fiber entirely", () => {
    expect(displayCarbs({ carbs: 20, fiber: 7 }, "total")).toBe(20)
  })

  test("net mode subtracts fiber", () => {
    expect(displayCarbs({ carbs: 20, fiber: 7 }, "net")).toBe(13)
  })

  test("total mode still sanitises bad carb values", () => {
    expect(displayCarbs({ carbs: Number.NaN }, "total")).toBe(0)
    expect(displayCarbs({ carbs: -12 }, "total")).toBe(0)
  })
})

describe("carb labels", () => {
  test("switch with the mode", () => {
    expect(carbLabel("total")).toBe("Carbs")
    expect(carbLabel("net")).toBe("Net carbs")
    expect(carbLabelLower("total")).toBe("carbs")
    expect(carbLabelLower("net")).toBe("net carbs")
    expect(carbLabelLong("total")).toBe("Carbs")
    expect(carbLabelLong("net")).toContain("fiber")
  })
})

describe("sumDisplayCarbs", () => {
  const entries = [
    { carbs: 30, fiber: 5 },
    { carbs: 20 },
    { carbs: 10, fiber: 4 },
  ]

  test("sums totals in total mode", () => {
    expect(sumDisplayCarbs(entries, "total")).toBe(60)
  })

  test("sums net values in net mode", () => {
    expect(sumDisplayCarbs(entries, "net")).toBe(51)
  })

  test("a fiber-heavy entry clamps on its own without eating other entries", () => {
    // 2 - 9 would be -7 if summed as totals; per-entry clamping keeps it at 0.
    const totals = sumDisplayCarbs([{ carbs: 2, fiber: 9 }, { carbs: 30 }], "net")
    expect(totals).toBe(30)
  })

  test("empty and non-array inputs are zero", () => {
    expect(sumDisplayCarbs([], "net")).toBe(0)
    expect(sumDisplayCarbs(undefined as never, "net")).toBe(0)
  })
})

describe("ingredientCarbSource", () => {
  test("scales per-100g nutrients by grams", () => {
    const source = ingredientCarbSource({
      grams: 200,
      carbsPer100: 30,
      fiberPer100: 5,
    })
    expect(source.carbs).toBe(60)
    expect(source.fiber).toBe(10)
    expect(netCarbs(source)).toBe(50)
  })

  test("missing grams yields zero rather than NaN", () => {
    const source = ingredientCarbSource({ carbsPer100: 30 })
    expect(source.carbs).toBe(0)
    expect(source.fiber).toBe(0)
  })
})

describe("displayCarbGoal", () => {
  test("total mode passes the goal through", () => {
    expect(displayCarbGoal(200, 30, "total")).toBe(200)
  })

  test("net mode subtracts the fiber target", () => {
    expect(displayCarbGoal(200, 30, "net")).toBe(170)
  })

  test("net mode with no fiber target leaves the goal unchanged", () => {
    expect(displayCarbGoal(200, undefined, "net")).toBe(200)
    expect(displayCarbGoal(200, null, "net")).toBe(200)
  })

  test("never returns a negative goal", () => {
    expect(displayCarbGoal(20, 50, "net")).toBe(0)
  })
})
