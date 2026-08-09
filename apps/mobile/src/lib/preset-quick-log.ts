/**
 * Turning a saved plan into a completed session.
 *
 * Extracted out of the quick-log page so the check-in moment can log a preset
 * without navigating to it. Both callers expand the same abridged rows into
 * the same per-set state, so what the moment writes and what the page would
 * have written can never disagree.
 */

import { createClientId } from "./utils"
import type { Exercise } from "./exercise-catalog"
import {
  cardioLogFromState,
  isCardioExercise,
  makeSet,
  normalizeExerciseState,
  toDisplay,
  toKg,
  type ExerciseState,
  type WeightUnit,
  type WorkoutItem,
} from "./workout-logging"

/** One abridged row: the whole exercise collapsed to three numbers. */
export type QuickRow = {
  exerciseId: string
  setCount: string
  reps: string
  weight: string
}

/** Every exercise in the plan, in order, with supersets flattened. */
export function flattenItems(items: WorkoutItem[]): string[] {
  return items.flatMap((item) =>
    item.kind === "solo" ? [item.exerciseId] : item.exerciseIds
  )
}

/**
 * Collapses a planned exercise into "N sets of R at W".
 *
 * The first set carries the row because a preset's later sets are usually
 * copies of it; where they aren't, the user has the full logger one tap away.
 */
export function rowFromState(
  exerciseId: string,
  state: ExerciseState,
  unit: WeightUnit
): QuickRow {
  const first = state.sets[0]
  return {
    exerciseId,
    setCount: state.sets.length > 0 ? String(state.sets.length) : "3",
    reps: first?.reps ?? "",
    weight: first ? toDisplay(first.weight, unit) : "",
  }
}

/** The rows a preset starts at, before anybody edits them. */
export function rowsFromPreset(
  items: WorkoutItem[],
  exerciseData: Record<string, ExerciseState>,
  unit: WeightUnit
): QuickRow[] {
  return flattenItems(items).map((id) =>
    rowFromState(id, normalizeExerciseState(exerciseData[id]), unit)
  )
}

/**
 * Expands the abridged rows back into per-set state.
 *
 * Saving and handing off to the full logger both go through here, so what
 * gets written and what the user then sees can never disagree.
 */
export function expandToExerciseData({
  rows,
  presetExerciseData,
  lookup,
  unit,
}: {
  rows: QuickRow[]
  presetExerciseData: Record<string, ExerciseState>
  lookup: Record<string, Exercise>
  unit: WeightUnit
}): Record<string, ExerciseState> {
  const expanded: Record<string, ExerciseState> = {}

  for (const row of rows) {
    const base = normalizeExerciseState(presetExerciseData[row.exerciseId])
    const exercise = lookup[row.exerciseId]
    if (exercise && isCardioExercise(exercise)) {
      expanded[row.exerciseId] = base
      continue
    }
    const count = Math.min(Math.max(parseInt(row.setCount, 10) || 0, 0), 20)
    const weightKg = toKg(row.weight, unit)
    expanded[row.exerciseId] = {
      ...base,
      sets: Array.from({ length: count }, (_, index) => ({
        ...makeSet(true),
        id: base.sets[index]?.id ?? createClientId(),
        restSeconds: base.sets[index]?.restSeconds ?? 120,
        reps: row.reps,
        weight: weightKg,
      })),
    }
  }

  return expanded
}

/** The payload `logs.workouts.completion` takes, built from expanded state. */
export function buildCompletionExercises({
  exerciseIds,
  exerciseData,
  lookup,
}: {
  exerciseIds: string[]
  exerciseData: Record<string, ExerciseState>
  lookup: Record<string, Exercise>
}) {
  return exerciseIds.flatMap((id) => {
    const exercise = lookup[id]
    if (!exercise) return []
    const data = exerciseData[id]
    if (!data) return []

    const cardio = isCardioExercise(exercise)
      ? cardioLogFromState(data.cardio)
      : null
    const sets = isCardioExercise(exercise)
      ? []
      : data.sets.map((set) => ({
          type: "normal",
          weight: parseFloat(String(set.weight)) || 0,
          reps: parseFloat(String(set.reps)) || 0,
          completed: true,
        }))

    if (sets.length === 0 && !cardio) return []

    return [
      {
        id,
        name: exercise.name,
        category: exercise.category,
        sets,
        ...(cardio ? { cardio } : {}),
      },
    ]
  })
}

/** "4 exercises · 14 sets" — the line under a preset offered as a one-tap log. */
export function describePresetPlan(rows: QuickRow[]) {
  const sets = rows.reduce(
    (total, row) => total + (parseInt(row.setCount, 10) || 0),
    0
  )
  const exercises = rows.length
  return `${exercises} ${exercises === 1 ? "exercise" : "exercises"} · ${sets} ${
    sets === 1 ? "set" : "sets"
  }`
}
