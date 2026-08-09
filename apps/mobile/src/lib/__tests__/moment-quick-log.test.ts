import { describe, test, expect } from "bun:test"
import {
  buildQuickLogCandidates,
  normalizeLoggedExercises,
  type SourceWorkoutLog,
} from "../moment-quick-log"

function session(
  date: string,
  names: string[],
  { sets = 3, durationSeconds = 2700 } = {}
): SourceWorkoutLog {
  return {
    _id: `log-${date}`,
    date,
    durationSeconds,
    exercises: names.map((name) => ({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      category: "strength",
      sets: Array.from({ length: sets }, () => ({
        type: "normal",
        reps: 8,
        weight: 60,
        completed: true,
      })),
    })),
  }
}

// Wednesday.
const TODAY = "2026-04-15"

describe("normalizeLoggedExercises", () => {
  test("keeps only the fields the mutation validates", () => {
    const [exercise] = normalizeLoggedExercises([
      {
        id: "bench",
        name: "Bench Press",
        category: "strength",
        notes: "felt heavy",
        supersetGroup: 2,
        sets: [
          {
            type: "normal",
            reps: 8,
            weight: 60,
            completed: true,
            restSeconds: 90,
          },
        ],
      },
    ])

    expect(exercise).toEqual({
      id: "bench",
      name: "Bench Press",
      category: "strength",
      sets: [
        {
          type: "normal",
          reps: 8,
          weight: 60,
          completed: true,
          rpe: undefined,
          rir: undefined,
        },
      ],
    })
  })

  test("drops sets that were planned but never completed", () => {
    const [exercise] = normalizeLoggedExercises([
      {
        id: "squat",
        name: "Squat",
        sets: [
          { type: "normal", reps: 5, weight: 100, completed: true },
          { type: "normal", reps: 5, weight: 100, completed: false },
        ],
      },
    ])

    expect(exercise.sets).toHaveLength(1)
  })

  test("drops an exercise left with nothing, and keeps cardio without sets", () => {
    const exercises = normalizeLoggedExercises([
      { id: "row", name: "Row", sets: [{ completed: false }] },
      { id: "run", name: "Run", sets: [], cardio: { distanceMeters: 5000 } },
      { id: "nameless", sets: [{ completed: true, reps: 5, weight: 5 }] },
    ])

    expect(exercises.map((exercise) => exercise.id)).toEqual(["run"])
  })

  test("coerces junk numbers rather than passing them through", () => {
    const [exercise] = normalizeLoggedExercises([
      {
        id: "curl",
        name: "Curl",
        sets: [{ type: 7, reps: "eight", weight: null, completed: true }],
      },
    ])

    expect(exercise.sets[0]).toMatchObject({
      type: "normal",
      reps: 0,
      weight: 0,
      completed: true,
    })
  })
})

describe("buildQuickLogCandidates", () => {
  const history = [
    session("2026-04-13", ["Squat", "Leg Press"]), // Monday
    session("2026-04-08", ["Bench Press", "Row", "Curl"]), // last Wednesday
    session("2026-04-06", ["Squat", "Leg Press"]), // Monday before
  ]

  test("puts the same weekday first", () => {
    const [first] = buildQuickLogCandidates({
      workoutLogs: history,
      targetDate: TODAY,
      todayKey: TODAY,
    })
    expect(first.sourceDate).toBe("2026-04-08")
    expect(first.title).toBe("Bench Press & 2 more")
  })

  test("falls back to recency for the rest", () => {
    const candidates = buildQuickLogCandidates({
      workoutLogs: history,
      targetDate: TODAY,
      todayKey: TODAY,
    })
    expect(candidates.map((candidate) => candidate.sourceDate)).toEqual([
      "2026-04-08",
      "2026-04-13",
    ])
  })

  test("collapses two identical sessions into one suggestion", () => {
    const candidates = buildQuickLogCandidates({
      workoutLogs: history,
      targetDate: TODAY,
      todayKey: TODAY,
    })
    expect(candidates).toHaveLength(2)
  })

  test("never offers to duplicate the target day", () => {
    const candidates = buildQuickLogCandidates({
      workoutLogs: [session(TODAY, ["Squat"]), ...history],
      targetDate: TODAY,
      todayKey: TODAY,
    })
    expect(candidates.some((candidate) => candidate.sourceDate === TODAY)).toBe(
      false
    )
  })

  test("ignores sessions too old to be a shortcut", () => {
    expect(
      buildQuickLogCandidates({
        workoutLogs: [session("2026-01-05", ["Squat"])],
        targetDate: TODAY,
        todayKey: TODAY,
      })
    ).toEqual([])
  })

  test("ignores a log with nothing completed in it", () => {
    expect(
      buildQuickLogCandidates({
        workoutLogs: [{ date: "2026-04-14", exercises: [] }],
        targetDate: TODAY,
        todayKey: TODAY,
      })
    ).toEqual([])
  })

  test("describes the session in one line", () => {
    const [candidate] = buildQuickLogCandidates({
      workoutLogs: [session("2026-04-14", ["Squat", "Leg Press"])],
      targetDate: TODAY,
      todayKey: TODAY,
    })
    expect(candidate.title).toBe("Squat & Leg Press")
    expect(candidate.detail).toBe("2 exercises · 6 sets · 45 min · yesterday")
    expect(candidate.setCount).toBe(6)
  })

  test("carries the payload the mutation expects", () => {
    const [candidate] = buildQuickLogCandidates({
      workoutLogs: [session("2026-04-14", ["Squat"])],
      targetDate: TODAY,
      todayKey: TODAY,
    })
    expect(candidate.exercises[0].sets).toHaveLength(3)
    expect(candidate.durationSeconds).toBe(2700)
  })
})
