export type ExerciseHistoryEntry = {
  id?: unknown
  exerciseId?: unknown
  sets?: Array<{ completed?: unknown }>
}

export type WorkoutHistoryEntry = {
  exercises?: ExerciseHistoryEntry[]
}

export function getLoggedExerciseId(exercise: ExerciseHistoryEntry) {
  if (typeof exercise.id === "string" && exercise.id.trim()) {
    return exercise.id
  }

  if (typeof exercise.exerciseId === "string" && exercise.exerciseId.trim()) {
    return exercise.exerciseId
  }

  return null
}

export function getExerciseIdsFromHistory(history: WorkoutHistoryEntry[]) {
  return [
    ...new Set(
      history.flatMap((log) =>
        (log.exercises ?? [])
          .map((exercise) => getLoggedExerciseId(exercise))
          .filter((id): id is string => Boolean(id))
      )
    ),
  ]
}

export function getCompletedSetCountsByExercise(
  history: WorkoutHistoryEntry[]
) {
  const counts = new Map<string, number>()

  for (const log of history) {
    for (const exercise of log.exercises ?? []) {
      const id = getLoggedExerciseId(exercise)
      if (!id) continue

      const completedSets = (exercise.sets ?? []).filter(
        (set) => set.completed
      ).length

      if (completedSets > 0) {
        counts.set(id, (counts.get(id) ?? 0) + completedSets)
      }
    }
  }

  return counts
}
