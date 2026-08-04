import { describe, test, expect } from "bun:test"
import {
  EXERCISES,
  getExerciseById,
  visiblePopularExerciseSearches,
} from "../exercise-catalog"
import type { ExerciseCategory } from "../exercise-catalog"

// ── EXERCISES data ────────────────────────────────────────────────────────────

describe("EXERCISES", () => {
  test("is a non-empty array", () => {
    expect(Array.isArray(EXERCISES)).toBe(true)
    expect(EXERCISES.length).toBeGreaterThan(0)
  })

  test("every exercise has required fields", () => {
    for (const ex of EXERCISES) {
      expect(ex.id, `${ex.id}: missing id`).toBeTruthy()
      expect(ex.name, `${ex.id}: missing name`).toBeTruthy()
      expect(ex.category, `${ex.id}: missing category`).toBeTruthy()
      expect(ex.muscle, `${ex.id}: missing muscle`).toBeTruthy()
      expect(ex.description, `${ex.id}: missing description`).toBeTruthy()
      expect(ex.sets, `${ex.id}: missing sets`).toBeTruthy()
      expect(ex.color, `${ex.id}: missing color`).toBeTruthy()
    }
  })

  test("all exercise ids are unique", () => {
    const ids = EXERCISES.map((e) => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  test("all exercise names are unique", () => {
    const names = EXERCISES.map((e) => e.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })

  test("category is one of the valid ExerciseCategory values", () => {
    const validCategories: ExerciseCategory[] = [
      "strength",
      "cardio",
      "mobility",
      "core",
    ]
    for (const ex of EXERCISES) {
      expect(
        validCategories,
        `${ex.name}: invalid category "${ex.category}"`
      ).toContain(ex.category)
    }
  })

  test("contains at least one of each category", () => {
    const categories = new Set(EXERCISES.map((e) => e.category))
    expect(categories).toContain("strength")
    expect(categories).toContain("cardio")
    expect(categories).toContain("mobility")
    expect(categories).toContain("core")
  })

  test("color fields are valid hex colors", () => {
    const hexColorPattern = /^#[0-9a-f]{6}$/i
    for (const ex of EXERCISES) {
      expect(ex.color, `${ex.name}: invalid color`).toMatch(hexColorPattern)
    }
  })
})

// ── getExerciseById ───────────────────────────────────────────────────────────

describe("getExerciseById", () => {
  test("returns exercise for valid id", () => {
    const exercise = getExerciseById("e1")
    expect(exercise).not.toBeNull()
    expect(exercise!.name).toBe("Barbell Squat")
  })

  test("returns null for non-existent id", () => {
    expect(getExerciseById("nonexistent")).toBeNull()
  })

  test("returns null for empty string", () => {
    expect(getExerciseById("")).toBeNull()
  })

  test("returns correct exercise for each known id", () => {
    const expectedExercises: Array<[string, string]> = [
      ["e1", "Barbell Squat"],
      ["e2", "Bench Press"],
      ["e3", "Deadlift"],
      ["e4", "Pull-up"],
      ["e5", "Overhead Press"],
    ]
    for (const [id, expectedName] of expectedExercises) {
      const ex = getExerciseById(id)
      expect(ex, `Exercise ${id} should exist`).not.toBeNull()
      expect(ex!.name).toBe(expectedName)
    }
  })

  test("all exercises in EXERCISES are findable by id", () => {
    for (const ex of EXERCISES) {
      const found = getExerciseById(ex.id)
      expect(found, `Exercise ${ex.id} should be findable`).not.toBeNull()
      expect(found!.id).toBe(ex.id)
    }
  })

  test("returns full exercise object with all fields", () => {
    const exercise = getExerciseById("e1")
    expect(exercise).toHaveProperty("id")
    expect(exercise).toHaveProperty("name")
    expect(exercise).toHaveProperty("category")
    expect(exercise).toHaveProperty("muscle")
    expect(exercise).toHaveProperty("description")
    expect(exercise).toHaveProperty("sets")
    expect(exercise).toHaveProperty("color")
  })

  test("case-sensitive id matching", () => {
    // IDs are lowercase like "e1", "e2"
    expect(getExerciseById("E1")).toBeNull()
  })
})

// ── Category filtering ────────────────────────────────────────────────────────

describe("exercise category filtering", () => {
  test("can filter strength exercises", () => {
    const strength = EXERCISES.filter((e) => e.category === "strength")
    expect(strength.length).toBeGreaterThan(0)
    for (const ex of strength) {
      expect(ex.category).toBe("strength")
    }
  })

  test("can filter cardio exercises", () => {
    const cardio = EXERCISES.filter((e) => e.category === "cardio")
    expect(cardio.length).toBeGreaterThan(0)
  })

  test("can filter mobility exercises", () => {
    const mobility = EXERCISES.filter((e) => e.category === "mobility")
    expect(mobility.length).toBeGreaterThan(0)
  })

  test("can filter core exercises", () => {
    const core = EXERCISES.filter((e) => e.category === "core")
    expect(core.length).toBeGreaterThan(0)
  })

  test("all category filters sum to total exercises", () => {
    const categories: ExerciseCategory[] = [
      "strength",
      "cardio",
      "mobility",
      "core",
    ]
    const totalFiltered = categories.reduce(
      (sum, cat) => sum + EXERCISES.filter((e) => e.category === cat).length,
      0
    )
    expect(totalFiltered).toBe(EXERCISES.length)
  })
})

// ── Popular exercise suggestions ─────────────────────────────────────────────

describe("visiblePopularExerciseSearches", () => {
  test("returns a useful default set of exercise suggestions", () => {
    expect(
      visiblePopularExerciseSearches([]).map((exercise) => exercise.name)
    ).toEqual([
      "Barbell Squat",
      "Bench Press",
      "Deadlift",
      "Pull-up",
      "Zone 2 Run",
      "Plank",
    ])
  })

  test("hides exercises that are already added", () => {
    expect(
      visiblePopularExerciseSearches(["e1", "e2"]).map(
        (exercise) => exercise.id
      )
    ).toEqual(["e3", "e4", "e9", "e17"])
  })

  test("ignores popular ids missing from a narrowed exercise list", () => {
    const narrowed = EXERCISES.filter((exercise) => exercise.id !== "e1")
    expect(
      visiblePopularExerciseSearches([], narrowed).map(
        (exercise) => exercise.id
      )
    ).not.toContain("e1")
  })
})
