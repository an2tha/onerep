import { describe, expect, test } from "bun:test"
import {
  getCompletedSetCountsByExercise,
  getExerciseIdsFromHistory,
  getLoggedExerciseId,
} from "../exercise-history"

describe("exercise history helpers", () => {
  test("prefers current workout log id field", () => {
    expect(
      getLoggedExerciseId({ id: "bench-press", exerciseId: "legacy-bench" })
    ).toBe("bench-press")
  })

  test("supports legacy exerciseId field", () => {
    expect(getLoggedExerciseId({ exerciseId: "legacy-squat" })).toBe(
      "legacy-squat"
    )
  })

  test("collects unique exercise ids from current and legacy logs", () => {
    expect(
      getExerciseIdsFromHistory([
        {
          exercises: [
            { id: "bench-press" },
            { exerciseId: "legacy-squat" },
            { id: "bench-press" },
          ],
        },
      ])
    ).toEqual(["bench-press", "legacy-squat"])
  })

  test("counts completed sets by exercise across current and legacy logs", () => {
    const counts = getCompletedSetCountsByExercise([
      {
        exercises: [
          {
            id: "bench-press",
            sets: [{ completed: true }, { completed: false }],
          },
          {
            exerciseId: "legacy-squat",
            sets: [{ completed: true }, { completed: true }],
          },
        ],
      },
      {
        exercises: [
          {
            id: "bench-press",
            sets: [{ completed: true }],
          },
        ],
      },
    ])

    expect(Object.fromEntries(counts)).toEqual({
      "bench-press": 2,
      "legacy-squat": 2,
    })
  })
})
