/**
 * Intermittent fasting: presets, duration formatting and history statistics.
 *
 * Everything here is pure so the timer maths can be tested without a clock —
 * `now` is always an argument, never `Date.now()`.
 */

export type FastingProtocol = "16:8" | "18:6" | "20:4" | "omad" | "custom"

export type FastingPreset = {
  id: FastingProtocol
  label: string
  targetMinutes: number
  detail: string
}

export const FASTING_PRESETS: FastingPreset[] = [
  {
    id: "16:8",
    label: "16:8",
    targetMinutes: 16 * 60,
    detail: "16 hours fasting, 8 hour window",
  },
  {
    id: "18:6",
    label: "18:6",
    targetMinutes: 18 * 60,
    detail: "18 hours fasting, 6 hour window",
  },
  {
    id: "20:4",
    label: "20:4",
    targetMinutes: 20 * 60,
    detail: "20 hours fasting, 4 hour window",
  },
  {
    id: "omad",
    label: "OMAD",
    targetMinutes: 23 * 60,
    detail: "One meal a day",
  },
]

export type FastingSession = {
  _id?: string
  id?: string
  startedAt: number
  endedAt?: number
  targetMinutes: number
  protocol: string
  startDate: string
  endDate?: string
  note?: string
  endedEarly?: boolean
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** hh:mm:ss under a day, `1d 04:12` beyond it. */
export function formatFastDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(safeNumber(seconds)))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const pad = (value: number) => String(value).padStart(2, "0")

  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}`
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
}

/** Never negative, even if the device clock jumps backwards mid-fast. */
export function fastElapsedSeconds(startedAt: number, now: number): number {
  return Math.max(
    0,
    Math.floor((safeNumber(now) - safeNumber(startedAt)) / 1000)
  )
}

/** 0 at the start, 1 at target, and beyond 1 once the target is passed. */
export function fastProgress(
  startedAt: number,
  targetMinutes: number,
  now: number
): number {
  const target = safeNumber(targetMinutes)
  if (target <= 0) return 0
  return fastElapsedSeconds(startedAt, now) / (target * 60)
}

export function fastRemainingSeconds(
  startedAt: number,
  targetMinutes: number,
  now: number
): number {
  const target = Math.max(0, safeNumber(targetMinutes)) * 60
  return Math.max(0, Math.round(target - fastElapsedSeconds(startedAt, now)))
}

export type FastingStats = {
  totalCompleted: number
  averageHours: number
  longestHours: number
  currentStreakDays: number
  longestStreakDays: number
  /** Share of completed fasts that reached their target, 0–1. */
  goalHitRate: number
}

const EMPTY_STATS: FastingStats = {
  totalCompleted: 0,
  averageHours: 0,
  longestHours: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
  goalHitRate: 0,
}

function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function round(value: number, places = 1): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * History statistics over **completed** fasts only.
 *
 * A running fast has no duration yet, so counting it would make the average
 * jump around every second. A fast counts toward the streak on its `endDate`,
 * and two fasts finishing on the same day count once.
 */
export function fastingStats(
  sessions: FastingSession[],
  today: string
): FastingStats {
  if (!Array.isArray(sessions)) return { ...EMPTY_STATS }

  const completed = sessions.filter(
    (session) =>
      typeof session?.endedAt === "number" &&
      Number.isFinite(session.endedAt) &&
      session.endedAt >= session.startedAt
  )
  if (completed.length === 0) return { ...EMPTY_STATS }

  const durationsHours = completed.map(
    (session) => ((session.endedAt as number) - session.startedAt) / 3_600_000
  )
  const totalHours = durationsHours.reduce((sum, hours) => sum + hours, 0)
  const hitTarget = completed.filter((session, index) => {
    const minutes = durationsHours[index] * 60
    return minutes >= safeNumber(session.targetMinutes)
  }).length

  const dayKeys = new Set(
    completed
      .map((session) => session.endDate ?? session.startDate)
      .filter((key): key is string => typeof key === "string" && key.length > 0)
  )

  // Current streak counts back from today. A fast that ended today is not
  // required — an in-progress day should not break a run.
  let currentStreakDays = 0
  let cursor = dayKeys.has(today) ? today : previousDateKey(today)
  while (dayKeys.has(cursor)) {
    currentStreakDays += 1
    cursor = previousDateKey(cursor)
  }

  let longestStreakDays = 0
  const sortedKeys = [...dayKeys].sort()
  let run = 0
  let previous: string | null = null
  for (const key of sortedKeys) {
    run = previous !== null && previousDateKey(key) === previous ? run + 1 : 1
    longestStreakDays = Math.max(longestStreakDays, run)
    previous = key
  }

  return {
    totalCompleted: completed.length,
    averageHours: round(totalHours / completed.length),
    longestHours: round(Math.max(...durationsHours)),
    currentStreakDays,
    longestStreakDays,
    goalHitRate: round(hitTarget / completed.length, 2),
  }
}

/**
 * The latest `loggedAt` across a day's entries, as epoch ms.
 *
 * Backs the "start from my last meal" affordance. Entries are not guaranteed
 * to be ordered and `loggedAt` is a free-form string server-side, so this
 * takes the maximum and ignores anything unparseable.
 */
export function suggestedFastStart(
  entries: { loggedAt?: string }[] | undefined | null
): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null

  let latest: number | null = null
  for (const entry of entries) {
    if (!entry?.loggedAt) continue
    const parsed = Date.parse(entry.loggedAt)
    if (!Number.isFinite(parsed)) continue
    if (latest === null || parsed > latest) latest = parsed
  }
  return latest
}
