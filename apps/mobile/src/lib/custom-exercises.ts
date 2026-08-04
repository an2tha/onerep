import type { Exercise, ExerciseCategory } from "@/lib/exercise-catalog"

export const CUSTOM_EXERCISE_ID_PREFIX = "custom:"

export const MAX_CUSTOM_EXERCISE_NAME_LENGTH = 80
export const MAX_CUSTOM_EXERCISE_INSTRUCTIONS = 12

export type CustomExerciseDraft = {
  /** Convex document id, absent while creating. */
  docId?: string
  name: string
  category: ExerciseCategory
  equipment: string
  /** Comma-separated, kept as raw text so the field stays easy to type in. */
  primaryMuscles: string
  secondaryMuscles: string
  instructions: string
}

export function isCustomExerciseId(id: string) {
  return id.startsWith(CUSTOM_EXERCISE_ID_PREFIX)
}

export function customExerciseDocId(id: string) {
  return isCustomExerciseId(id)
    ? id.slice(CUSTOM_EXERCISE_ID_PREFIX.length)
    : null
}

export function emptyCustomExerciseDraft(
  overrides: Partial<CustomExerciseDraft> = {}
): CustomExerciseDraft {
  return {
    name: "",
    category: "strength",
    equipment: "",
    primaryMuscles: "",
    secondaryMuscles: "",
    instructions: "",
    ...overrides,
  }
}

export function customExerciseDraftFromExercise(
  exercise: Exercise
): CustomExerciseDraft {
  return {
    docId: customExerciseDocId(exercise.id) ?? undefined,
    name: exercise.name,
    category: exercise.category,
    equipment: exercise.equipment ?? "",
    primaryMuscles: (exercise.primaryMuscles ?? []).join(", "),
    secondaryMuscles: (exercise.secondaryMuscles ?? []).join(", "),
    instructions: (exercise.instructions ?? []).join("\n"),
  }
}

/** Splits a comma/newline separated field into trimmed, de-duplicated entries. */
export function parseMuscleList(value: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of value.split(/[,\n]/)) {
    const entry = raw.trim()
    if (!entry) continue
    const key = entry.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
  }
  return result
}

export function parseInstructions(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_EXERCISE_INSTRUCTIONS)
}

export type CustomExerciseValidation = {
  errors: { name?: string }
  valid: boolean
  value: CustomExerciseSavePayload
}

export type CustomExerciseSavePayload = {
  id?: string
  name: string
  category: ExerciseCategory
  equipment?: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
}

export function validateCustomExerciseDraft(
  draft: CustomExerciseDraft
): CustomExerciseValidation {
  const errors: CustomExerciseValidation["errors"] = {}
  const name = draft.name.trim()

  if (!name) {
    errors.name = "Give the exercise a name."
  } else if (name.length > MAX_CUSTOM_EXERCISE_NAME_LENGTH) {
    errors.name = `Keep the name under ${MAX_CUSTOM_EXERCISE_NAME_LENGTH} characters.`
  }

  const equipment = draft.equipment.trim()
  return {
    errors,
    valid: Object.keys(errors).length === 0,
    value: {
      id: draft.docId,
      name,
      category: draft.category,
      equipment: equipment || undefined,
      primaryMuscles: parseMuscleList(draft.primaryMuscles),
      secondaryMuscles: parseMuscleList(draft.secondaryMuscles),
      instructions: parseInstructions(draft.instructions),
    },
  }
}
