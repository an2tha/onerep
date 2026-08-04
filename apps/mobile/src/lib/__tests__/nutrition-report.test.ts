import { describe, expect, test } from "bun:test"
import {
  buildNutritionReport,
  enumerateDateKeys,
  macroSplitFromTotals,
  reportRangeBounds,
  sumEntryTotals,
  type ReportDayLog,
} from "@/lib/nutrition-report"
import type { FoodLogEntry } from "@/lib/food-log"

function entry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: overrides.id ?? "entry-1",
    name: "Oats",
    calories: 300,
    protein: 10,
    carbs: 50,
    fat: 5,
    meal: "breakfast",
    loggedAt: "2026-07-30T08:00:00.000Z",
    ...overrides,
  }
}

const logs: ReportDayLog[] = [
  {
    date: "2026-07-29",
    entries: [
      entry(),
      entry({
        id: "e2",
        name: "Chicken",
        meal: "lunch",
        calories: 500,
        protein: 45,
        carbs: 10,
        fat: 15,
        fiber: 3,
      }),
    ],
  },
  { date: "2026-07-31", entries: [entry({ id: "e3" })] },
]

describe("range helpers", () => {
  test("a 7-day range ends on the given day and spans 7 keys", () => {
    const bounds = reportRangeBounds("2026-07-31", "7d")
    expect(bounds).toEqual({ start: "2026-07-25", end: "2026-07-31" })
    expect(enumerateDateKeys(bounds.start, bounds.end)).toHaveLength(7)
  })

  test("a reversed range yields nothing rather than looping", () => {
    expect(enumerateDateKeys("2026-07-31", "2026-07-25")).toEqual([])
  })
})

describe("totals", () => {
  test("non-finite and negative values are ignored", () => {
    const totals = sumEntryTotals([
      entry({ calories: Number.NaN, protein: -5 }),
      entry({ id: "e2" }),
    ])
    expect(totals).toEqual({
      calories: 300,
      protein: 10,
      carbs: 100,
      fat: 10,
      netCarbs: 100,
    })
  })

  test("net carbs subtract fiber per entry and clamp at zero", () => {
    const totals = sumEntryTotals([
      entry({ id: "e1", carbs: 50, fiber: 10 }),
      // More fiber than carbs: this entry contributes 0, it does not go negative
      // and eat into the other entry's net carbs.
      entry({ id: "e2", carbs: 5, fiber: 20 }),
    ])
    expect(totals.carbs).toBe(55)
    expect(totals.netCarbs).toBe(40)
  })

  test("entries without fiber have net carbs equal to total carbs", () => {
    const totals = sumEntryTotals([entry({ carbs: 42 })])
    expect(totals.netCarbs).toBe(42)
  })

  test("macro split uses 4/4/9 and sums to about 100", () => {
    const split = macroSplitFromTotals({
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 60,
    })
    expect(split.protein + split.carbs + split.fat).toBeGreaterThan(99)
    // 600 / 800 / 540 kcal from protein / carbs / fat.
    expect(split).toEqual({ protein: 31, carbs: 41, fat: 28 })
  })

  test("an empty day has a zeroed split rather than NaN", () => {
    expect(
      macroSplitFromTotals({ calories: 0, protein: 0, carbs: 0, fat: 0 })
    ).toEqual({ protein: 0, carbs: 0, fat: 0 })
  })
})

describe("report", () => {
  const report = buildNutritionReport({
    start: "2026-07-29",
    end: "2026-07-31",
    logs,
    goals: { calories: 800, protein: 150, carbs: 200, fat: 60 },
  })

  test("unlogged days appear in the range but not in the averages", () => {
    expect(report.daysInRange).toBe(3)
    expect(report.daysLogged).toBe(2)
    expect(report.days.find((day) => day.date === "2026-07-30")?.logged).toBe(
      false
    )
    expect(report.averagesPerLoggedDay.calories).toBe(550)
    expect(report.averages.calories).toBe(367)
  })

  test("logging rate reflects the whole range", () => {
    expect(report.loggingRate).toBeCloseTo(2 / 3, 5)
  })

  test("meals are ranked by calories and carry their share", () => {
    expect(report.meals[0]?.meal).toBe("breakfast")
    expect(
      report.meals.reduce((sum, meal) => sum + meal.shareOfCalories, 0)
    ).toBeCloseTo(100, 0)
  })

  test("goal adherence classifies days with a 10% tolerance", () => {
    // Day one is 800 kcal (on target), day three is 300 (under).
    expect(report.goalAdherence).toMatchObject({
      daysOnTarget: 1,
      daysUnder: 1,
      daysOver: 0,
    })
  })

  test("micronutrients average over logged days only", () => {
    expect(report.micros.fiber).toBe(3)
    expect(report.microAverages.fiber).toBe(1.5)
  })

  test("top foods count repeats across days", () => {
    expect(report.topFoods[0]).toMatchObject({ name: "Oats", count: 2 })
  })

  test("without a calorie goal there is no adherence section", () => {
    const noGoals = buildNutritionReport({
      start: "2026-07-29",
      end: "2026-07-31",
      logs,
    })
    expect(noGoals.goalAdherence).toBeUndefined()
    expect(noGoals.days.every((day) => day.goalRatio === undefined)).toBe(true)
  })

  test("an empty range still produces a well-formed report", () => {
    const empty = buildNutritionReport({
      start: "2026-07-29",
      end: "2026-07-31",
      logs: [],
    })
    expect(empty.daysLogged).toBe(0)
    expect(empty.loggingRate).toBe(0)
    expect(empty.averagesPerLoggedDay.calories).toBe(0)
    expect(empty.meals).toEqual([])
    expect(empty.topFoods).toEqual([])
  })
})
