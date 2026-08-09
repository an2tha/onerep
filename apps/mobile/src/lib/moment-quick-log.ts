/**
 * Turning a session the user has already done into one they can log in a tap.
 *
 * A completed workout log already holds exactly the payload the completion
 * mutation takes, so repeating one needs no preset expansion, no exercise
 * catalog and no numbers typed. That is the whole idea: the fastest way to
 * record a session nobody wrote down is to point at the last one like it.
 */

import { daysBetween } from "./moments"

/** The set shape `completedSetValidator` accepts, and nothing else. */
export type QuickLogSet = {
  type: string
  reps: number
  weight: number
  completed: boolean
  rpe?: number
  rir?: number
}

export type QuickLogExercise = {
  id: string
  name: string
  category?: string
  sets: QuickLogSet[]
  cardio?: unknown
}

export type SourceWorkoutLog = {
  _id?: string
  date: string
  durationSeconds?: number
  exercises?: unknown[]
}

export type QuickLogCandidate = {
  /** Stable per source log, for React keys and dedupe. */
  id: string
  title: string
  detail: string
  sourceDate: string
  exercises: QuickLogExercise[]
  durationSeconds: number
  setCount: number
}

/** How many past sessions are worth offering. Past three it is a list. */
const MAX_CANDIDATES = 3
/** Older than this and "log it again" is a guess, not a shortcut. */
const LOOKBACK_DAYS = 45

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * Rebuilds a stored exercise list into the exact shape the mutation validates.
 *
 * Stored rows are `v.any()` and span every version of this app that has ever
 * written one. Passing them back unedited would push whatever a 2024 build
 * happened to include through a validator that has since been tightened.
 */
export function normalizeLoggedExercises(raw: unknown[]): QuickLogExercise[] {
  const exercises: QuickLogExercise[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const source = entry as Record<string, unknown>
    const id = typeof source.id === "string" ? source.id : null
    const name = typeof source.name === "string" ? source.name : null
    if (!id || !name) continue

    const sets: QuickLogSet[] = Array.isArray(source.sets)
      ? source.sets.flatMap((rawSet) => {
          if (!rawSet || typeof rawSet !== "object") return []
          const set = rawSet as Record<string, unknown>
          // An uncompleted set was planned, not performed. Repeating a session
          // means repeating what happened.
          if (set.completed !== true) return []
          return [
            {
              type: typeof set.type === "string" ? set.type : "normal",
              reps: number(set.reps),
              weight: number(set.weight),
              completed: true,
              rpe: optionalNumber(set.rpe),
              rir: optionalNumber(set.rir),
            },
          ]
        })
      : []

    const cardio =
      source.cardio && typeof source.cardio === "object"
        ? source.cardio
        : undefined

    if (sets.length === 0 && !cardio) continue

    exercises.push({
      id,
      name,
      ...(typeof source.category === "string"
        ? { category: source.category }
        : {}),
      sets,
      ...(cardio ? { cardio } : {}),
    })
  }

  return exercises
}

function titleFor(exercises: QuickLogExercise[]) {
  const names = exercises.map((exercise) => exercise.name)
  if (names.length === 0) return "Empty session"
  if (names.length <= 2) return names.join(" & ")
  return `${names[0]} & ${names.length - 1} more`
}

function whenLabel(sourceDate: string, todayKey: string) {
  const ago = daysBetween(sourceDate, todayKey)
  if (ago <= 0) return "today"
  if (ago === 1) return "yesterday"
  if (ago < 7) {
    return new Date(`${sourceDate}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
    })
  }
  return new Date(`${sourceDate}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Recent sessions worth repeating onto `targetDate`, best first.
 *
 * "Best" is the same weekday first — training splits are weekly, so what
 * happened last Monday is the strongest guess at what happened this one —
 * then plain recency. Sessions already logged on the target date are dropped:
 * offering to duplicate today's workout is how a day ends up with two.
 */
export function buildQuickLogCandidates({
  workoutLogs,
  targetDate,
  todayKey,
  limit = MAX_CANDIDATES,
}: {
  workoutLogs: SourceWorkoutLog[]
  targetDate: string
  todayKey: string
  limit?: number
}): QuickLogCandidate[] {
  const targetWeekday = new Date(`${targetDate}T12:00:00`).getDay()

  const usable = workoutLogs
    .filter((log) => log.date !== targetDate)
    .filter((log) => {
      const age = daysBetween(log.date, targetDate)
      return age > 0 && age <= LOOKBACK_DAYS
    })
    .map((log) => {
      const exercises = normalizeLoggedExercises(log.exercises ?? [])
      return { log, exercises }
    })
    .filter(({ exercises }) => exercises.length > 0)

  const ranked = usable.sort((a, b) => {
    const aWeekday = new Date(`${a.log.date}T12:00:00`).getDay()
    const bWeekday = new Date(`${b.log.date}T12:00:00`).getDay()
    const aMatch = aWeekday === targetWeekday ? 0 : 1
    const bMatch = bWeekday === targetWeekday ? 0 : 1
    if (aMatch !== bMatch) return aMatch - bMatch
    return b.log.date.localeCompare(a.log.date)
  })

  const seen = new Set<string>()
  const candidates: QuickLogCandidate[] = []

  for (const { log, exercises } of ranked) {
    // Two identical sessions are one suggestion.
    const signature = exercises
      .map((exercise) => `${exercise.id}:${exercise.sets.length}`)
      .join("|")
    if (seen.has(signature)) continue
    seen.add(signature)

    const setCount = exercises.reduce(
      (total, exercise) => total + exercise.sets.length,
      0
    )
    const minutes = Math.round(number(log.durationSeconds) / 60)

    candidates.push({
      id: log._id ?? `${log.date}:${signature}`,
      title: titleFor(exercises),
      detail: [
        plural(exercises.length, "exercise", "exercises"),
        plural(setCount, "set", "sets"),
        minutes > 0 ? `${minutes} min` : null,
        whenLabel(log.date, todayKey),
      ]
        .filter(Boolean)
        .join(" · "),
      sourceDate: log.date,
      exercises,
      durationSeconds: Math.max(0, Math.round(number(log.durationSeconds))),
      setCount,
    })

    if (candidates.length >= limit) break
  }

  return candidates
}
