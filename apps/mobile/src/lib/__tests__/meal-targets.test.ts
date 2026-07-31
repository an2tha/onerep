import { describe, expect, test } from "bun:test"
import {
  DEFAULT_MEAL_SHARES,
  mealTargetProgress,
  normalizeMealShares,
  resolveMealCalorieTargets,
} from "@/lib/meal-targets"

const DEFAULTS = ["breakfast", "lunch", "dinner", "snack"]

const sum = (shares: { percent: number }[]) =>
  shares.reduce((total, share) => total + share.percent, 0)

describe("normalizeMealShares", () => {
  test("the shipped default split already sums to 100", () => {
    expect(sum(DEFAULT_MEAL_SHARES)).toBe(100)
  })

  test("drops shares for meals that no longer exist", () => {
    const shares = normalizeMealShares(
      [
        { meal: "breakfast", percent: 50 },
        { meal: "deleted_category_123", percent: 50 },
      ],
      DEFAULTS
    )
    expect(shares.map((s) => s.meal)).toEqual(DEFAULTS)
    expect(shares.find((s) => s.meal === "breakfast")?.percent).toBe(100)
  })

  test("adds newly created meals at zero", () => {
    const shares = normalizeMealShares(
      [{ meal: "breakfast", percent: 100 }],
      [...DEFAULTS, "post_workout_1730000000"]
    )
    const added = shares.find((s) => s.meal === "post_workout_1730000000")
    expect(added).toBeDefined()
    expect(added?.percent).toBe(0)
  })

  test("percentages summing to 87 are rescaled to exactly 100", () => {
    const shares = normalizeMealShares(
      [
        { meal: "breakfast", percent: 20 },
        { meal: "lunch", percent: 30 },
        { meal: "dinner", percent: 30 },
        { meal: "snack", percent: 7 },
      ],
      DEFAULTS
    )
    expect(sum(shares)).toBeCloseTo(100, 10)
  })

  test("all-zero shares fall back to an even split", () => {
    const shares = normalizeMealShares(
      DEFAULTS.map((meal) => ({ meal, percent: 0 })),
      DEFAULTS
    )
    expect(sum(shares)).toBeCloseTo(100, 10)
    for (const share of shares) expect(share.percent).toBeCloseTo(25, 10)
  })

  test("negative and non-finite percentages are treated as zero", () => {
    const shares = normalizeMealShares(
      [
        { meal: "breakfast", percent: -50 },
        { meal: "lunch", percent: Number.NaN },
        { meal: "dinner", percent: Number.POSITIVE_INFINITY },
        { meal: "snack", percent: 40 },
      ],
      DEFAULTS
    )
    expect(shares.find((s) => s.meal === "snack")?.percent).toBe(100)
    expect(shares.find((s) => s.meal === "breakfast")?.percent).toBe(0)
  })

  test("undefined shares fall back to an even split rather than throwing", () => {
    expect(sum(normalizeMealShares(undefined, DEFAULTS))).toBeCloseTo(100, 10)
    expect(sum(normalizeMealShares(null, DEFAULTS))).toBeCloseTo(100, 10)
  })

  test("no known meals yields no shares", () => {
    expect(normalizeMealShares(DEFAULT_MEAL_SHARES, [])).toEqual([])
    expect(normalizeMealShares(DEFAULT_MEAL_SHARES, undefined as never)).toEqual(
      []
    )
  })

  test("duplicate known meal ids collapse to one share", () => {
    const shares = normalizeMealShares(DEFAULT_MEAL_SHARES, [
      "breakfast",
      "breakfast",
      "lunch",
    ])
    expect(shares.map((s) => s.meal)).toEqual(["breakfast", "lunch"])
  })

  test("an arbitrary custom category id round-trips", () => {
    const custom = "post_workout_1730000000"
    const shares = normalizeMealShares(
      [{ meal: custom, percent: 100 }],
      [custom]
    )
    expect(shares).toEqual([{ meal: custom, percent: 100 }])
  })
})

describe("resolveMealCalorieTargets", () => {
  test("the parts add up to the day's calories exactly", () => {
    const targets = resolveMealCalorieTargets(
      normalizeMealShares(DEFAULT_MEAL_SHARES, DEFAULTS),
      2000
    )
    expect(targets.reduce((t, m) => t + m.calories, 0)).toBe(2000)
  })

  test("largest-remainder rounding handles an indivisible split", () => {
    // 3 meals at 33.33% of 2000 must be 667/667/666, not 3 x 666.
    const meals = ["breakfast", "lunch", "dinner"]
    const targets = resolveMealCalorieTargets(
      normalizeMealShares(undefined, meals),
      2000
    )
    expect(targets.reduce((t, m) => t + m.calories, 0)).toBe(2000)
    expect(targets.map((m) => m.calories).sort()).toEqual([666, 667, 667])
  })

  test("a zero calorie goal yields zeroed targets, not NaN", () => {
    const targets = resolveMealCalorieTargets(
      normalizeMealShares(DEFAULT_MEAL_SHARES, DEFAULTS),
      0
    )
    expect(targets.reduce((t, m) => t + m.calories, 0)).toBe(0)
    for (const target of targets) expect(target.calories).toBe(0)
  })

  test("a non-finite calorie goal is treated as zero", () => {
    const shares = normalizeMealShares(DEFAULT_MEAL_SHARES, DEFAULTS)
    expect(resolveMealCalorieTargets(shares, Number.NaN)[0].calories).toBe(0)
    expect(resolveMealCalorieTargets(shares, -500)[0].calories).toBe(0)
  })

  test("no shares yields no targets", () => {
    expect(resolveMealCalorieTargets([], 2000)).toEqual([])
  })
})

describe("mealTargetProgress", () => {
  test("within 10% either way counts as on track", () => {
    expect(mealTargetProgress(500, 500).state).toBe("on-track")
    expect(mealTargetProgress(455, 500).state).toBe("on-track")
    expect(mealTargetProgress(548, 500).state).toBe("on-track")
  })

  test("outside the band reports under and over", () => {
    expect(mealTargetProgress(200, 500).state).toBe("under")
    expect(mealTargetProgress(900, 500).state).toBe("over")
  })

  test("the ratio is clamped so a wild overshoot still renders", () => {
    expect(mealTargetProgress(50_000, 500).ratio).toBe(2)
  })

  test("an empty meal with no budget is not flagged as over", () => {
    expect(mealTargetProgress(0, 0)).toEqual({ ratio: 0, state: "under" })
  })

  test("logging into a meal with no budget reads as over", () => {
    expect(mealTargetProgress(300, 0).state).toBe("over")
  })

  test("negative and non-finite intake is treated as zero", () => {
    expect(mealTargetProgress(Number.NaN, 500).ratio).toBe(0)
    expect(mealTargetProgress(-100, 500).ratio).toBe(0)
  })
})
