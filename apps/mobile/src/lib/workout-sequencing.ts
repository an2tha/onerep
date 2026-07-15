export type WorkoutSequenceItem =
  | { kind: "solo"; exerciseId: string }
  | { kind: "superset"; exerciseIds: string[] }

export type WorkoutSequenceExercise =
  { kind: "cardio"; complete: boolean } | { kind: "sets"; completed: boolean[] }

export type WorkoutSequenceTarget =
  | { kind: "cardio"; exerciseId: string }
  | { kind: "set"; exerciseId: string; setIndex: number }
  | null

export function findNextWorkoutSequenceTarget(
  items: WorkoutSequenceItem[],
  getExercise: (exerciseId: string) => WorkoutSequenceExercise | undefined
): WorkoutSequenceTarget {
  for (const item of items) {
    if (item.kind === "solo") {
      const exercise = getExercise(item.exerciseId)
      if (!exercise) continue
      if (exercise.kind === "cardio") {
        if (!exercise.complete) {
          return { kind: "cardio", exerciseId: item.exerciseId }
        }
        continue
      }
      const setIndex = exercise.completed.findIndex((complete) => !complete)
      if (setIndex !== -1) {
        return { kind: "set", exerciseId: item.exerciseId, setIndex }
      }
      continue
    }

    const exercises = item.exerciseIds.map((exerciseId) => ({
      exerciseId,
      exercise: getExercise(exerciseId),
    }))
    const maxRounds = Math.max(
      1,
      ...exercises.map(({ exercise }) =>
        exercise?.kind === "sets" ? exercise.completed.length : 1
      )
    )

    for (let setIndex = 0; setIndex < maxRounds; setIndex += 1) {
      for (const { exerciseId, exercise } of exercises) {
        if (!exercise) continue
        if (exercise.kind === "cardio") {
          if (setIndex === 0 && !exercise.complete) {
            return { kind: "cardio", exerciseId }
          }
          continue
        }
        if (exercise.completed[setIndex] === false) {
          return { kind: "set", exerciseId, setIndex }
        }
      }
    }
  }
  return null
}
