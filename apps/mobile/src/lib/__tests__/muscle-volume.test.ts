import { describe, test, expect } from "bun:test"
import {
  weekStart,
  normaliseMuscle,
  computeMuscleVolume,
  computeWeeklyMuscleVolume,
  buildCatalogMap,
  type ExerciseMeta,
  type WorkoutLogRecord,
} from "../muscle-volume"

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("weekStart", () => {
  test("Monday returns itself", () => {
    expect(weekStart("2026-04-13")).toBe("2026-04-13")
  })

  test("Wednesday returns previous Monday", () => {
    expect(weekStart("2026-04-15")).toBe("2026-04-13")
  })

  test("Sunday returns the previous Monday", () => {
    expect(weekStart("2026-04-19")).toBe("2026-04-13")
  })

  test("crosses month boundary correctly", () => {
    // 2026-05-01 is a Friday → Mon is 2026-04-27
    expect(weekStart("2026-05-01")).toBe("2026-04-27")
  })

  test("year boundary", () => {
    // 2026-01-01 is a Thursday → Mon is 2025-12-29
    expect(weekStart("2026-01-01")).toBe("2025-12-29")
  })
})

describe("normaliseMuscle", () => {
  test("lowercases the string", () => {
    expect(normaliseMuscle("Quadriceps")).toBe("quadriceps")
  })

  test("trims whitespace", () => {
    expect(normaliseMuscle("  glutes  ")).toBe("glutes")
  })

  test("handles already-lowercase", () => {
    expect(normaliseMuscle("chest")).toBe("chest")
  })
})

// ─── Core ─────────────────────────────────────────────────────────────────────

const catalog: ExerciseMeta[] = [
  {
    id: "squat",
    primaryMuscles: ["Quadriceps", "Glutes"],
    secondaryMuscles: ["Hamstrings", "Core"],
  },
  {
    id: "bench",
    primaryMuscles: ["Chest"],
    secondaryMuscles: ["Triceps", "Front Deltoids"],
  },
  {
    id: "row",
    primaryMuscles: ["Back"],
    secondaryMuscles: ["Biceps"],
  },
]
const catalogMap = buildCatalogMap(catalog)

function makeLog(date: string, exercises: WorkoutLogRecord["exercises"]): WorkoutLogRecord {
  return { date, exercises }
}

function makeExercise(id: string, completedCount: number, totalCount = completedCount) {
  return {
    id,
    sets: Array.from({ length: totalCount }, (_, i) => ({ completed: i < completedCount })),
  }
}

describe("computeMuscleVolume", () => {
  test("returns empty array when no logs", () => {
    expect(computeMuscleVolume([], catalogMap)).toEqual([])
  })

  test("counts primary and secondary sets correctly", () => {
    const logs = [
      makeLog("2026-04-15", [makeExercise("squat", 4)]),
    ]
    const result = computeMuscleVolume(logs, catalogMap)

    const quads = result.find((m) => m.muscle === "quadriceps")!
    expect(quads.primarySets).toBe(4)
    expect(quads.secondarySets).toBe(0)
    expect(quads.effectiveSets).toBe(4)

    const hamstrings = result.find((m) => m.muscle === "hamstrings")!
    expect(hamstrings.primarySets).toBe(0)
    expect(hamstrings.secondarySets).toBe(4)
    expect(hamstrings.effectiveSets).toBe(2)
  })

  test("only counts completed sets", () => {
    const logs = [
      makeLog("2026-04-15", [makeExercise("bench", 2, 4)]), // 4 sets, only 2 completed
    ]
    const result = computeMuscleVolume(logs, catalogMap)
    const chest = result.find((m) => m.muscle === "chest")!
    expect(chest.primarySets).toBe(2)
  })

  test("aggregates across multiple sessions", () => {
    const logs = [
      makeLog("2026-04-13", [makeExercise("squat", 3)]),
      makeLog("2026-04-15", [makeExercise("squat", 4)]),
    ]
    const result = computeMuscleVolume(logs, catalogMap)
    const quads = result.find((m) => m.muscle === "quadriceps")!
    expect(quads.primarySets).toBe(7)
  })

  test("respects date range filter — excludes logs before fromIso", () => {
    const logs = [
      makeLog("2026-04-10", [makeExercise("squat", 5)]),
      makeLog("2026-04-15", [makeExercise("squat", 3)]),
    ]
    const result = computeMuscleVolume(logs, catalogMap, "2026-04-13", null)
    const quads = result.find((m) => m.muscle === "quadriceps")!
    expect(quads.primarySets).toBe(3)
  })

  test("respects date range filter — excludes logs after toIso", () => {
    const logs = [
      makeLog("2026-04-13", [makeExercise("bench", 3)]),
      makeLog("2026-04-20", [makeExercise("bench", 5)]),
    ]
    const result = computeMuscleVolume(logs, catalogMap, null, "2026-04-15")
    const chest = result.find((m) => m.muscle === "chest")!
    expect(chest.primarySets).toBe(3)
  })

  test("skips exercises not in catalog", () => {
    const logs = [
      makeLog("2026-04-15", [makeExercise("unknown-exercise", 4)]),
    ]
    expect(computeMuscleVolume(logs, catalogMap)).toEqual([])
  })

  test("skips exercises with no completed sets", () => {
    const logs = [
      makeLog("2026-04-15", [makeExercise("squat", 0, 4)]),
    ]
    expect(computeMuscleVolume(logs, catalogMap)).toEqual([])
  })

  test("sorts result by effectiveSets descending", () => {
    const logs = [
      makeLog("2026-04-15", [
        makeExercise("bench", 4),  // chest = 4 primary
        makeExercise("row", 6),    // back = 6 primary
      ]),
    ]
    const result = computeMuscleVolume(logs, catalogMap)
    // back (6) should come before chest (4)
    const backIdx = result.findIndex((m) => m.muscle === "back")
    const chestIdx = result.findIndex((m) => m.muscle === "chest")
    expect(backIdx).toBeLessThan(chestIdx)
  })

  test("handles exercises with no muscle metadata gracefully", () => {
    const emptyCatalog = buildCatalogMap([{ id: "empty" }])
    const logs = [makeLog("2026-04-15", [makeExercise("empty", 4)])]
    expect(computeMuscleVolume(logs, emptyCatalog)).toEqual([])
  })
})

describe("computeWeeklyMuscleVolume", () => {
  const today = new Date("2026-04-15T12:00:00Z") // Wednesday

  test("includes workouts from Monday to today", () => {
    const logs = [
      makeLog("2026-04-13", [makeExercise("squat", 3)]), // Monday ✓
      makeLog("2026-04-14", [makeExercise("squat", 2)]), // Tuesday ✓
      makeLog("2026-04-15", [makeExercise("squat", 4)]), // Wednesday (today) ✓
    ]
    const result = computeWeeklyMuscleVolume(logs, catalogMap, today)
    const quads = result.find((m) => m.muscle === "quadriceps")!
    expect(quads.primarySets).toBe(9)
  })

  test("excludes workouts from the previous week", () => {
    const logs = [
      makeLog("2026-04-06", [makeExercise("squat", 5)]), // last week ✗
      makeLog("2026-04-13", [makeExercise("squat", 3)]), // this week ✓
    ]
    const result = computeWeeklyMuscleVolume(logs, catalogMap, today)
    const quads = result.find((m) => m.muscle === "quadriceps")!
    expect(quads.primarySets).toBe(3)
  })

  test("excludes future workouts (after today)", () => {
    const logs = [
      makeLog("2026-04-15", [makeExercise("bench", 3)]), // today ✓
      makeLog("2026-04-17", [makeExercise("bench", 4)]), // future ✗
    ]
    const result = computeWeeklyMuscleVolume(logs, catalogMap, today)
    const chest = result.find((m) => m.muscle === "chest")!
    expect(chest.primarySets).toBe(3)
  })

  test("returns empty when no workouts this week", () => {
    const logs = [makeLog("2026-04-01", [makeExercise("squat", 5)])]
    expect(computeWeeklyMuscleVolume(logs, catalogMap, today)).toEqual([])
  })
})

describe("buildCatalogMap", () => {
  test("builds a Map keyed by id", () => {
    const map = buildCatalogMap(catalog)
    expect(map.has("squat")).toBe(true)
    expect(map.get("bench")?.primaryMuscles).toEqual(["Chest"])
  })

  test("returns empty Map for empty array", () => {
    expect(buildCatalogMap([]).size).toBe(0)
  })

  test("last duplicate id wins", () => {
    const dupes: ExerciseMeta[] = [
      { id: "a", primaryMuscles: ["Chest"] },
      { id: "a", primaryMuscles: ["Back"] },
    ]
    expect(buildCatalogMap(dupes).get("a")?.primaryMuscles).toEqual(["Back"])
  })
})
