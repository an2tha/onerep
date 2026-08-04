import { describe, expect, test } from "bun:test"

import { fillDownSetField, type WorkoutSet } from "./workout-logging"

function sets(
  ...rows: Array<Partial<WorkoutSet> & { weight?: string; reps?: string }>
): WorkoutSet[] {
  return rows.map((row, i) => ({
    id: `s${i}`,
    type: "working" as const,
    weight: "",
    reps: "",
    restSeconds: 120,
    completed: false,
    ...row,
  }))
}

describe("fillDownSetField", () => {
  test("carries a value into the blank sets below", () => {
    const result = fillDownSetField(sets({}, {}, {}), 0, "weight", "100")
    expect(result.map((s) => s.weight)).toEqual(["100", "100", "100"])
  })

  test("leaves sets above untouched", () => {
    const result = fillDownSetField(
      sets({ reps: "12" }, {}, {}),
      1,
      "reps",
      "8"
    )
    expect(result.map((s) => s.reps)).toEqual(["12", "8", "8"])
  })

  test("replaces values that still match the one being corrected", () => {
    const filled = fillDownSetField(sets({}, {}, {}), 0, "weight", "100")
    const corrected = fillDownSetField(filled, 0, "weight", "105")
    expect(corrected.map((s) => s.weight)).toEqual(["105", "105", "105"])
  })

  test("stops at a set the user gave its own value", () => {
    const result = fillDownSetField(
      sets({}, { weight: "80" }, {}),
      0,
      "weight",
      "100"
    )
    expect(result.map((s) => s.weight)).toEqual(["100", "80", ""])
  })

  test("never rewrites completed sets", () => {
    const result = fillDownSetField(
      sets({}, { completed: true, weight: "60" }, {}),
      0,
      "weight",
      "100"
    )
    expect(result.map((s) => s.weight)).toEqual(["100", "60", "100"])
  })

  test("clearing a set does not clear the rest", () => {
    const filled = fillDownSetField(sets({}, {}, {}), 0, "reps", "8")
    const cleared = fillDownSetField(filled, 0, "reps", "")
    expect(cleared.map((s) => s.reps)).toEqual(["", "8", "8"])
  })

  test("does not mutate the input sets", () => {
    const original = sets({}, {}, {})
    fillDownSetField(original, 0, "weight", "100")
    expect(original.map((s) => s.weight)).toEqual(["", "", ""])
  })
})
