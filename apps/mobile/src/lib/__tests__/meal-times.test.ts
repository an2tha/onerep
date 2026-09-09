import { beforeEach, describe, expect, test } from "bun:test"
import { foodLogTimestampForMeal } from "@/lib/food-log-context"
import {
  DEFAULT_MEAL_TIMES,
  MEAL_TIME_OFF,
  isMealTimeOff,
  mealDefaultTime,
  readMealTimes,
  writeMealTimes,
} from "@/lib/meal-times"

/** The app's storage helpers read `window.localStorage`; give them one. */
class MemoryStorage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

beforeEach(() => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  })
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
  })
})

describe("meal-times storage", () => {
  test("defaults exist for the four built-in meals", () => {
    expect(DEFAULT_MEAL_TIMES.breakfast).toMatch(/^\d{2}:\d{2}$/)
    expect(DEFAULT_MEAL_TIMES.lunch).toMatch(/^\d{2}:\d{2}$/)
    expect(DEFAULT_MEAL_TIMES.dinner).toMatch(/^\d{2}:\d{2}$/)
    expect(DEFAULT_MEAL_TIMES.snack).toMatch(/^\d{2}:\d{2}$/)
  })

  test("an empty store falls back to the built-in defaults", () => {
    expect(mealDefaultTime("breakfast")).toBe(DEFAULT_MEAL_TIMES.breakfast)
  })

  test("an unknown meal has no default", () => {
    expect(mealDefaultTime("second-dinner")).toBe(null)
  })

  test("a stored default wins over the built-in one", () => {
    writeMealTimes({ breakfast: "06:30" })
    expect(readMealTimes().breakfast).toBe("06:30")
    expect(mealDefaultTime("breakfast")).toBe("06:30")
  })

  test("the off marker suppresses the default", () => {
    writeMealTimes({ lunch: MEAL_TIME_OFF })
    expect(isMealTimeOff(MEAL_TIME_OFF)).toBe(true)
    expect(mealDefaultTime("lunch")).toBe(null)
  })

  test("malformed stored times are ignored on read", () => {
    writeMealTimes({ dinner: "25:99" })
    const stored = readMealTimes()
    expect(stored.dinner).toBeUndefined()
  })
})

describe("foodLogTimestampForMeal", () => {
  test("an explicit time wins over the meal default", () => {
    const stamp = foodLogTimestampForMeal("2026-09-09", "breakfast", "23:45")
    expect(stamp).toBe(new Date("2026-09-09T23:45:00").toISOString())
  })

  test("no time and no default falls back to the clock (same-day)", () => {
    const stamp = foodLogTimestampForMeal("2026-09-09", "second-dinner", null)
    expect(stamp.startsWith("2026-09-09T")).toBe(true)
  })

  test("a meal default stamps the entry at the meal's time", () => {
    writeMealTimes({ breakfast: "07:15" })
    const stamp = foodLogTimestampForMeal("2026-09-09", "breakfast", null)
    expect(stamp).toBe(new Date("2026-09-09T07:15:00").toISOString())
  })
})
