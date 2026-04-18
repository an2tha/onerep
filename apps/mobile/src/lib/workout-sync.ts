export type WorkoutFocus = "strength" | "cardio" | "mobility"

// ─── Workout log types ────────────────────────────────────────────────────────

export type CachedWorkoutLog = {
  _id?: string // Convex ID
  date: string // YYYY-MM-DD
  exercises: Array<{
    exerciseId: string
    name: string
    trackRpe: boolean
    trackUnilateral: boolean
    sets: Array<{
      weight: string
      reps: string
      leftReps: string
      rightReps: string
      rpe: string
      completed: boolean
    }>
  }>
  durationSeconds: number
  completedAt: string // ISO string
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export type WorkoutPresetCard = {
  id: string
  name: string
  focus: WorkoutFocus
  duration: string
  steps: string[]
}

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
export type Routine = Record<Day, string | null>

export function normalizePresetCard(input: {
  id: string
  name: string
  focus?: string | null
  duration?: string | null
  steps?: string[] | null
}): WorkoutPresetCard {
  return {
    id: input.id,
    name: input.name,
    focus:
      input.focus === "cardio" || input.focus === "mobility"
        ? input.focus
        : "strength",
    duration: input.duration ?? "30 min",
    steps:
      Array.isArray(input.steps) && input.steps.length > 0
        ? input.steps
        : ["Warm up 5 min"],
  }
}
