import { describe, expect, test } from "bun:test"

import { hasDrinkSplit, hydrationWeek } from "../hydration-trend"
import { dayHydrationMl } from "../hydration"

const day = (waterMl: number[], drinksMl: number[]) => ({
  water: waterMl.map((amountMl) => ({ amountMl })),
  food: drinksMl.map((hydrationMl) => ({ hydrationMl })),
})

describe("a week of water, split by where it came from", () => {
  test("the two halves add up to the total they came from", () => {
    const week = hydrationWeek([
      day([500], [330]),
      day([250], [0]),
      day([750], [200]),
      day([1000], []),
    ])
    expect(week.totalMl).toBe(3030)
    expect(week.fromDrinksMl).toBe(530)
    expect(week.fromGlassesMl).toBe(2500)
    expect(week.fromDrinksMl + week.fromGlassesMl).toBe(week.totalMl)
  })

  test("the total is whatever the day helper says, day by day", () => {
    const days = [day([500], [330]), day([250], [0]), day([], [400])]
    const week = hydrationWeek(days)
    expect(week.totalMl).toBe(
      days.reduce(
        (sum, entry) => sum + dayHydrationMl(entry.water, entry.food),
        0
      )
    )
  })

  test("a day with nothing logged is not a day of zero water", () => {
    const week = hydrationWeek([day([500], [100]), day([], []), day([], [])])
    // The empty days are dropped rather than counted as slumps — this is the
    // count of days that carried water, not of days in the window.
    expect(week.days).toBe(1)
    expect(week.totalMl).toBe(600)
  })

  test("drinks alone still count as a day of water", () => {
    const week = hydrationWeek([day([], [400]), day([], [300])])
    expect(week.days).toBe(2)
    expect(week.fromDrinksMl).toBe(700)
    expect(week.fromGlassesMl).toBe(0)
    expect(week.drinkPercent).toBe(100)
  })

  test("the share is a whole percent of the week's water", () => {
    // 1 in 3 — 33%, not 33.333…
    expect(hydrationWeek([day([667], [333])]).drinkPercent).toBe(33)
    expect(hydrationWeek([day([500], [500])]).drinkPercent).toBe(50)
    // A twentieth is five, not a rounded-away zero sub-percent.
    expect(hydrationWeek([day([1900], [100])]).drinkPercent).toBe(5)
  })

  test("missing sides are zero rather than an error", () => {
    const week = hydrationWeek([{}, { water: undefined, food: undefined }])
    expect(week.totalMl).toBe(0)
    expect(week.days).toBe(0)
    expect(week.drinkPercent).toBe(0)
    expect(hydrationWeek(undefined).totalMl).toBe(0)
  })

  test("a week with no drinks has no split to report", () => {
    const week = hydrationWeek([day([500], []), day([750], [])])
    expect(week.fromDrinksMl).toBe(0)
    expect(week.drinkPercent).toBe(0)
    expect(hasDrinkSplit(week)).toBe(false)
  })

  test("one logged day is today, not a trend", () => {
    expect(hasDrinkSplit(hydrationWeek([day([500], [300])]))).toBe(false)
    // Two days is the point at which the words "this week" are honest.
    expect(hasDrinkSplit(hydrationWeek([day([500], [300]), day([250], [])]))).toBe(
      true
    )
    expect(hasDrinkSplit(null)).toBe(false)
    expect(hasDrinkSplit(undefined)).toBe(false)
  })

  test("a drink logged on a day whose water was never recorded still splits", () => {
    const week = hydrationWeek([day([500], [100]), day([], [250])])
    expect(week.days).toBe(2)
    expect(week.totalMl).toBe(850)
    expect(week.fromDrinksMl).toBe(350)
    // Never negative, however the halves are rounded.
    expect(week.fromGlassesMl).toBeGreaterThanOrEqual(0)
  })
})
