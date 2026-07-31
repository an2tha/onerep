import { describe, expect, test } from "bun:test"
import {
  FASTING_PRESETS,
  fastElapsedSeconds,
  fastProgress,
  fastRemainingSeconds,
  fastingStats,
  formatFastDuration,
  suggestedFastStart,
  type FastingSession,
} from "@/lib/fasting"

const HOUR = 3_600_000
const DAY = 24 * HOUR

function session(overrides: Partial<FastingSession> = {}): FastingSession {
  return {
    startedAt: Date.UTC(2026, 6, 30, 20, 0, 0),
    endedAt: Date.UTC(2026, 6, 31, 12, 0, 0),
    targetMinutes: 16 * 60,
    protocol: "16:8",
    startDate: "2026-07-30",
    endDate: "2026-07-31",
    ...overrides,
  }
}

describe("presets", () => {
  test("every preset has a positive target and a distinct id", () => {
    const ids = FASTING_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of FASTING_PRESETS) {
      expect(preset.targetMinutes).toBeGreaterThan(0)
    }
  })
})

describe("formatFastDuration", () => {
  test("formats sub-day durations as hh:mm:ss", () => {
    expect(formatFastDuration(0)).toBe("00:00:00")
    expect(formatFastDuration(59)).toBe("00:00:59")
    expect(formatFastDuration(3600)).toBe("01:00:00")
    expect(formatFastDuration(86399)).toBe("23:59:59")
  })

  test("rolls over to a day prefix past 24 hours", () => {
    expect(formatFastDuration(86400)).toBe("1d 00:00")
    // 90000s = 25h 0m.
    expect(formatFastDuration(90000)).toBe("1d 01:00")
  })

  test("negative and non-finite input reads as zero", () => {
    expect(formatFastDuration(-500)).toBe("00:00:00")
    expect(formatFastDuration(Number.NaN)).toBe("00:00:00")
  })
})

describe("elapsed and remaining", () => {
  const startedAt = Date.UTC(2026, 6, 31, 8, 0, 0)

  test("elapsed counts up from the start", () => {
    expect(fastElapsedSeconds(startedAt, startedAt + 2 * HOUR)).toBe(7200)
  })

  test("a clock jumping backwards never yields a negative elapsed", () => {
    expect(fastElapsedSeconds(startedAt, startedAt - HOUR)).toBe(0)
  })

  test("progress is zero before the start rather than negative", () => {
    expect(fastProgress(startedAt, 960, startedAt - HOUR)).toBe(0)
  })

  test("progress passes 1 once the target is exceeded", () => {
    expect(fastProgress(startedAt, 60, startedAt + 30 * 60_000)).toBeCloseTo(0.5)
    expect(fastProgress(startedAt, 60, startedAt + 2 * HOUR)).toBeCloseTo(2)
  })

  test("a zero target reports no progress rather than dividing by zero", () => {
    expect(fastProgress(startedAt, 0, startedAt + HOUR)).toBe(0)
  })

  test("remaining never goes negative past the target", () => {
    expect(fastRemainingSeconds(startedAt, 60, startedAt)).toBe(3600)
    expect(fastRemainingSeconds(startedAt, 60, startedAt + 5 * HOUR)).toBe(0)
  })
})

describe("fastingStats", () => {
  test("no sessions yields a fully zeroed result", () => {
    expect(fastingStats([], "2026-07-31")).toEqual({
      totalCompleted: 0,
      averageHours: 0,
      longestHours: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      goalHitRate: 0,
    })
  })

  test("a still-running fast is not counted", () => {
    const stats = fastingStats(
      [session({ endedAt: undefined, endDate: undefined })],
      "2026-07-31"
    )
    expect(stats.totalCompleted).toBe(0)
    expect(stats.averageHours).toBe(0)
  })

  test("averages and longest use completed durations", () => {
    const base = Date.UTC(2026, 6, 29, 20, 0, 0)
    const stats = fastingStats(
      [
        session({ startedAt: base, endedAt: base + 16 * HOUR }),
        session({
          startedAt: base + DAY,
          endedAt: base + DAY + 20 * HOUR,
          endDate: "2026-07-31",
        }),
      ],
      "2026-07-31"
    )
    expect(stats.totalCompleted).toBe(2)
    expect(stats.averageHours).toBe(18)
    expect(stats.longestHours).toBe(20)
  })

  test("goal hit rate counts fasts that reached their target", () => {
    const base = Date.UTC(2026, 6, 30, 20, 0, 0)
    const stats = fastingStats(
      [
        // 16h against a 16h target: hit.
        session({ startedAt: base, endedAt: base + 16 * HOUR }),
        // 10h against a 16h target: missed.
        session({
          startedAt: base + DAY,
          endedAt: base + DAY + 10 * HOUR,
          endDate: "2026-08-01",
        }),
      ],
      "2026-08-01"
    )
    expect(stats.goalHitRate).toBe(0.5)
  })

  test("a gap day breaks the current streak", () => {
    const stats = fastingStats(
      [
        session({ endDate: "2026-07-31" }),
        session({ endDate: "2026-07-30" }),
        // 2026-07-29 is missing, so the run stops at two.
        session({ endDate: "2026-07-28" }),
      ],
      "2026-07-31"
    )
    expect(stats.currentStreakDays).toBe(2)
    expect(stats.longestStreakDays).toBe(2)
  })

  test("two fasts ending on the same day count once toward the streak", () => {
    const stats = fastingStats(
      [session({ endDate: "2026-07-31" }), session({ endDate: "2026-07-31" })],
      "2026-07-31"
    )
    expect(stats.totalCompleted).toBe(2)
    expect(stats.currentStreakDays).toBe(1)
  })

  test("a fast ending yesterday keeps today's streak alive", () => {
    // Today may simply not be over yet — that should not reset the run.
    const stats = fastingStats([session({ endDate: "2026-07-30" })], "2026-07-31")
    expect(stats.currentStreakDays).toBe(1)
  })

  test("a streak across a month boundary is continuous", () => {
    const stats = fastingStats(
      [session({ endDate: "2026-08-01" }), session({ endDate: "2026-07-31" })],
      "2026-08-01"
    )
    expect(stats.currentStreakDays).toBe(2)
  })

  test("malformed input does not throw", () => {
    expect(fastingStats(undefined as never, "2026-07-31").totalCompleted).toBe(0)
    expect(
      fastingStats([session({ endedAt: Number.NaN })], "2026-07-31")
        .totalCompleted
    ).toBe(0)
  })
})

describe("suggestedFastStart", () => {
  test("returns null for an empty day", () => {
    expect(suggestedFastStart([])).toBeNull()
    expect(suggestedFastStart(undefined)).toBeNull()
    expect(suggestedFastStart(null)).toBeNull()
  })

  test("picks the latest timestamp, not the last array element", () => {
    const result = suggestedFastStart([
      { loggedAt: "2026-07-31T19:42:00.000Z" },
      { loggedAt: "2026-07-31T08:10:00.000Z" },
    ])
    expect(result).toBe(Date.parse("2026-07-31T19:42:00.000Z"))
  })

  test("ignores unparseable and missing timestamps", () => {
    const result = suggestedFastStart([
      { loggedAt: "not a date" },
      {},
      { loggedAt: "2026-07-31T12:00:00.000Z" },
    ])
    expect(result).toBe(Date.parse("2026-07-31T12:00:00.000Z"))
  })

  test("returns null when nothing is parseable", () => {
    expect(suggestedFastStart([{ loggedAt: "nope" }, {}])).toBeNull()
  })
})
