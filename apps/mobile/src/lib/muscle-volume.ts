/**
 * Muscle-group volume analytics.
 *
 * Computes weekly sets per muscle group from workout history, using the
 * exercise catalog's primaryMuscles / secondaryMuscles metadata.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MuscleSets = {
  muscle: string
  /** Completed sets where this muscle is the primary target */
  primarySets: number
  /** Completed sets where this muscle is a secondary target */
  secondarySets: number
  /** Total effective sets (primary + 0.5 × secondary) */
  effectiveSets: number
}

export type ExerciseMeta = {
  id: string
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
}

export type WorkoutSetRecord = {
  completed: boolean
}

export type WorkoutExerciseRecord = {
  id: string
  sets: WorkoutSetRecord[]
}

export type WorkoutLogRecord = {
  date: string // YYYY-MM-DD
  exercises: WorkoutExerciseRecord[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the ISO week start (Monday) for a given date string.
 * The returned string is also YYYY-MM-DD.
 */
export function weekStart(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`)
  const dow = d.getUTCDay() // 0 = Sun
  const daysFromMon = dow === 0 ? 6 : dow - 1
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() - daysFromMon)
  return mon.toISOString().slice(0, 10)
}

/**
 * Normalise a muscle name: lowercase, trim.
 */
export function normaliseMuscle(name: string): string {
  return name.trim().toLowerCase()
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Aggregate completed sets per muscle group for the given workout logs.
 *
 * @param logs       Workout logs to analyse (any date range)
 * @param catalog    Map of exerciseId → ExerciseMeta (primary/secondary muscles)
 * @param fromIso    Start date inclusive (YYYY-MM-DD). Pass null to include all.
 * @param toIso      End date inclusive (YYYY-MM-DD). Pass null to include all.
 */
export function computeMuscleVolume(
  logs: WorkoutLogRecord[],
  catalog: Map<string, ExerciseMeta>,
  fromIso: string | null = null,
  toIso: string | null = null,
): MuscleSets[] {
  const primary: Record<string, number> = {}
  const secondary: Record<string, number> = {}

  for (const log of logs) {
    if (fromIso && log.date < fromIso) continue
    if (toIso && log.date > toIso) continue

    for (const exercise of log.exercises) {
      const meta = catalog.get(exercise.id)
      if (!meta) continue

      const completedSets = exercise.sets.filter((s) => s.completed).length
      if (completedSets === 0) continue

      for (const m of meta.primaryMuscles ?? []) {
        const key = normaliseMuscle(m)
        primary[key] = (primary[key] ?? 0) + completedSets
      }
      for (const m of meta.secondaryMuscles ?? []) {
        const key = normaliseMuscle(m)
        secondary[key] = (secondary[key] ?? 0) + completedSets
      }
    }
  }

  // Merge into a combined list, sorted by effectiveSets descending
  const muscles = new Set([...Object.keys(primary), ...Object.keys(secondary)])
  return Array.from(muscles)
    .map((muscle) => {
      const p = primary[muscle] ?? 0
      const s = secondary[muscle] ?? 0
      return {
        muscle,
        primarySets: p,
        secondarySets: s,
        effectiveSets: p + s * 0.5,
      }
    })
    .sort((a, b) => b.effectiveSets - a.effectiveSets)
}

/**
 * Convenience: compute muscle volume for the current ISO week
 * (Monday–Sunday containing `today`).
 */
export function computeWeeklyMuscleVolume(
  logs: WorkoutLogRecord[],
  catalog: Map<string, ExerciseMeta>,
  today: Date,
): MuscleSets[] {
  const todayIso = today.toISOString().slice(0, 10)
  const from = weekStart(todayIso)
  // End is always current day so future days aren't included
  return computeMuscleVolume(logs, catalog, from, todayIso)
}

/**
 * Build an ExerciseMeta catalog Map from a flat array.
 */
export function buildCatalogMap(
  exercises: ExerciseMeta[],
): Map<string, ExerciseMeta> {
  return new Map(exercises.map((e) => [e.id, e]))
}
