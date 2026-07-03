import { describe, expect, test } from "bun:test"
import {
  clearRecentFoodSearches,
  POPULAR_FOOD_SEARCHES,
  nextRecentFoodSearches,
  normalizeRecentFoodSearches,
  readRecentFoodSearches,
  visiblePopularFoodSearches,
  writeRecentFoodSearches,
} from "../food-search-recents"

function mockStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

const RECENT_KEY = "onerep:recent-food-searches:v1"

describe("recent food search helpers", () => {
  test("normalizes, dedupes, and caps recent searches", () => {
    expect(
      normalizeRecentFoodSearches([
        " banana ",
        "BANANA",
        "Greek   yogurt",
        "a",
        "Eggs",
        "Chicken",
        "Salmon",
        "Rice",
        "Oats",
      ])
    ).toEqual(["banana", "Greek yogurt", "Eggs", "Chicken", "Salmon", "Rice"])
  })

  test("moves an existing query to the front", () => {
    expect(nextRecentFoodSearches(["banana", "Eggs"], " eggs ")).toEqual([
      "eggs",
      "banana",
    ])
  })

  test("ignores queries that are too short", () => {
    expect(nextRecentFoodSearches(["banana"], "a")).toEqual(["banana"])
  })

  test("reads valid storage and ignores invalid storage", () => {
    const storage = mockStorage({
      [RECENT_KEY]: JSON.stringify(["Banana", "Eggs"]),
    })
    expect(readRecentFoodSearches(storage)).toEqual(["Banana", "Eggs"])

    const brokenStorage = mockStorage({ [RECENT_KEY]: "not-json" })
    expect(readRecentFoodSearches(brokenStorage)).toEqual([])

    const blockedStorage = {
      getItem() {
        throw new Error("storage blocked")
      },
      setItem() {},
      removeItem() {},
    }
    expect(readRecentFoodSearches(blockedStorage)).toEqual([])
  })

  test("writes normalized searches and removes empty lists", () => {
    const storage = mockStorage()
    writeRecentFoodSearches(["  banana  ", "BANANA", "Eggs"], storage)

    expect(JSON.parse(storage.getItem(RECENT_KEY) ?? "[]")).toEqual([
      "banana",
      "Eggs",
    ])

    writeRecentFoodSearches([], storage)
    expect(storage.getItem(RECENT_KEY)).toBeNull()
  })

  test("clears stored recent searches", () => {
    const storage = mockStorage({ [RECENT_KEY]: JSON.stringify(["Banana"]) })
    clearRecentFoodSearches(storage)
    expect(storage.getItem(RECENT_KEY)).toBeNull()
  })

  test("swallows storage write and clear failures", () => {
    const blockedStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("quota exceeded")
      },
      removeItem() {
        throw new Error("remove blocked")
      },
    }

    expect(() =>
      writeRecentFoodSearches(["banana"], blockedStorage)
    ).not.toThrow()
    expect(() => writeRecentFoodSearches([], blockedStorage)).not.toThrow()
    expect(() => clearRecentFoodSearches(blockedStorage)).not.toThrow()
  })

  test("hides popular suggestions that already appear in recent searches", () => {
    expect(POPULAR_FOOD_SEARCHES).toContain("Banana")
    expect(visiblePopularFoodSearches(["banana", "eggs"])).toEqual([
      "Greek yogurt",
      "Chicken breast",
    ])
  })
})
