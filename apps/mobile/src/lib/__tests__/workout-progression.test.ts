import { describe, expect, test } from "bun:test"
import { suggestDoubleProgression } from "../workout-progression"

describe("suggestDoubleProgression", () => {
  test("repeats last working sets and nudges the strongest set by one rep", () => {
    expect(
      suggestDoubleProgression(
        [
          { weight: 80, reps: 8, completed: true },
          { weight: 80, reps: 7, completed: true },
          { weight: 75, reps: 9, completed: true },
        ],
        3
      )
    ).toEqual({
      label: "+1 rep on set 1",
      targets: [
        { weight: 80, reps: 9 },
        { weight: 80, reps: 7 },
        { weight: 75, reps: 9 },
      ],
    })
  })

  test("uses the final prior target when a new workout has more sets", () => {
    expect(
      suggestDoubleProgression([{ weight: 50, reps: 10, completed: true }], 3)
        ?.targets
    ).toEqual([
      { weight: 50, reps: 11 },
      { weight: 50, reps: 10 },
      { weight: 50, reps: 10 },
    ])
  })

  test("does not suggest progression without a completed weighted set", () => {
    expect(suggestDoubleProgression([], 3)).toBeNull()
    expect(
      suggestDoubleProgression([{ weight: 0, reps: 8, completed: true }], 3)
    ).toBeNull()
  })
})
