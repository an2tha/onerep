import { describe, expect, it } from "bun:test"
import { promoteLoggedFoods } from "@/lib/food-search-ranking"

const results = [
  { name: "Banana chips", brand: "Sunsnack" },
  { name: "Greek yogurt", brand: "Fage" },
  { name: "Banana", brand: "" },
]

describe("promoteLoggedFoods", () => {
  it("lifts food already in the diary above anything new", () => {
    const ranked = promoteLoggedFoods(results, ["banana"])
    expect(ranked[0]?.name).toBe("Banana")
  })

  it("keeps relevance order inside each group", () => {
    const ranked = promoteLoggedFoods(results, ["banana", "greek yogurts"])
    expect(ranked.map((item) => item.name)).toEqual([
      "Greek yogurt",
      "Banana",
      "Banana chips",
    ])
  })

  it("changes nothing when the diary is empty", () => {
    expect(promoteLoggedFoods(results, [])).toEqual(results)
  })
})
