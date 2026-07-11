import { describe, expect, test } from "bun:test"
import {
  buildProgressDateRange,
  buildProgressSummary,
} from "../progress-summary"

describe("buildProgressDateRange", () => {
  test("creates seven calendar days ending on the supplied date", () => {
    expect(buildProgressDateRange("2026-07-10")).toEqual([
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ])
  })
})

describe("buildProgressSummary", () => {
  test("groups nutrition and multiple workout logs by calendar day", () => {
    const summary = buildProgressSummary({
      today: "2026-07-10",
      caloriesTarget: 2000,
      proteinTarget: 150,
      foodLogs: [
        {
          date: "2026-07-08",
          entries: [
            { calories: 900, protein: 65, carbs: 100, fat: 30 },
            { calories: 950, protein: 80, carbs: 110, fat: 25 },
          ],
        },
        {
          date: "2026-07-10",
          entries: [{ calories: 2200, protein: 140, carbs: 230, fat: 70 }],
        },
      ],
      workoutLogs: [
        {
          date: "2026-07-08",
          durationSeconds: 1800,
          exercises: [{ sets: [{ completed: true }, { completed: false }] }],
        },
        {
          date: "2026-07-08",
          durationSeconds: 1200,
          exercises: [{ sets: [{ completed: true }, { completed: true }] }],
        },
      ],
      bodyMeasurements: [],
    })

    const wednesday = summary.days.find((day) => day.date === "2026-07-08")
    expect(wednesday?.nutrition.calories).toBe(1850)
    expect(wednesday?.nutrition.protein).toBe(145)
    expect(wednesday?.training).toEqual({
      workouts: 2,
      completedSets: 3,
      durationMinutes: 50,
    })
    expect(summary.nutrition.loggedDays).toBe(2)
    expect(summary.nutrition.calorieTargetDays).toBe(2)
    expect(summary.nutrition.proteinTargetDays).toBe(2)
    expect(summary.training).toEqual({
      workouts: 2,
      activeDays: 1,
      completedSets: 3,
      durationMinutes: 50,
    })
  })

  test("keeps the latest twelve valid weight measurements in date order", () => {
    const summary = buildProgressSummary({
      today: "2026-07-10",
      caloriesTarget: 2000,
      proteinTarget: 150,
      foodLogs: [],
      workoutLogs: [],
      bodyMeasurements: [
        { loggedAt: "2026-06-01", weightKg: 80, bodyFatPct: 20 },
        { loggedAt: "2026-06-08", weightKg: Number.NaN },
        { loggedAt: "2026-06-15", weightKg: 79.4 },
        { loggedAt: "2026-06-22", weightKg: 79.1, bodyFatPct: 19.4 },
      ],
    })

    expect(summary.body.latestWeightKg).toBe(79.1)
    expect(summary.body.latestBodyFatPct).toBe(19.4)
    expect(summary.body.weightDeltaKg).toBeCloseTo(-0.9)
    expect(summary.body.weightPoints).toEqual([
      { date: "2026-06-01", weightKg: 80 },
      { date: "2026-06-15", weightKg: 79.4 },
      { date: "2026-06-22", weightKg: 79.1 },
    ])
  })
})
