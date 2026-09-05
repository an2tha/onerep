import { describe, expect, test } from "bun:test"
import {
  foodLogContextParams,
  foodLogTime,
  foodLogTimestamp,
  isFoodLogDate,
  isFoodLogTime,
} from "../food-log-context"
import { foodLogEntryFromCustomFood } from "../custom-foods"

describe("backdated food logging", () => {
  test("carries a timeline selection through search, review and custom-food logging", () => {
    const search = new URL(
      `https://onerep.test/foods/search?${foodLogContextParams("2026-09-02", foodLogTime(14 * 60 + 9))}`
    )
    const review = new URL(
      `https://onerep.test/foods/review/123?${foodLogContextParams(search.searchParams.get("date")!, search.searchParams.get("time"))}`
    )
    const date = review.searchParams.get("date")!
    const entry = foodLogEntryFromCustomFood(
      {
        name: "Italian Chicken Sausage",
        servingLabel: "link",
        nutrientsPerServing: { calories: 80, protein: 12, carbs: 1, fat: 2.5 },
      },
      {
        meal: "lunch",
        servings: 2,
        loggedAt: foodLogTimestamp(date, review.searchParams.get("time")),
      }
    )
    const at = new Date(entry.loggedAt)
    expect(date).toBe("2026-09-02")
    expect([
      at.getFullYear(),
      at.getMonth() + 1,
      at.getDate(),
      at.getHours(),
      at.getMinutes(),
    ]).toEqual([2026, 9, 2, 14, 9])
    expect(entry.calories).toBe(160)
  })

  test("defaults to the current clock on the selected day, not today's date", () => {
    const at = new Date(
      foodLogTimestamp("2026-09-02", undefined, new Date(2026, 8, 3, 1, 18))
    )
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2, 1, 18])
  })

  test("preserves midnight and late-night selections across a year boundary", () => {
    for (const time of ["00:00", "23:59"]) {
      const at = new Date(foodLogTimestamp("2025-12-31", time))
      expect([at.getFullYear(), at.getMonth(), at.getDate()]).toEqual([
        2025, 11, 31,
      ])
      expect(foodLogTime(undefined, at)).toBe(time)
    }
  })

  test("validates calendar dates and times before using route parameters", () => {
    expect(isFoodLogDate("2024-02-29")).toBe(true)
    for (const date of [
      null,
      "",
      "2026-02-29",
      "2026-09-31",
      "2026-13-01",
      "2026-9-2",
    ])
      expect(isFoodLogDate(date)).toBe(false)
    for (const time of [null, "", "24:00", "12:60", "NaN", "1:18"])
      expect(isFoodLogTime(time)).toBe(false)
    expect(foodLogContextParams("2026-09-02", "24:00")).toBe("date=2026-09-02")
    expect(() => foodLogTimestamp("2026-02-30")).toThrow("Choose a valid date")
  })
})
