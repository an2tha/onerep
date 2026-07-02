import { describe, expect, test } from "bun:test"
import {
  foodSearchRelevanceScore,
  normalizeFoodSearchText,
  rankAndFilterFoodSearchResults,
} from "../food-search-ranking"

const foods = [
  { id: "1", name: "Chocolate Banana Protein Shake", brand: "OneRep" },
  { id: "2", name: "Banana", brand: "Fresh" },
  { id: "3", name: "Banana", brand: "unknown" },
  { id: "4", name: "Bananas", brand: "" },
  { id: "5", name: "Greek Yogurt", brand: "Fage" },
  { id: "6", name: "Yogurts Greek Style", brand: "unknown" },
]

describe("food search ranking", () => {
  test("normalizes accents, punctuation, and case", () => {
    expect(normalizeFoodSearchText("  Crème-Brûlée!  ")).toBe("creme brulee")
  })

  test("ranks exact name matches ahead of broader partial matches", () => {
    const ranked = rankAndFilterFoodSearchResults(foods, "banana")
    expect(ranked[0].id).toBe("2")
    expect(ranked[1].id).toBe("1")
  })

  test("filters unknown-brand duplicates when a known-brand result exists", () => {
    const ranked = rankAndFilterFoodSearchResults(foods, "banana")
    expect(ranked.map((item) => item.id)).not.toContain("3")
    expect(ranked.map((item) => item.id)).not.toContain("4")
  })

  test("keeps unknown-brand results when they are not duplicates", () => {
    const ranked = rankAndFilterFoodSearchResults(foods, "greek yogurt")
    expect(ranked.map((item) => item.id)).toContain("6")
  })

  test("singularizes common plural query and name tokens", () => {
    expect(
      foodSearchRelevanceScore(
        { name: "Strawberries", brand: "Fresh" },
        "strawberry",
        0
      )
    ).toBeGreaterThan(1000)
  })
})
