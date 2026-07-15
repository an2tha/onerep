import { describe, expect, test } from "bun:test"

import {
  findNextWorkoutSequenceTarget,
  type WorkoutSequenceExercise,
  type WorkoutSequenceItem,
} from "./workout-sequencing"

function next(
  items: WorkoutSequenceItem[],
  exercises: Record<string, WorkoutSequenceExercise>
) {
  return findNextWorkoutSequenceTarget(items, (id) => exercises[id])
}

describe("active workout sequencing", () => {
  test("keeps solo exercise sets sequential", () => {
    expect(
      next([{ kind: "solo", exerciseId: "a" }], {
        a: { kind: "sets", completed: [true, false, false] },
      })
    ).toEqual({ kind: "set", exerciseId: "a", setIndex: 1 })
  })

  test("alternates superset exercises within each round", () => {
    const items: WorkoutSequenceItem[] = [
      { kind: "superset", exerciseIds: ["a", "b"] },
    ]

    expect(
      next(items, {
        a: { kind: "sets", completed: [true, false] },
        b: { kind: "sets", completed: [false, false] },
      })
    ).toEqual({ kind: "set", exerciseId: "b", setIndex: 0 })

    expect(
      next(items, {
        a: { kind: "sets", completed: [true, false] },
        b: { kind: "sets", completed: [true, false] },
      })
    ).toEqual({ kind: "set", exerciseId: "a", setIndex: 1 })
  })

  test("supports uneven set counts in a superset", () => {
    expect(
      next([{ kind: "superset", exerciseIds: ["a", "b"] }], {
        a: { kind: "sets", completed: [true, true, false] },
        b: { kind: "sets", completed: [true, true] },
      })
    ).toEqual({ kind: "set", exerciseId: "a", setIndex: 2 })
  })
})
