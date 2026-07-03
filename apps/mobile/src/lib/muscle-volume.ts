/**
 * Muscle-group volume analytics.
 *
 * Computes weekly sets per muscle group from workout history, using the
 * exercise catalog's primaryMuscles / secondaryMuscles metadata.
 */

import { localDateKey } from "./utils"

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

export type MuscleRecoveryStatus = "trained" | "recovering" | "overdue"

export type MuscleRecovery = {
  muscle: string
  status: MuscleRecoveryStatus
  lastTrainedDate: string
  daysSinceLastTrained: number
  /** Completed primary sets on the most recent training day for this muscle */
  primarySets: number
  /** Completed secondary sets on the most recent training day for this muscle */
  secondarySets: number
  /** Effective sets on the most recent training day (primary + 0.5 × secondary) */
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

function isoDate(date: Date): string {
  return localDateKey(date)
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00Z`).getTime()
  const to = new Date(`${toIso}T12:00:00Z`).getTime()
  return Math.floor((to - from) / 86_400_000)
}

export function recoveryStatusForDays(
  daysSinceLastTrained: number
): MuscleRecoveryStatus {
  if (daysSinceLastTrained <= 1) return "trained"
  if (daysSinceLastTrained <= 4) return "recovering"
  return "overdue"
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
  toIso: string | null = null
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
  today: Date
): MuscleSets[] {
  const todayIso = isoDate(today)
  const from = weekStart(todayIso)
  // End is always current day so future days aren't included
  return computeMuscleVolume(logs, catalog, from, todayIso)
}

/**
 * Compute recovery status per muscle group from the latest completed workout
 * that trained each muscle.
 */
export function computeMuscleRecovery(
  logs: WorkoutLogRecord[],
  catalog: Map<string, ExerciseMeta>,
  today: Date
): MuscleRecovery[] {
  const todayIso = isoDate(today)
  const byMuscle = new Map<
    string,
    Map<string, { primarySets: number; secondarySets: number }>
  >()

  function addSets(
    muscle: string,
    date: string,
    kind: "primarySets" | "secondarySets",
    count: number
  ) {
    const key = normaliseMuscle(muscle)
    if (!key) return

    let byDate = byMuscle.get(key)
    if (!byDate) {
      byDate = new Map()
      byMuscle.set(key, byDate)
    }

    const current = byDate.get(date) ?? { primarySets: 0, secondarySets: 0 }
    current[kind] += count
    byDate.set(date, current)
  }

  for (const log of logs) {
    if (log.date > todayIso) continue

    for (const exercise of log.exercises) {
      const meta = catalog.get(exercise.id)
      if (!meta) continue

      const completedSets = exercise.sets.filter((s) => s.completed).length
      if (completedSets === 0) continue

      for (const muscle of meta.primaryMuscles ?? []) {
        addSets(muscle, log.date, "primarySets", completedSets)
      }

      for (const muscle of meta.secondaryMuscles ?? []) {
        addSets(muscle, log.date, "secondarySets", completedSets)
      }
    }
  }

  const statusRank: Record<MuscleRecoveryStatus, number> = {
    trained: 0,
    recovering: 1,
    overdue: 2,
  }

  return Array.from(byMuscle.entries())
    .map(([muscle, byDate]) => {
      const lastTrainedDate = Array.from(byDate.keys()).sort().at(-1)!
      const sets = byDate.get(lastTrainedDate)!
      const daysSinceLastTrained = Math.max(
        0,
        daysBetweenIso(lastTrainedDate, todayIso)
      )

      return {
        muscle,
        status: recoveryStatusForDays(daysSinceLastTrained),
        lastTrainedDate,
        daysSinceLastTrained,
        primarySets: sets.primarySets,
        secondarySets: sets.secondarySets,
        effectiveSets: sets.primarySets + sets.secondarySets * 0.5,
      }
    })
    .sort((a, b) => {
      const rankDiff = statusRank[a.status] - statusRank[b.status]
      if (rankDiff !== 0) return rankDiff
      if (a.daysSinceLastTrained !== b.daysSinceLastTrained) {
        return a.daysSinceLastTrained - b.daysSinceLastTrained
      }
      if (a.effectiveSets !== b.effectiveSets) {
        return b.effectiveSets - a.effectiveSets
      }
      return a.muscle.localeCompare(b.muscle)
    })
}

/**
 * Build an ExerciseMeta catalog Map from a flat array.
 */
export function buildCatalogMap(
  exercises: ExerciseMeta[]
): Map<string, ExerciseMeta> {
  return new Map(exercises.map((e) => [e.id, e]))
}
