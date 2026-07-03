import { describe, expect, test } from "bun:test"
import {
  foodSearchParamsForQuery,
  normalizeFoodSearchQuery,
  readFoodSearchQuery,
} from "../food-search-url"

describe("food search URL helpers", () => {
  test("normalizes URL query values", () => {
    expect(normalizeFoodSearchQuery("  greek   yogurt  ")).toBe("greek yogurt")
    expect(normalizeFoodSearchQuery("banana\u0000 smoothie")).toBe(
      "banana smoothie"
    )
  })

  test("limits very long query values", () => {
    expect(normalizeFoodSearchQuery("a".repeat(120))).toHaveLength(80)
  })

  test("reads the q parameter from URLSearchParams", () => {
    const params = new URLSearchParams("q=chicken%20breast")
    expect(readFoodSearchQuery(params)).toBe("chicken breast")
  })

  test("writes normalized q while preserving unrelated params", () => {
    const next = foodSearchParamsForQuery(
      new URLSearchParams("meal=lunch&q=old"),
      "  eggs  "
    )

    expect(next.get("meal")).toBe("lunch")
    expect(next.get("q")).toBe("eggs")
  })

  test("removes q when the query is blank", () => {
    const next = foodSearchParamsForQuery(
      new URLSearchParams("meal=lunch&q=old"),
      "   "
    )

    expect(next.get("meal")).toBe("lunch")
    expect(next.has("q")).toBe(false)
  })
})
