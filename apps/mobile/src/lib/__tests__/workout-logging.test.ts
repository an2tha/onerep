import { describe, expect, test } from "bun:test"
import {
  MAX_RETRO_DURATION_SECONDS,
  MIN_RETRO_DURATION_SECONDS,
  estimateRetroDurationSeconds,
  exerciseStateFromLoggedExercise,
  makeSet,
  retroWorkoutDraftKey,
} from "../workout-logging"
import type { ExerciseState, WorkoutItem, WorkoutSet } from "../workout-logging"

/** The flatten `handleFinish` performs on the way into a saved log. */
function flatten(state: ExerciseState) {
  return state.sets
    .filter((set) => set.completed)
    .map((set) => ({
      type: "normal",
      weight: parseFloat(String(set.weight)) || 0,
      reps: parseFloat(String(set.reps)) || 0,
      completed: set.completed,
    }))
}

function setOf(overrides: Partial<WorkoutSet>): WorkoutSet {
  return { ...makeSet(true), ...overrides }
}

describe("exerciseStateFromLoggedExercise", () => {
  test("round-trips a saved exercise back into editable state", () => {
    const original: ExerciseState = {
      ...exerciseStateFromLoggedExercise({ sets: [] }),
      sets: [
        setOf({ weight: "100", reps: "5" }),
        setOf({ weight: "102.5", reps: "3" }),
      ],
    }

    const logged = flatten(original)
    const reopened = exerciseStateFromLoggedExercise({ sets: logged })

    expect(flatten(reopened)).toEqual(logged)
    expect(reopened.sets.map((set) => set.weight)).toEqual(["100", "102.5"])
    expect(reopened.sets.map((set) => set.reps)).toEqual(["5", "3"])
  })

  test("every reopened set is marked done, because a logged set was done", () => {
    const reopened = exerciseStateFromLoggedExercise({
      sets: [
        { weight: 60, reps: 10, completed: true, type: "working" },
        // A log should never carry an incomplete set, but if one is there it
        // still represents work that was saved.
        { weight: 60, reps: 8, completed: false, type: "working" },
      ],
    })
    expect(reopened.sets.every((set) => set.completed)).toBe(true)
  })

  test("keeps a recognised set type and falls back for an unknown one", () => {
    const reopened = exerciseStateFromLoggedExercise({
      sets: [
        { weight: 40, reps: 12, type: "warmup" },
        { weight: 90, reps: 1, type: "not-a-real-type" },
      ],
    })
    expect(reopened.sets.map((set) => set.type)).toEqual(["warmup", "working"])
  })

  test("leaves an unrecorded weight or rep count blank rather than zero", () => {
    const reopened = exerciseStateFromLoggedExercise({
      sets: [{ weight: 0, reps: 0, type: "working" }],
    })
    expect(reopened.sets[0]).toMatchObject({ weight: "", reps: "" })
  })

  test("restores cardio details from the log", () => {
    const reopened = exerciseStateFromLoggedExercise({
      sets: [],
      cardio: {
        distanceMeters: 5000,
        distanceUnit: "km",
        durationSeconds: 1_500,
        avgHeartRateBpm: 148,
        route: { name: "River loop" },
      },
    })
    expect(reopened.cardio).toMatchObject({
      distance: "5",
      distanceUnit: "km",
      durationMinutes: "25",
      avgHeartRate: "148",
      routeName: "River loop",
    })
  })
})

describe("estimateRetroDurationSeconds", () => {
  const items: WorkoutItem[] = [{ kind: "solo", exerciseId: "bench" }]

  function withSets(sets: WorkoutSet[]): Record<string, ExerciseState> {
    return {
      bench: { ...exerciseStateFromLoggedExercise({ sets: [] }), sets },
    }
  }

  test("counts work plus rest for completed sets only", () => {
    const estimate = estimateRetroDurationSeconds(
      items,
      withSets([
        setOf({ restSeconds: 120 }),
        setOf({ restSeconds: 120 }),
        setOf({ restSeconds: 120 }),
        { ...makeSet(false), restSeconds: 120 },
      ])
    )
    // Three completed sets at 45s of work plus 120s rest each.
    expect(estimate).toBe(3 * (45 + 120))
  })

  test("never returns an implausibly short session", () => {
    const estimate = estimateRetroDurationSeconds(
      items,
      withSets([setOf({ restSeconds: 0 })])
    )
    expect(estimate).toBe(MIN_RETRO_DURATION_SECONDS)
  })

  test("caps a session that would otherwise run for days", () => {
    const estimate = estimateRetroDurationSeconds(
      items,
      withSets(Array.from({ length: 8 }, () => setOf({ restSeconds: 600 })))
    )
    expect(estimate).toBeLessThanOrEqual(MAX_RETRO_DURATION_SECONDS)
  })

  test("an empty session still reports the floor, never zero", () => {
    expect(estimateRetroDurationSeconds([], {})).toBe(
      MIN_RETRO_DURATION_SECONDS
    )
  })
})

describe("retroWorkoutDraftKey", () => {
  test("scopes a draft to its date and session, not to a slot", () => {
    const key = retroWorkoutDraftKey("2026-03-05", "retro:abc")
    expect(key).toContain("2026-03-05")
    expect(key).toContain("retro:abc")
    // A live draft is keyed `...:v1:1` / `...:v1:2`; these must not collide.
    expect(key).not.toBe("onerep:active-workout-draft:v1:1")
  })

  test("two sessions on the same day get different drafts", () => {
    expect(retroWorkoutDraftKey("2026-03-05", "a")).not.toBe(
      retroWorkoutDraftKey("2026-03-05", "b")
    )
  })
})

describe("makeSet", () => {
  test("defaults to incomplete for a live workout", () => {
    expect(makeSet().completed).toBe(false)
  })

  test("can start completed for a workout being reconstructed", () => {
    expect(makeSet(true).completed).toBe(true)
  })
})
