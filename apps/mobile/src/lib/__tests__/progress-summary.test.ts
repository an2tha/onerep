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
    expect(summary.training).toMatchObject({
      workouts: 2,
      activeDays: 1,
      completedSets: 3,
      durationMinutes: 50,
      averageSetsPerWorkout: 1.5,
      previousWorkouts: 0,
      previousCompletedSets: 0,
      workoutChange: 2,
      completedSetChange: 3,
    })
    expect(summary.nutrition.previousLoggedDays).toBe(0)
    expect(summary.nutrition.calorieDeltaFromTarget).toBe(25)
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
    expect(summary.body.weeklyWeightDeltaKg).toBeCloseTo(-0.3)
    expect(summary.body.weightTrendDays).toBeCloseTo(21)
    expect(summary.body.latestCheckInDate).toBe("2026-06-22")
    expect(summary.body.bodyFatDeltaPct).toBeCloseTo(-0.6)
    expect(summary.body.weightPoints).toEqual([
      { date: "2026-06-01", weightKg: 80 },
      { date: "2026-06-15", weightKg: 79.4 },
      { date: "2026-06-22", weightKg: 79.1 },
    ])
  })
})

describe("buildProgressSummary body measurements", () => {
  const base = {
    today: "2026-07-10",
    caloriesTarget: 2000,
    proteinTarget: 150,
    foodLogs: [],
    workoutLogs: [],
  }

  test("lists only the measurements that have a reading, in catalogue order", () => {
    const summary = buildProgressSummary({
      ...base,
      bodyMeasurements: [
        {
          loggedAt: "2026-07-01",
          weightKg: 80,
          leanBodyMassKg: 62,
          thighsCm: 58,
        },
        {
          loggedAt: "2026-07-09",
          weightKg: 79,
          leanBodyMassKg: 62.8,
          basalMetabolicRateKcal: 1710,
          hipsCm: 96,
          thighsCm: 57.5,
        },
      ],
    })

    expect(summary.body.measurements.map((m) => m.key)).toEqual([
      "leanBodyMassKg",
      "basalMetabolicRateKcal",
      "hipsCm",
      "thighsCm",
    ])
  })

  test("delta is newest minus oldest, and null with a single reading", () => {
    const summary = buildProgressSummary({
      ...base,
      bodyMeasurements: [
        { loggedAt: "2026-07-09", weightKg: 79, leanBodyMassKg: 62.8 },
        { loggedAt: "2026-07-01", weightKg: 80, leanBodyMassKg: 62 },
        { loggedAt: "2026-07-05", weightKg: 80, boneMassKg: 3.1 },
      ],
    })

    const lean = summary.body.measurements.find(
      (m) => m.key === "leanBodyMassKg"
    )
    expect(lean?.latest).toBe(62.8)
    expect(lean?.latestDate).toBe("2026-07-09")
    expect(lean?.delta).toBeCloseTo(0.8)
    expect(lean?.readings).toBe(2)
    expect(lean?.group).toBe("composition")

    const bone = summary.body.measurements.find((m) => m.key === "boneMassKg")
    expect(bone?.delta).toBeNull()
    expect(bone?.readings).toBe(1)
  })

  test("ignores non-finite readings", () => {
    const summary = buildProgressSummary({
      ...base,
      bodyMeasurements: [
        { loggedAt: "2026-07-09", weightKg: 79, neckCm: Number.NaN },
      ],
    })
    expect(summary.body.measurements).toEqual([])
  })
})
