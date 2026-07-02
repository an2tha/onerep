import { describe, test, expect } from "bun:test"
import {
  dateToIso,
  localNoon,
  subtractDays,
  calcStreak,
  calcWorkoutsThisWeek,
  buildCalendarDays,
} from "../training-consistency"

// Fixed reference date: Wednesday 2026-04-15
const REF = new Date("2026-04-15T12:00:00Z")

function mkDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

describe("dateToIso", () => {
  test("formats a date as YYYY-MM-DD", () => {
    expect(dateToIso(mkDate("2026-04-15"))).toBe("2026-04-15")
  })

  test("uses the local calendar day instead of the UTC date", () => {
    expect(dateToIso(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01")
  })

  test("zero-pads month and day", () => {
    expect(dateToIso(mkDate("2026-01-05"))).toBe("2026-01-05")
  })

  test("handles year boundary", () => {
    expect(dateToIso(mkDate("2025-12-31"))).toBe("2025-12-31")
    expect(dateToIso(mkDate("2026-01-01"))).toBe("2026-01-01")
  })
})

describe("localNoon", () => {
  test("normalizes a copy to local noon", () => {
    const original = new Date(2026, 0, 1, 0, 30, 45, 123)
    const normalized = localNoon(original)

    expect(dateToIso(normalized)).toBe("2026-01-01")
    expect(normalized.getHours()).toBe(12)
    expect(normalized.getMinutes()).toBe(0)
    expect(normalized.getSeconds()).toBe(0)
    expect(normalized.getMilliseconds()).toBe(0)
    expect(original.getHours()).toBe(0)
  })
})

describe("subtractDays", () => {
  test("subtracting 0 returns the same date", () => {
    expect(dateToIso(subtractDays(REF, 0))).toBe("2026-04-15")
  })

  test("subtracts positive days correctly", () => {
    expect(dateToIso(subtractDays(REF, 1))).toBe("2026-04-14")
    expect(dateToIso(subtractDays(REF, 7))).toBe("2026-04-08")
  })

  test("negative days move forward in time", () => {
    expect(dateToIso(subtractDays(REF, -1))).toBe("2026-04-16")
    expect(dateToIso(subtractDays(REF, -7))).toBe("2026-04-22")
  })

  test("crosses month boundaries correctly", () => {
    expect(dateToIso(subtractDays(mkDate("2026-05-01"), 1))).toBe("2026-04-30")
    expect(dateToIso(subtractDays(mkDate("2026-03-01"), 1))).toBe("2026-02-28")
  })

  test("does not mutate the original date", () => {
    const original = new Date(REF)
    subtractDays(REF, 5)
    expect(REF.getTime()).toBe(original.getTime())
  })
})

describe("calcStreak", () => {
  test("counts today's workout using the local calendar day", () => {
    const earlyLocalMorning = new Date(2026, 0, 1, 0, 30)
    expect(calcStreak(new Set(["2026-01-01"]), earlyLocalMorning)).toBe(1)
  })

  test("returns 0 when today has no workout", () => {
    const dates = new Set(["2026-04-13", "2026-04-14"])
    expect(calcStreak(dates, REF)).toBe(0)
  })

  test("returns 1 for only today", () => {
    const dates = new Set(["2026-04-15"])
    expect(calcStreak(dates, REF)).toBe(1)
  })

  test("counts consecutive days including today", () => {
    // REF = 2026-04-15 (Wed)
    const dates = new Set(["2026-04-13", "2026-04-14", "2026-04-15"])
    expect(calcStreak(dates, REF)).toBe(3)
  })

  test("stops at a gap", () => {
    // Missing 2026-04-13 — streak starts at 14
    const dates = new Set(["2026-04-12", "2026-04-14", "2026-04-15"])
    expect(calcStreak(dates, REF)).toBe(2)
  })

  test("long streak of 10 days", () => {
    const dates = new Set(
      Array.from({ length: 10 }, (_, i) =>
        dateToIso(subtractDays(REF, 9 - i))
      )
    )
    expect(calcStreak(dates, REF)).toBe(10)
  })

  test("empty set returns 0", () => {
    expect(calcStreak(new Set(), REF)).toBe(0)
  })
})

describe("calcWorkoutsThisWeek", () => {
  // REF = Wednesday 2026-04-15; week Mon 2026-04-13 … Sun 2026-04-19
  test("counts local early-morning workouts in the correct week", () => {
    const earlyLocalMonday = new Date(2026, 0, 5, 0, 30)
    expect(calcWorkoutsThisWeek(new Set(["2026-01-05"]), earlyLocalMonday)).toBe(1)
  })

  test("returns 0 with no workouts", () => {
    expect(calcWorkoutsThisWeek(new Set(), REF)).toBe(0)
  })

  test("counts only workouts in current week up to today", () => {
    const dates = new Set([
      "2026-04-13", // Mon ✓
      "2026-04-14", // Tue ✓
      "2026-04-15", // Wed (today) ✓
      "2026-04-16", // Thu (future) ✗
    ])
    expect(calcWorkoutsThisWeek(dates, REF)).toBe(3)
  })

  test("ignores days from last week", () => {
    const dates = new Set(["2026-04-06", "2026-04-15"])
    expect(calcWorkoutsThisWeek(dates, REF)).toBe(1)
  })

  test("handles Sunday as the last day of the week", () => {
    // Sunday 2026-04-19 — week Mon Apr 13 … Sun Apr 19
    const sunday = mkDate("2026-04-19")
    const dates = new Set([
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
      "2026-04-18",
      "2026-04-19",
    ])
    expect(calcWorkoutsThisWeek(dates, sunday)).toBe(7)
  })

  test("handles today being Monday (start of week)", () => {
    const monday = mkDate("2026-04-13")
    const dates = new Set(["2026-04-13"])
    expect(calcWorkoutsThisWeek(dates, monday)).toBe(1)
  })
})

describe("buildCalendarDays", () => {
  test("ends on the local calendar day for early-morning users", () => {
    expect(buildCalendarDays(new Date(2026, 0, 1, 0, 30), 2)).toEqual([
      "2025-12-31",
      "2026-01-01",
    ])
  })

  test("returns the correct number of days", () => {
    expect(buildCalendarDays(REF, 28)).toHaveLength(28)
    expect(buildCalendarDays(REF, 7)).toHaveLength(7)
  })

  test("last element is today", () => {
    const days = buildCalendarDays(REF, 28)
    expect(days[days.length - 1]).toBe("2026-04-15")
  })

  test("first element is (n-1) days before today", () => {
    const days = buildCalendarDays(REF, 28)
    expect(days[0]).toBe("2026-03-19")
  })

  test("days are in ascending order", () => {
    const days = buildCalendarDays(REF, 14)
    for (let i = 1; i < days.length; i++) {
      expect(days[i] > days[i - 1]).toBe(true)
    }
  })

  test("consecutive days differ by exactly one day", () => {
    const days = buildCalendarDays(REF, 7)
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(`${days[i - 1]}T12:00:00Z`)
      const curr = new Date(`${days[i]}T12:00:00Z`)
      const diffMs = curr.getTime() - prev.getTime()
      expect(diffMs).toBe(24 * 60 * 60 * 1000)
    }
  })

  test("n=1 returns only today", () => {
    expect(buildCalendarDays(REF, 1)).toEqual(["2026-04-15"])
  })
})
