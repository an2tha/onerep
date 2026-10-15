import type { WorkoutSet } from "./workout-logging"

/** Mark unlogged work once so prescriptions are never silently recorded. */
export function prepareWorkoutSet(
  set: WorkoutSet,
  relaxed: boolean
): WorkoutSet {
  if (set.completed) return set
  if (relaxed) {
    if (set.loggingMode === "relaxed")
      return set.weight === "" ? set : { ...set, weight: "" }
    return { ...set, loggingMode: "relaxed", weight: "", reps: "" }
  }
  if (set.loggingMode !== "relaxed") return set
  const { loggingMode: _, ...normal } = set
  return normal
}

export function serializeWorkoutSet(set: WorkoutSet) {
  return {
    type: "normal",
    // Legacy readers require numbers. The explicit mode distinguishes these
    // placeholders from measured load and keeps missing data out of progression.
    weight: set.loggingMode === "relaxed" ? 0 : parseFloat(set.weight) || 0,
    reps: parseFloat(set.reps) || 0,
    completed: set.completed,
    ...(set.loggingMode === "relaxed"
      ? { loggingMode: "relaxed" as const }
      : {}),
  }
}

/** One-tap logs have no entered measurements, even when copying a past session. */
export function omitQuickLogMeasurements<
  T extends { sets: Array<{ weight: number; reps: number }> },
>(exercises: T[]) {
  return exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({
      ...set,
      weight: 0,
      reps: 0,
      loggingMode: "relaxed" as const,
    })),
  }))
}
