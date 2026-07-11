import { describe, expect, test } from "bun:test"
import { getActiveWorkoutProgress } from "../dashboard-workout-progress"

describe("active workout dashboard progress", () => {
  test("counts completed sets across exercises", () => {
    expect(
      getActiveWorkoutProgress({
        elapsedSeconds: 1360,
        exerciseData: {
          squat: { sets: [{ completed: true }, { completed: false }] },
          row: { sets: [{ completed: true }] },
        },
      })
    ).toEqual({ completedSets: 2, totalSets: 3, elapsedMinutes: 23 })
  })

  test("does not infer progress from malformed saved workout data", () => {
    expect(getActiveWorkoutProgress({ exerciseData: [] })).toBeNull()
  })
})
