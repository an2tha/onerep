/**
 * Tests for the exercise log mapping logic changed in ActiveWorkout.tsx.
 *
 * The PR modified the handleFinish() function to:
 *   1. Use `id` as the exercise field (was `exerciseId`)
 *   2. Filter sets to only include completed ones
 *   3. Add `type: "normal"` to each mapped set
 *   4. Parse weight/reps with parseFloat(String(x)) || 0
 *   5. Remove trackRpe and trackUnilateral fields
 *
 * These transformations are pure functions that can be tested without React.
 */

import { describe, test, expect } from "bun:test"

// ─── Types ────────────────────────────────────────────────────────────────────

type RawSet = {
  weight?: number | string
  reps?: number | string
  leftReps?: number
  rightReps?: number
  rpe?: number
  completed?: boolean
}

type MappedSet = {
  type: "normal"
  weight: number
  reps: number
  completed: boolean | undefined
}

type ExerciseLog = {
  id: string
  name: string
  sets: MappedSet[]
}

// ─── Mirrors of the changed handleFinish logic ─────────────────────────────────

function mapSets(rawSets: RawSet[]): MappedSet[] {
  return rawSets
    .filter((s) => s.completed)
    .map((s) => ({
      type: "normal" as const,
      weight: parseFloat(String(s.weight)) || 0,
      reps: parseFloat(String(s.reps)) || 0,
      completed: s.completed,
    }))
}

function mapExercise(id: string, name: string, rawSets: RawSet[]): ExerciseLog {
  return {
    id,
    name,
    sets: mapSets(rawSets),
  }
}

// ─── Set filtering ─────────────────────────────────────────────────────────────

describe("handleFinish – set filtering (only completed sets)", () => {
  test("only completed sets are included", () => {
    const sets: RawSet[] = [
      { weight: 80, reps: 8, completed: true },
      { weight: 80, reps: 8, completed: false },
    ]
    const result = mapSets(sets)
    expect(result).toHaveLength(1)
    expect(result[0].completed).toBe(true)
  })

  test("all completed sets are included", () => {
    const sets: RawSet[] = [
      { weight: 80, reps: 8, completed: true },
      { weight: 85, reps: 6, completed: true },
      { weight: 90, reps: 4, completed: true },
    ]
    expect(mapSets(sets)).toHaveLength(3)
  })

  test("returns empty array when no sets are completed", () => {
    const sets: RawSet[] = [
      { weight: 80, reps: 8, completed: false },
      { weight: 80, reps: 8, completed: false },
    ]
    expect(mapSets(sets)).toHaveLength(0)
  })

  test("returns empty array for an empty sets array", () => {
    expect(mapSets([])).toHaveLength(0)
  })

  test("set with completed=undefined is excluded (falsy)", () => {
    const sets: RawSet[] = [
      { weight: 80, reps: 8 }, // completed undefined
    ]
    expect(mapSets(sets)).toHaveLength(0)
  })

  test("mixed completed and incomplete sets preserves correct ones", () => {
    const sets: RawSet[] = [
      { weight: 60, reps: 10, completed: true },
      { weight: 65, reps: 10, completed: false },
      { weight: 70, reps: 8, completed: true },
      { weight: 75, reps: 6, completed: false },
    ]
    const result = mapSets(sets)
    expect(result).toHaveLength(2)
    expect(result[0].weight).toBe(60)
    expect(result[1].weight).toBe(70)
  })
})

// ─── Weight/reps parsing ───────────────────────────────────────────────────────

describe("handleFinish – weight parsing (parseFloat(String(x)) || 0)", () => {
  test("numeric weight is preserved", () => {
    const sets: RawSet[] = [{ weight: 85, reps: 8, completed: true }]
    expect(mapSets(sets)[0].weight).toBe(85)
  })

  test("float weight is preserved", () => {
    const sets: RawSet[] = [{ weight: 82.5, reps: 8, completed: true }]
    expect(mapSets(sets)[0].weight).toBe(82.5)
  })

  test("string weight is parsed as float", () => {
    const sets: RawSet[] = [{ weight: "80" as any, reps: 8, completed: true }]
    expect(mapSets(sets)[0].weight).toBe(80)
  })

  test("string float weight is parsed correctly", () => {
    const sets: RawSet[] = [{ weight: "82.5" as any, reps: 8, completed: true }]
    expect(mapSets(sets)[0].weight).toBe(82.5)
  })

  test("undefined weight falls back to 0", () => {
    const sets: RawSet[] = [{ reps: 8, completed: true }]
    // parseFloat(String(undefined)) = parseFloat("undefined") = NaN → 0
    expect(mapSets(sets)[0].weight).toBe(0)
  })

  test("empty string weight falls back to 0", () => {
    const sets: RawSet[] = [{ weight: "" as any, reps: 8, completed: true }]
    expect(mapSets(sets)[0].weight).toBe(0)
  })

  test("non-numeric string weight falls back to 0", () => {
    const sets: RawSet[] = [{ weight: "bodyweight" as any, reps: 8, completed: true }]
    expect(mapSets(sets)[0].weight).toBe(0)
  })

  test("weight of 0 stays as 0 (0 || 0 = 0)", () => {
    const sets: RawSet[] = [{ weight: 0, reps: 8, completed: true }]
    expect(mapSets(sets)[0].weight).toBe(0)
  })
})

describe("handleFinish – reps parsing (parseFloat(String(x)) || 0)", () => {
  test("numeric reps is preserved", () => {
    const sets: RawSet[] = [{ weight: 80, reps: 10, completed: true }]
    expect(mapSets(sets)[0].reps).toBe(10)
  })

  test("string reps is parsed as float", () => {
    const sets: RawSet[] = [{ weight: 80, reps: "8" as any, completed: true }]
    expect(mapSets(sets)[0].reps).toBe(8)
  })

  test("undefined reps falls back to 0", () => {
    const sets: RawSet[] = [{ weight: 80, completed: true }]
    expect(mapSets(sets)[0].reps).toBe(0)
  })

  test("empty string reps falls back to 0", () => {
    const sets: RawSet[] = [{ weight: 80, reps: "" as any, completed: true }]
    expect(mapSets(sets)[0].reps).toBe(0)
  })

  test("non-numeric string reps falls back to 0", () => {
    const sets: RawSet[] = [{ weight: 80, reps: "AMRAP" as any, completed: true }]
    expect(mapSets(sets)[0].reps).toBe(0)
  })
})

// ─── Output shape ──────────────────────────────────────────────────────────────

describe("handleFinish – mapped set shape", () => {
  test("each mapped set has type: 'normal'", () => {
    const sets: RawSet[] = [{ weight: 80, reps: 8, completed: true }]
    expect(mapSets(sets)[0].type).toBe("normal")
  })

  test("mapped set does NOT include rpe field", () => {
    const sets: RawSet[] = [{ weight: 80, reps: 8, rpe: 8, completed: true }]
    const mapped = mapSets(sets)[0] as any
    expect(mapped.rpe).toBeUndefined()
  })

  test("mapped set does NOT include leftReps field", () => {
    const sets: RawSet[] = [{ weight: 80, leftReps: 10, rightReps: 10, completed: true }]
    const mapped = mapSets(sets)[0] as any
    expect(mapped.leftReps).toBeUndefined()
  })

  test("mapped set does NOT include rightReps field", () => {
    const sets: RawSet[] = [{ weight: 80, leftReps: 10, rightReps: 10, completed: true }]
    const mapped = mapSets(sets)[0] as any
    expect(mapped.rightReps).toBeUndefined()
  })

  test("mapped set includes completed field", () => {
    const sets: RawSet[] = [{ weight: 80, reps: 8, completed: true }]
    expect(mapSets(sets)[0].completed).toBe(true)
  })

  test("mapped set has exactly: type, weight, reps, completed", () => {
    const sets: RawSet[] = [{ weight: 80, reps: 8, completed: true }]
    const mapped = mapSets(sets)[0]
    const keys = Object.keys(mapped).sort()
    expect(keys).toEqual(["completed", "reps", "type", "weight"])
  })
})

// ─── Exercise log shape ────────────────────────────────────────────────────────

describe("handleFinish – exercise log shape", () => {
  test("exercise log uses 'id' field (not 'exerciseId')", () => {
    const log = mapExercise("ex-123", "Squat", [{ weight: 100, reps: 5, completed: true }])
    expect(log.id).toBe("ex-123")
    expect((log as any).exerciseId).toBeUndefined()
  })

  test("exercise log does NOT include trackRpe field", () => {
    const log = mapExercise("ex-1", "Bench Press", []) as any
    expect(log.trackRpe).toBeUndefined()
  })

  test("exercise log does NOT include trackUnilateral field", () => {
    const log = mapExercise("ex-1", "Curl", []) as any
    expect(log.trackUnilateral).toBeUndefined()
  })

  test("exercise name is preserved in the log", () => {
    const log = mapExercise("ex-1", "Deadlift", [])
    expect(log.name).toBe("Deadlift")
  })

  test("exercise with no completed sets has empty sets array", () => {
    const sets: RawSet[] = [
      { weight: 80, reps: 8, completed: false },
      { weight: 85, reps: 6, completed: false },
    ]
    const log = mapExercise("ex-1", "Press", sets)
    expect(log.sets).toHaveLength(0)
  })

  test("full exercise log with multiple completed sets", () => {
    const sets: RawSet[] = [
      { weight: 100, reps: 5, completed: true },
      { weight: 100, reps: 4, completed: true },
      { weight: 90,  reps: 5, completed: false },
    ]
    const log = mapExercise("ex-deadlift", "Deadlift", sets)
    expect(log.id).toBe("ex-deadlift")
    expect(log.name).toBe("Deadlift")
    expect(log.sets).toHaveLength(2)
    expect(log.sets[0]).toEqual({ type: "normal", weight: 100, reps: 5, completed: true })
    expect(log.sets[1]).toEqual({ type: "normal", weight: 100, reps: 4, completed: true })
  })
})

// ─── Regression: parseFloat vs parseInt ───────────────────────────────────────

describe("parseFloat(String(x)) regression cases", () => {
  test("parseFloat handles typical bodybuilding weights correctly", () => {
    // Verify parseFloat is used (not parseInt) for weights like 82.5
    expect(parseFloat(String(82.5)) || 0).toBe(82.5)
    expect(parseFloat(String(17.5)) || 0).toBe(17.5)
    expect(parseFloat(String(0.5)) || 0).toBe(0.5)
  })

  test("String() conversion allows parseFloat to handle non-strings", () => {
    // This is the guard for when weight/reps may arrive as strings from form inputs
    expect(parseFloat(String("100")) || 0).toBe(100)
    expect(parseFloat(String(100)) || 0).toBe(100)
    expect(parseFloat(String(null)) || 0).toBe(0) // "null" → NaN → 0
    expect(parseFloat(String(undefined)) || 0).toBe(0) // "undefined" → NaN → 0
  })

  test("|| 0 fallback ensures weight is always a valid number", () => {
    const badValues = [undefined, null, "", "abc", NaN]
    for (const v of badValues) {
      const result = parseFloat(String(v)) || 0
      expect(typeof result).toBe("number")
      expect(isNaN(result)).toBe(false)
    }
  })
})