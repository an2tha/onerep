export type CompletedSet = {
  weight: string
  reps: string
  leftReps: string
  rightReps: string
  rpe: string
  completed: boolean
}

export type CompletedExercise = {
  exerciseId: string
  name: string
  trackRpe: boolean
  trackUnilateral: boolean
  sets: CompletedSet[]
}

export type WorkoutLog = {
  /** ISO date string YYYY-MM-DD */
  date: string
  userId: string
  exercises: CompletedExercise[]
  durationSeconds: number
  completedAt: Date
}
