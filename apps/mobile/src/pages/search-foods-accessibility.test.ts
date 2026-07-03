import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SEARCH_FOODS_SOURCE = readFileSync(
  new URL("./SearchFoods.tsx", import.meta.url),
  "utf8",
)

describe("Search foods accessibility contract", () => {
  test("search field exposes stable mobile form metadata", () => {
    expect(SEARCH_FOODS_SOURCE).toContain('name="food-search-query"')
    expect(SEARCH_FOODS_SOURCE).toContain('aria-label="Search foods"')
  })

  test("icon-only search controls expose names and button semantics", () => {
    expect(SEARCH_FOODS_SOURCE).toContain('aria-label="Go back"')
    expect(SEARCH_FOODS_SOURCE).toContain('aria-label="Clear search"')
    expect(SEARCH_FOODS_SOURCE).toContain('type="button"')
  })

  test("meal selection sheet actions are explicit buttons", () => {
    expect(SEARCH_FOODS_SOURCE).toContain("key={cat.id}")
    expect(SEARCH_FOODS_SOURCE).toContain('type="button"')
    expect(SEARCH_FOODS_SOURCE).toContain("await onSelect(cat.id)")
    expect(SEARCH_FOODS_SOURCE).toContain("disabled={Boolean(savingMeal)}")
    expect(SEARCH_FOODS_SOURCE).toContain("aria-busy={savingMeal === cat.id}")
  })

  test("idle search state exposes recent and popular suggestions", () => {
    expect(SEARCH_FOODS_SOURCE).toContain("readRecentFoodSearches")
    expect(SEARCH_FOODS_SOURCE).toContain("nextRecentFoodSearches")
    expect(SEARCH_FOODS_SOURCE).toContain("visiblePopularFoodSearches")
    expect(SEARCH_FOODS_SOURCE).toContain("writeRecentFoodSearches")
    expect(SEARCH_FOODS_SOURCE).toContain('title="Recent"')
    expect(SEARCH_FOODS_SOURCE).toContain('title="Popular"')
    expect(SEARCH_FOODS_SOURCE).toContain("SearchSuggestionGroup")
  })

  test("quick add meal selection waits for offline persistence before closing", () => {
    expect(SEARCH_FOODS_SOURCE).toContain(
      "onSelect={async (meal) => {",
    )
    expect(SEARCH_FOODS_SOURCE).toContain("await handleAdd(")
    expect(SEARCH_FOODS_SOURCE).toContain("setPendingItem(null)")
    expect(SEARCH_FOODS_SOURCE).toContain("reportOfflineMutationError(error)")
  })

  test("food add persistence is single flight and exposes busy state", () => {
    expect(SEARCH_FOODS_SOURCE).toContain(
      "const addingFoodRef = useRef<string | null>(null)",
    )
    expect(SEARCH_FOODS_SOURCE).toContain(
      "const [addingFoodId, setAddingFoodId] = useState<string | null>(null)",
    )
    expect(SEARCH_FOODS_SOURCE).toContain("if (addingFoodRef.current) return")
    expect(SEARCH_FOODS_SOURCE).toContain("addingFoodRef.current = item.id")
    expect(SEARCH_FOODS_SOURCE).toContain("setAddingFoodId(item.id)")
    expect(SEARCH_FOODS_SOURCE).toContain("addingFoodRef.current = null")
    expect(SEARCH_FOODS_SOURCE).toContain("setAddingFoodId(null)")
    expect(SEARCH_FOODS_SOURCE).toContain(
      "disabled={isAdded || addingFoodId !== null}",
    )
    expect(SEARCH_FOODS_SOURCE).toContain("aria-busy={isAdding}")
    expect(SEARCH_FOODS_SOURCE).toContain("hapticSelection()")
    expect(SEARCH_FOODS_SOURCE).toContain("motion-success-pop")
  })
})
