import { describe, expect, test } from "bun:test"
import { swapExercisePlan } from "../exercise-swap"

const completed = { id: "done", reps: "5", weight: "100", completed: true }
const pending = { id: "todo", reps: "5", weight: "100", completed: false }
const fresh = {
  sets: [{ id: "new", reps: "8-12", weight: "", completed: false }],
}

describe("exercise swaps", () => {
  test("preserves performed sets under the original exercise with a fresh replacement", () => {
    const data = { squat: { sets: [completed, pending] } }
    const result = swapExercisePlan(
      [{ kind: "solo", exerciseId: "squat" }],
      data,
      "squat",
      "lunge",
      fresh
    )
    expect(result.items).toEqual([
      { kind: "solo", exerciseId: "squat" },
      { kind: "solo", exerciseId: "lunge" },
    ])
    expect(result.exerciseData.squat.sets).toEqual([completed])
    expect(result.exerciseData.lunge.sets[0].weight).toBe("")
    expect(data.squat.sets).toEqual([completed, pending])
  })
  test("keeps superset membership and completed history when swapping", () => {
    const result = swapExercisePlan(
      [
        {
          kind: "superset",
          id: "group",
          color: "blue",
          exerciseIds: ["squat", "row"],
        },
      ],
      { squat: { sets: [completed, pending] }, row: fresh },
      "squat",
      "lunge",
      fresh
    )
    expect(result.items).toEqual([
      {
        kind: "superset",
        id: "group",
        color: "blue",
        exerciseIds: ["squat", "lunge", "row"],
      },
    ])
  })
  test("replaces an unstarted exercise without leaving an empty original", () => {
    const result = swapExercisePlan(
      [{ kind: "solo", exerciseId: "squat" }],
      { squat: { sets: [pending] } },
      "squat",
      "lunge",
      fresh
    )
    expect(result.items).toEqual([{ kind: "solo", exerciseId: "lunge" }])
    expect(result.exerciseData.squat).toBeUndefined()
  })
  test("preserves recorded cardio rather than moving it onto a different activity", () => {
    const cardio = { sets: [], distance: "5" }
    const result = swapExercisePlan(
      [{ kind: "solo", exerciseId: "run" }],
      { run: cardio },
      "run",
      "bike",
      { sets: [], distance: "" },
      true
    )
    expect(result.exerciseData.run.distance).toBe("5")
    expect(result.exerciseData.bike.distance).toBe("")
    expect(result.items).toHaveLength(2)
  })
  test("rejects duplicate replacements and stale source exercises", () => {
    const items = [
      { kind: "solo" as const, exerciseId: "squat" },
      { kind: "solo" as const, exerciseId: "row" },
    ]
    const data = { squat: fresh, row: fresh }
    expect(() => swapExercisePlan(items, data, "squat", "row", fresh)).toThrow(
      "already"
    )
    expect(() =>
      swapExercisePlan(items, data, "missing", "lunge", fresh)
    ).toThrow("no longer")
    expect(() =>
      swapExercisePlan(items, data, "squat", "squat", fresh)
    ).toThrow("different")
  })
})
