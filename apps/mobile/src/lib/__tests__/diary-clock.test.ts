import { describe, expect, test } from "bun:test"
import { diaryTime, diaryTimestamp } from "../diary-clock"
import { currentDateKey } from "../food-log"

describe("diary clock", () => {
  test("uses the diary zone for the day and minute across midnight", () => {
    const at = new Date("2026-10-07T22:05:00Z")
    expect(currentDateKey("Europe/Berlin", at)).toBe("2026-10-08")
    expect(diaryTime(at, "Europe/Berlin")).toBe("00:05")
    expect(diaryTime(at, "America/New_York")).toBe("18:05")
  })
  test("persists a historical time in the diary zone", () => {
    expect(diaryTimestamp("2026-09-30", "10:30", "Europe/Berlin")).toBe(
      "2026-09-30T08:30:00.000Z"
    )
    expect(diaryTimestamp("2026-12-30", "10:30", "Europe/Berlin")).toBe(
      "2026-12-30T09:30:00.000Z"
    )
  })
  test("rejects invalid dates and nonexistent spring-forward times", () => {
    expect(() =>
      diaryTimestamp("2026-03-29", "02:30", "Europe/Berlin")
    ).toThrow("does not exist")
    expect(() =>
      diaryTimestamp("2026-02-30", "10:30", "Europe/Berlin")
    ).toThrow()
    expect(() =>
      diaryTimestamp("2026-10-07", "24:00", "Europe/Berlin")
    ).toThrow()
  })
})
