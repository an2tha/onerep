import { readLocalizedSource as readFileSync } from "../../tests/helpers/localized-source"
import { describe, expect, test } from "bun:test"

const SEARCH_FOODS_SOURCE = readFileSync(
  new URL("./SearchFoods.tsx", import.meta.url),
  "utf8"
)

describe("Search foods accessibility contract", () => {
  test("a saved correction is applied to the result and the open sheet", () => {
    // The reactive custom-food list arrives on its own schedule, so the row
    // the user had just corrected kept printing the database's numbers and
    // looked as though the correction had been rejected.
    expect(SEARCH_FOODS_SOURCE).toContain(
      "const copy = customFoodFromDraft(correctionDraft)"
    )
    expect(SEARCH_FOODS_SOURCE).toContain("applyCorrectedCopy(result, copy)")
    expect(SEARCH_FOODS_SOURCE).toContain("applyCorrectedCopy(current, copy)")
  })

  test("search field exposes stable mobile form metadata", () => {
    expect(SEARCH_FOODS_SOURCE).toContain('name="food-search-query"')
    expect(SEARCH_FOODS_SOURCE).toContain('aria-label="Search foods"')
  })

  test("icon-only search controls expose names and button semantics", () => {
    expect(SEARCH_FOODS_SOURCE).toContain('aria-label="Go back"')
    expect(SEARCH_FOODS_SOURCE).toContain('aria-label="Clear search"')
    expect(SEARCH_FOODS_SOURCE).toContain('type="button"')
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

  test("the add button opens the same portion review as the card body", () => {
    // Both the card and its "+" go through openFoodReview so a food is never
    // logged at a guessed portion without the user picking one.
    expect(SEARCH_FOODS_SOURCE).toContain("openFoodReview(item)")
    expect(SEARCH_FOODS_SOURCE).not.toContain("MealSelectSheet")
  })

  test("food add persistence is single flight and exposes busy state", () => {
    expect(SEARCH_FOODS_SOURCE).toContain(
      "const addingFoodRef = useRef<string | null>(null)"
    )
    expect(SEARCH_FOODS_SOURCE).toContain(
      "const [addingFoodId, setAddingFoodId] = useState<string | null>(null)"
    )
    expect(SEARCH_FOODS_SOURCE).toContain("if (addingFoodRef.current) return")
    expect(SEARCH_FOODS_SOURCE).toContain("addingFoodRef.current = item.id")
    expect(SEARCH_FOODS_SOURCE).toContain("setAddingFoodId(item.id)")
    expect(SEARCH_FOODS_SOURCE).toContain("addingFoodRef.current = null")
    expect(SEARCH_FOODS_SOURCE).toContain("setAddingFoodId(null)")
    expect(SEARCH_FOODS_SOURCE).toContain(
      "disabled={isAdded || addingFoodId !== null}"
    )
    expect(SEARCH_FOODS_SOURCE).toContain("aria-busy={isAdding}")
    expect(SEARCH_FOODS_SOURCE).toContain("hapticSelection()")
    expect(SEARCH_FOODS_SOURCE).toContain("motion-success-pop")
  })
})
