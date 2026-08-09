/**
 * Per-exercise progress math for the exercise browser.
 *
 * Everything here is pure and works in kilograms — the display layer converts.
 * Warm-up sets are counted nowhere: they inflate volume, they never set a
 * record, and a chart that jumps because someone did an extra empty-bar set is
 * a chart nobody trusts twice.
 */

import { estimate1RM } from "./one-rm"

export type HistorySet = {
  weight: number
  reps: number
  completed: boolean
  type: string
}

export type HistorySession = {
  id?: string
  date: string
  sets: HistorySet[]
}

export type SessionSummary = {
  id: string
  date: string
  /** Completed working sets, in the order they were logged. */
  sets: HistorySet[]
  /** Σ weight × reps, in kg. */
  volume: number
  heaviestWeight: number
  bestE1rm: number
  totalReps: number
}

export type PersonalRecord = {
  value: number
  date: string
}

export type PersonalRecords = {
  heaviestWeight: PersonalRecord | null
  bestE1rm: PersonalRecord | null
  bestSessionVolume: PersonalRecord | null
  mostReps: PersonalRecord | null
}

export function isWorkingSet(set: HistorySet): boolean {
  return set.completed !== false && set.type !== "warmup"
}

function round(value: number, places = 1): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Collapses raw logs into one summary per session, oldest first, dropping
 * sessions where nothing was actually completed.
 */
export function summariseSessions(
  history: HistorySession[] | undefined
): SessionSummary[] {
  if (!history) return []

  return history
    .map((session, index) => {
      const sets = session.sets.filter(isWorkingSet)
      const volume = sets.reduce(
        (total, set) => total + (set.weight || 0) * (set.reps || 0),
        0
      )
      const e1rms = sets.map((set) =>
        estimate1RM(set.weight || 0, set.reps || 0)
      )
      return {
        id: session.id ?? `${session.date}:${index}`,
        date: session.date,
        sets,
        volume: round(volume),
        heaviestWeight: sets.reduce(
          (best, set) => Math.max(best, set.weight || 0),
          0
        ),
        bestE1rm: round(
          e1rms.reduce((best, value) => Math.max(best, value), 0)
        ),
        totalReps: sets.reduce((total, set) => total + (set.reps || 0), 0),
      }
    })
    .filter((session) => session.sets.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function bestBy(
  sessions: SessionSummary[],
  pick: (session: SessionSummary) => number
): PersonalRecord | null {
  let best: PersonalRecord | null = null
  for (const session of sessions) {
    const value = pick(session)
    // Strictly greater, so the record keeps the date it was first hit rather
    // than sliding forward every time it is matched.
    if (value > 0 && (!best || value > best.value)) {
      best = { value, date: session.date }
    }
  }
  return best
}

export function personalRecords(sessions: SessionSummary[]): PersonalRecords {
  return {
    heaviestWeight: bestBy(sessions, (s) => s.heaviestWeight),
    bestE1rm: bestBy(sessions, (s) => s.bestE1rm),
    bestSessionVolume: bestBy(sessions, (s) => s.volume),
    mostReps: bestBy(sessions, (s) =>
      s.sets.reduce((best, set) => Math.max(best, set.reps || 0), 0)
    ),
  }
}

export type ProgressMetric = "e1rm" | "heaviest" | "volume"

export const PROGRESS_METRIC_LABELS: Record<ProgressMetric, string> = {
  e1rm: "Est. 1RM",
  heaviest: "Heaviest set",
  volume: "Session volume",
}

export function metricSeries(
  sessions: SessionSummary[],
  metric: ProgressMetric
): number[] {
  return sessions.map((session) => {
    if (metric === "heaviest") return session.heaviestWeight
    if (metric === "volume") return session.volume
    return session.bestE1rm
  })
}

/**
 * Percentage change between the first and last session in the series, or null
 * when there is nothing to compare against.
 */
export function trendPercent(series: number[]): number | null {
  const first = series.find((value) => value > 0)
  const last = [...series].reverse().find((value) => value > 0)
  if (first === undefined || last === undefined || series.length < 2)
    return null
  if (first === last) return 0
  return round(((last - first) / first) * 100, 0)
}
