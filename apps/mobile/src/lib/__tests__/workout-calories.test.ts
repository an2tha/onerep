import { describe, test, expect } from "bun:test"
import {
  estimateWorkoutCalories,
  totalDayWorkoutCalories,
  adjustedCalorieTarget,
  MET_BY_CATEGORY,
} from "../workout-calories"

describe("MET_BY_CATEGORY", () => {
  test("has entries for all standard categories", () => {
    expect(MET_BY_CATEGORY.strength).toBeGreaterThan(0)
    expect(MET_BY_CATEGORY.cardio).toBeGreaterThan(0)
    expect(MET_BY_CATEGORY.mobility).toBeGreaterThan(0)
    expect(MET_BY_CATEGORY.core).toBeGreaterThan(0)
  })

  test("cardio MET is higher than strength MET", () => {
    expect(MET_BY_CATEGORY.cardio).toBeGreaterThan(MET_BY_CATEGORY.strength)
  })

  test("mobility MET is lower than strength MET", () => {
    expect(MET_BY_CATEGORY.mobility).toBeLessThan(MET_BY_CATEGORY.strength)
  })
})

describe("estimateWorkoutCalories", () => {
  test("returns 0 for zero duration", () => {
    expect(estimateWorkoutCalories({ durationSeconds: 0, weightKg: 80 })).toBe(0)
  })

  test("returns 0 for negative duration", () => {
    expect(estimateWorkoutCalories({ durationSeconds: -60, weightKg: 80 })).toBe(0)
  })

  test("uses default weight (75 kg) when weightKg is missing", () => {
    // 1 hour strength at 75 kg: 5.0 × 75 × 1 = 375
    const result = estimateWorkoutCalories({ durationSeconds: 3600, category: "strength" })
    expect(result).toBe(375)
  })

  test("uses default weight when weightKg is 0", () => {
    const withZero = estimateWorkoutCalories({ durationSeconds: 3600, category: "strength", weightKg: 0 })
    const withDefault = estimateWorkoutCalories({ durationSeconds: 3600, category: "strength" })
    expect(withZero).toBe(withDefault)
  })

  test("uses default MET when category is unknown", () => {
    // Default MET is 5.0 (strength), weight 75 kg, 1 hour = 375
    const result = estimateWorkoutCalories({ durationSeconds: 3600, category: "unknown", weightKg: 75 })
    expect(result).toBe(375)
  })

  test("uses default MET when category is omitted", () => {
    const result = estimateWorkoutCalories({ durationSeconds: 3600, weightKg: 75 })
    expect(result).toBe(375)
  })

  test("scales linearly with duration", () => {
    const half = estimateWorkoutCalories({ durationSeconds: 1800, category: "strength", weightKg: 80 })
    const full = estimateWorkoutCalories({ durationSeconds: 3600, category: "strength", weightKg: 80 })
    // Due to rounding, allow ±1 kcal tolerance
    expect(Math.abs(full - half * 2)).toBeLessThanOrEqual(1)
  })

  test("scales linearly with body weight", () => {
    const light = estimateWorkoutCalories({ durationSeconds: 3600, category: "strength", weightKg: 60 })
    const heavy = estimateWorkoutCalories({ durationSeconds: 3600, category: "strength", weightKg: 90 })
    // 60 kg → 300 kcal, 90 kg → 450 kcal (ratio 1.5)
    expect(light).toBe(300)
    expect(heavy).toBe(450)
  })

  test("cardio burns more than strength for same weight/duration", () => {
    const strength = estimateWorkoutCalories({ durationSeconds: 3600, category: "strength", weightKg: 75 })
    const cardio = estimateWorkoutCalories({ durationSeconds: 3600, category: "cardio", weightKg: 75 })
    expect(cardio).toBeGreaterThan(strength)
  })

  test("returns a positive integer (rounded)", () => {
    const result = estimateWorkoutCalories({ durationSeconds: 2700, category: "mobility", weightKg: 70 })
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBeGreaterThan(0)
  })

  test("30-minute strength session at 80 kg is correct", () => {
    // 5.0 × 80 × (1800/3600) = 5.0 × 80 × 0.5 = 200
    expect(estimateWorkoutCalories({ durationSeconds: 1800, category: "strength", weightKg: 80 })).toBe(200)
  })
})

describe("totalDayWorkoutCalories", () => {
  test("returns 0 for empty sessions", () => {
    expect(totalDayWorkoutCalories([])).toBe(0)
  })

  test("sums calories from multiple sessions", () => {
    const sessions = [
      { durationSeconds: 1800, category: "strength", weightKg: 80 }, // 200
      { durationSeconds: 1800, category: "cardio",   weightKg: 80 }, // 320
    ]
    expect(totalDayWorkoutCalories(sessions)).toBe(520)
  })

  test("single session equals estimateWorkoutCalories", () => {
    const single = { durationSeconds: 3000, category: "core", weightKg: 75 }
    expect(totalDayWorkoutCalories([single])).toBe(estimateWorkoutCalories(single))
  })
})

describe("adjustedCalorieTarget", () => {
  test("adds burned calories to base target", () => {
    expect(adjustedCalorieTarget(2000, 300)).toBe(2300)
  })

  test("does not go below the default floor (1200)", () => {
    expect(adjustedCalorieTarget(500, 0)).toBe(1200)
  })

  test("respects custom floor", () => {
    expect(adjustedCalorieTarget(800, 0, 1000)).toBe(1000)
  })

  test("returns base + burned when result is above floor", () => {
    expect(adjustedCalorieTarget(1800, 500, 1200)).toBe(2300)
  })

  test("exactly at floor returns floor", () => {
    expect(adjustedCalorieTarget(1200, 0)).toBe(1200)
  })
})
