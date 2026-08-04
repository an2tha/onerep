import { describe, expect, test } from "bun:test"
import {
  CUSTOM_EXERCISE_ID_PREFIX,
  customExerciseDocId,
  customExerciseDraftFromExercise,
  emptyCustomExerciseDraft,
  isCustomExerciseId,
  parseInstructions,
  parseMuscleList,
  validateCustomExerciseDraft,
} from "../custom-exercises"
import type { Exercise } from "../exercise-catalog"

describe("custom exercise ids", () => {
  test("only ids with the custom prefix are treated as custom", () => {
    expect(isCustomExerciseId(`${CUSTOM_EXERCISE_ID_PREFIX}abc123`)).toBe(true)
    // Bundled fallback ids and dataset slugs must never be mistaken for custom.
    expect(isCustomExerciseId("e1")).toBe(false)
    expect(isCustomExerciseId("Barbell_Squat")).toBe(false)
  })

  test("customExerciseDocId strips the prefix and rejects catalog ids", () => {
    expect(customExerciseDocId(`${CUSTOM_EXERCISE_ID_PREFIX}abc123`)).toBe(
      "abc123"
    )
    expect(customExerciseDocId("e1")).toBeNull()
  })
})

describe("parseMuscleList", () => {
  test("splits on commas and newlines, trimming and de-duplicating", () => {
    expect(parseMuscleList(" glutes, Hamstrings\nglutes ,, ")).toEqual([
      "glutes",
      "Hamstrings",
    ])
  })

  test("returns an empty list for blank input", () => {
    expect(parseMuscleList("   \n , ")).toEqual([])
  })
})

describe("parseInstructions", () => {
  test("keeps one cue per non-blank line", () => {
    expect(
      parseInstructions("Hinge at the hip.\n\n  Squeeze at the top. ")
    ).toEqual(["Hinge at the hip.", "Squeeze at the top."])
  })

  test("caps the number of cues", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Cue ${i}`).join("\n")
    expect(parseInstructions(many)).toHaveLength(12)
  })
})

describe("validateCustomExerciseDraft", () => {
  test("requires a name", () => {
    const result = validateCustomExerciseDraft(
      emptyCustomExerciseDraft({ name: "   " })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.name).toBeTruthy()
  })

  test("rejects an over-long name", () => {
    const result = validateCustomExerciseDraft(
      emptyCustomExerciseDraft({ name: "x".repeat(81) })
    )
    expect(result.valid).toBe(false)
    expect(result.errors.name).toContain("80")
  })

  test("builds a save payload from a valid draft", () => {
    const result = validateCustomExerciseDraft(
      emptyCustomExerciseDraft({
        name: "  Reverse Hyper  ",
        category: "core",
        equipment: " Bench ",
        primaryMuscles: "glutes, hamstrings",
        secondaryMuscles: "",
        instructions: "Hinge at the hip.",
      })
    )

    expect(result.valid).toBe(true)
    expect(result.value).toEqual({
      id: undefined,
      name: "Reverse Hyper",
      category: "core",
      equipment: "Bench",
      primaryMuscles: ["glutes", "hamstrings"],
      secondaryMuscles: [],
      instructions: ["Hinge at the hip."],
    })
  })

  test("omits blank equipment rather than sending an empty string", () => {
    const result = validateCustomExerciseDraft(
      emptyCustomExerciseDraft({ name: "Sled Push", equipment: "   " })
    )
    expect(result.value.equipment).toBeUndefined()
  })
})

describe("customExerciseDraftFromExercise", () => {
  test("round-trips a saved custom exercise back into an editable draft", () => {
    const exercise: Exercise = {
      id: `${CUSTOM_EXERCISE_ID_PREFIX}doc123`,
      name: "Reverse Hyper",
      category: "core",
      muscle: "Glutes · Hamstrings",
      description: "Hinge at the hip.",
      sets: "3 × 12 reps",
      color: "#3b82f6",
      equipment: "bench",
      primaryMuscles: ["glutes", "hamstrings"],
      secondaryMuscles: ["lower back"],
      instructions: ["Hinge at the hip.", "Squeeze at the top."],
      custom: true,
    }

    const draft = customExerciseDraftFromExercise(exercise)

    expect(draft.docId).toBe("doc123")
    expect(draft.primaryMuscles).toBe("glutes, hamstrings")
    expect(draft.instructions).toBe("Hinge at the hip.\nSqueeze at the top.")

    // Editing and re-validating preserves the document id, so save updates.
    const result = validateCustomExerciseDraft(draft)
    expect(result.valid).toBe(true)
    expect(result.value.id).toBe("doc123")
  })
})
