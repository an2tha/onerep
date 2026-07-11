export type ActiveWorkoutProgress = {
  completedSets: number
  totalSets: number
  elapsedMinutes: number
}

type ActiveWorkoutSnapshot = {
  exerciseData?: unknown
  elapsedSeconds?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function getActiveWorkoutProgress(
  workout: ActiveWorkoutSnapshot | null
): ActiveWorkoutProgress | null {
  if (!workout || !isRecord(workout.exerciseData)) return null

  let completedSets = 0
  let totalSets = 0
  for (const exercise of Object.values(workout.exerciseData)) {
    if (!isRecord(exercise) || !Array.isArray(exercise.sets)) continue
    for (const set of exercise.sets) {
      if (!isRecord(set)) continue
      totalSets += 1
      if (set.completed === true) completedSets += 1
    }
  }

  const elapsedSeconds =
    typeof workout.elapsedSeconds === "number" && workout.elapsedSeconds > 0
      ? workout.elapsedSeconds
      : 0

  return {
    completedSets,
    totalSets,
    elapsedMinutes: Math.round(elapsedSeconds / 60),
  }
}
