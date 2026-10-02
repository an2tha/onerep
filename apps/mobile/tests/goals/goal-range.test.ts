import { expect, test } from "bun:test"
import { goalRangePosition } from "../../src/lib/goal-plan"
import { computeMuscleVolume } from "../../src/lib/muscle-volume"
import { toWorkoutLogRecords } from "../../src/lib/exercise-history"
import { validateGoalRange } from "../../../../convex/lib/goalPlan"

test("range includes both bounds and reports deviation without a readiness score", () => {
  expect(goalRangePosition(8, 8, 12).status).toBe("within")
  expect(goalRangePosition(12, 8, 12).status).toBe("within")
  expect(goalRangePosition(5, 8, 12)).toMatchObject({
    status: "below",
    distance: 3,
  })
  expect(goalRangePosition(14, 8, 12)).toMatchObject({
    status: "above",
    distance: 2,
  })
  expect(goalRangePosition(40, 8, 12).marker).toBeLessThanOrEqual(100)
})
test("history conversion excludes warmups, unfinished sets and other weeks", () => {
  const logs = toWorkoutLogRecords([
    {
      date: "2026-09-21",
      exercises: [
        {
          exerciseId: "press",
          sets: [
            { completed: true, type: "warmup" },
            { completed: true },
            { completed: false },
          ],
        },
      ],
    },
    {
      date: "2026-09-20",
      exercises: [{ id: "press", sets: [{ completed: true }] }],
    },
    {
      date: "2026-09-26",
      exercises: [{ id: "press", sets: [{ completed: true }] }],
    },
  ])
  const volume = computeMuscleVolume(
    logs,
    new Map([
      [
        "press",
        {
          id: "press",
          primaryMuscles: ["Chest"],
          secondaryMuscles: ["triceps"],
        },
      ],
    ]),
    "2026-09-21",
    "2026-09-25"
  )
  expect(volume.find((row) => row.muscle === "chest")?.primarySets).toBe(1)
  expect(volume.find((row) => row.muscle === "triceps")?.secondarySets).toBe(1)
})
test("server rejects invalid and nonfinite bounds", () => {
  for (const [min, max] of [
    [0, 12],
    [12, 8],
    [8, 8],
    [8, 31],
    [1.5, 12],
    [NaN, 12],
    [8, Infinity],
  ])
    expect(() => validateGoalRange(min, max)).toThrow()
  expect(() => validateGoalRange(1, 30)).not.toThrow()
})
