import { describe, expect, test } from "bun:test"
import {
  omitQuickLogMeasurements,
  prepareWorkoutSet,
  serializeWorkoutSet,
} from "../relaxed-workout"
import {
  normalizeExerciseState,
  exerciseStateFromLoggedExercise,
  type WorkoutSet,
} from "../workout-logging"
import { metricSeries, summariseSessions } from "../exercise-stats"
import { suggestDoubleProgression } from "../workout-progression"
import { normalizeCoachOperations } from "../../../../../packages/models/src/coach"
import { expandToExerciseData } from "../preset-quick-log"
import { normalizeLoggedExercises } from "../moment-quick-log"

const planned: WorkoutSet = {
  id: "set-1",
  type: "working",
  weight: "80",
  reps: "8",
  restSeconds: 90,
  completed: false,
}

describe("relaxed workout logging", () => {
  test("quick logging accepts no reps or explicit reps and always drops hidden weight", () => {
    for (const reps of ["", "8"]) {
      const data = expandToExerciseData({
        rows: [{ exerciseId: "lift", setCount: "2", weight: "80", reps }],
        presetExerciseData: {
          lift: normalizeExerciseState({ sets: [planned] }),
        },
        lookup: {},
        unit: "kg",
        relaxedLogging: true,
      })
      expect(data.lift.sets).toHaveLength(2)
      expect(serializeWorkoutSet(data.lift.sets[0])).toMatchObject({
        weight: 0,
        reps: reps === "" ? 0 : 8,
        loggingMode: "relaxed",
      })
    }
  })
  test("repeating a relaxed session retains its measurement marker", () => {
    const exercises = normalizeLoggedExercises([
      {
        id: "lift",
        name: "Lift",
        sets: [
          {
            type: "normal",
            weight: 0,
            reps: 0,
            completed: true,
            loggingMode: "relaxed",
          },
        ],
      },
    ])
    expect(exercises[0].sets[0].loggingMode).toBe("relaxed")
  })
  test("one-tap logs omit copied numbers without rewriting the source or cardio", () => {
    const source = [
      {
        id: "lift",
        sets: [serializeWorkoutSet({ ...planned, completed: true })],
      },
      { id: "cardio", sets: [], cardio: { durationSeconds: 600 } },
    ]
    const logged = omitQuickLogMeasurements(source)
    expect(logged[0].sets[0]).toMatchObject({
      weight: 0,
      reps: 0,
      completed: true,
      loggingMode: "relaxed",
    })
    expect(source[0].sets[0].weight).toBe(80)
    expect(logged[1]).toMatchObject({
      id: "cardio",
      sets: [],
      cardio: { durationSeconds: 600 },
    })
  })
  test("clears prescribed measurements once and preserves deliberate optional reps", () => {
    const relaxed = prepareWorkoutSet(planned, true)
    expect(relaxed).toMatchObject({
      weight: "",
      reps: "",
      loggingMode: "relaxed",
    })
    const entered = { ...relaxed, reps: "12" }
    expect(prepareWorkoutSet(entered, true)).toBe(entered)
    expect(planned.weight).toBe("80")
  })
  test("switching modes never rewrites completed work", () => {
    const completed = { ...planned, completed: true }
    expect(prepareWorkoutSet(completed, true)).toBe(completed)
    const relaxed = { ...prepareWorkoutSet(planned, true), completed: true }
    expect(prepareWorkoutSet(relaxed, false)).toBe(relaxed)
  })
  test("switching off restores editable measurements without inventing values", () => {
    const normal = prepareWorkoutSet(prepareWorkoutSet(planned, true), false)
    expect(normal).not.toHaveProperty("loggingMode")
    expect(normal).toMatchObject({ weight: "", reps: "" })
  })
  test("a completed set needs no numbers and remains explicitly unmeasured", () => {
    expect(
      serializeWorkoutSet({
        ...prepareWorkoutSet(planned, true),
        completed: true,
      })
    ).toEqual({
      type: "normal",
      weight: 0,
      reps: 0,
      completed: true,
      loggingMode: "relaxed",
    })
  })
  test("does not serialize a hidden weight even if an old draft retained it", () => {
    expect(
      serializeWorkoutSet({
        ...planned,
        loggingMode: "relaxed",
        completed: true,
      })
    ).toMatchObject({ weight: 0, reps: 8, loggingMode: "relaxed" })
  })
  test("draft resume and history editing preserve the logging mode", () => {
    const set = {
      ...prepareWorkoutSet(planned, true),
      reps: "6",
      completed: true,
    }
    expect(normalizeExerciseState({ sets: [set] }).sets[0]).toEqual(set)
    expect(
      exerciseStateFromLoggedExercise({ sets: [serializeWorkoutSet(set)] })
        .sets[0]
    ).toMatchObject({
      weight: "",
      reps: "6",
      completed: true,
      loggingMode: "relaxed",
    })
  })
  test("relaxed sessions count as work but do not lower strength trends or propose progression", () => {
    const normal = serializeWorkoutSet({ ...planned, completed: true })
    const relaxed = { ...normal, loggingMode: "relaxed" as const }
    const sessions = summariseSessions([
      { date: "2026-10-14", sets: [normal] },
      { date: "2026-10-15", sets: [relaxed] },
    ])
    expect(sessions).toHaveLength(2)
    expect(sessions[1].volume).toBe(0)
    expect(metricSeries(sessions, "volume")).toEqual([640])
    expect(suggestDoubleProgression([relaxed], 3)).toBeNull()
  })
  test("Coach accepts explicit on and off values but rejects malformed toggles", () => {
    const meta = {
      confirmation: "auto",
      summary: "Change logging",
      assumptions: [],
      warnings: [],
    }
    expect(
      normalizeCoachOperations(
        [true, false].map((enabled) => ({
          ...meta,
          type: "set_workout_logging",
          enabled,
        }))
      )
    ).toHaveLength(2)
    expect(
      normalizeCoachOperations([
        { ...meta, type: "set_workout_logging", enabled: "false" },
      ])
    ).toEqual([])
  })
})
