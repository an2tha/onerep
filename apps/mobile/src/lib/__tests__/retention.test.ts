import { describe, expect, test } from "bun:test"
import {
  dayBucket,
  daysBetweenDayKeys,
  localDateKey,
  retentionProperties,
} from "@/lib/retention"

describe("daysBetweenDayKeys", () => {
  test("counts calendar days, not elapsed hours", () => {
    expect(daysBetweenDayKeys("2026-08-03", "2026-08-04")).toBe(1)
    expect(daysBetweenDayKeys("2026-08-03", "2026-08-03")).toBe(0)
  })

  test("survives a month boundary", () => {
    expect(daysBetweenDayKeys("2026-07-31", "2026-08-01")).toBe(1)
    expect(daysBetweenDayKeys("2026-08-01", "2026-08-31")).toBe(30)
  })

  test("survives a leap day", () => {
    expect(daysBetweenDayKeys("2028-02-28", "2028-03-01")).toBe(2)
  })

  // The noon anchor exists for this: a 23-hour spring-forward day divided from
  // midnight rounds to zero and silently drops a day-one return.
  test("a daylight-saving day is still one day", () => {
    expect(daysBetweenDayKeys("2026-03-28", "2026-03-29")).toBe(1)
    expect(daysBetweenDayKeys("2026-10-24", "2026-10-25")).toBe(1)
  })

  test("rejects a malformed key rather than returning NaN", () => {
    expect(daysBetweenDayKeys("not-a-date", "2026-08-04")).toBeNull()
  })
})

describe("dayBucket", () => {
  test("reports the first month day by day", () => {
    expect(dayBucket(0)).toBe("d0")
    expect(dayBucket(1)).toBe("d1")
    expect(dayBucket(7)).toBe("d7")
    expect(dayBucket(30)).toBe("d30")
  })

  test("buckets the tail", () => {
    expect(dayBucket(31)).toBe("d31_60")
    expect(dayBucket(60)).toBe("d31_60")
    expect(dayBucket(61)).toBe("d61_90")
    expect(dayBucket(200)).toBe("d181_365")
    expect(dayBucket(9000)).toBe("d365_plus")
  })
})

describe("retentionProperties", () => {
  const signup = new Date("2026-08-03T09:15:00").getTime()

  test("day zero is the signup day itself", () => {
    const props = retentionProperties(signup, new Date("2026-08-03T23:50:00"))
    expect(props?.day).toBe("d0")
    expect(props?.days).toBe(0)
  })

  test("an open the next morning is day one", () => {
    const props = retentionProperties(signup, new Date("2026-08-04T07:00:00"))
    expect(props?.day).toBe("d1")
  })

  test("carries the ISO week the account was created in", () => {
    // 2026-08-03 is a Monday, so it starts its own ISO week.
    expect(retentionProperties(signup, new Date("2026-09-01T10:00:00"))?.cohort)
      .toBe("2026-W32")
  })

  test("the cohort does not move as the account ages", () => {
    const early = retentionProperties(signup, new Date("2026-08-04T10:00:00"))
    const late = retentionProperties(signup, new Date("2027-02-04T10:00:00"))
    expect(late?.cohort).toBe(early?.cohort)
  })

  test("never emits an identifier", () => {
    const props = retentionProperties(signup, new Date("2026-08-10T10:00:00"))
    expect(Object.keys(props ?? {}).sort()).toEqual(["cohort", "day", "days"])
  })

  // A phone with its clock set backwards would otherwise report a negative age
  // and pad whichever bucket it landed in.
  test("drops an open that predates the signup", () => {
    expect(retentionProperties(signup, new Date("2026-08-01T10:00:00"))).toBeNull()
  })

  test("drops a missing or nonsense signup", () => {
    const now = new Date("2026-08-10T10:00:00")
    expect(retentionProperties(null, now)).toBeNull()
    expect(retentionProperties(undefined, now)).toBeNull()
    expect(retentionProperties(0, now)).toBeNull()
    expect(retentionProperties(Number.NaN, now)).toBeNull()
  })
})

describe("localDateKey", () => {
  test("uses the local calendar, not UTC", () => {
    // Late evening local time is already tomorrow in UTC for +02:00 and east.
    const date = new Date("2026-08-03T23:30:00")
    expect(localDateKey(date)).toBe("2026-08-03")
  })
})
