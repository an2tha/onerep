import { expect, test } from "bun:test"
import { dampenWorkout, boundedAiDampening } from "../programme-workout"
import { plannedWorkoutStrain } from "../../../../../convex/lib/nutritionProgramme"
import type { ExerciseState } from "../workout-logging"
import { normalizeCardioState } from "../workout-logging"
const fixture = () =>
  ({
    squat: {
      sets: Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        type: "working",
        weight: "80",
        reps: "8",
        restSeconds: 90,
        completed: i < 2,
      })),
      trackRpe: false,
      trackUnilateral: false,
      barWeight: "20",
      barType: "olympic",
      cardio: normalizeCardioState(),
    },
  }) as Record<string, ExerciseState>
test("quick dampening reaches ceiling without mutating source or completed work", () => {
  const original = fixture()
  const before = structuredClone(original)
  const next = dampenWorkout(original, 50)!
  expect(plannedWorkoutStrain(next)!).toBeLessThanOrEqual(50)
  expect(original).toEqual(before)
  expect(next.squat!.sets.filter((s) => s.completed)).toEqual(
    original.squat!.sets.filter((s) => s.completed)
  )
})
test("cannot erase completed work to satisfy a ceiling", () => {
  const data = fixture()
  data.squat!.sets.forEach((s) => {
    s.completed = true
  })
  expect(dampenWorkout(data, 10)).toBeNull()
})
test("AI changes reject extra exercises, increasing loads and insufficient reductions", () => {
  const data = fixture()
  const names = { squat: "Squat" }
  expect(() =>
    boundedAiDampening(
      data,
      names,
      { exercises: [{ name: "Bench", sets: [] }] },
      50
    )
  ).toThrow()
  expect(() =>
    boundedAiDampening(
      data,
      names,
      { exercises: [{ name: "Squat", sets: [{ weight: "100" }] }] },
      50
    )
  ).toThrow()
  expect(() =>
    boundedAiDampening(
      data,
      names,
      {
        exercises: [
          {
            name: "Squat",
            sets: Array.from({ length: 18 }, () => ({ weight: "80" })),
          },
        ],
      },
      50
    )
  ).toThrow()
  const result = boundedAiDampening(
    data,
    names,
    { exercises: [{ name: "Squat", sets: [{ weight: "60", reps: "6" }] }] },
    50
  )
  expect(result.squat!.sets.slice(0, 2)).toEqual(data.squat!.sets.slice(0, 2))
  expect(result.squat!.sets[2]!.weight).toBe("60")
})
