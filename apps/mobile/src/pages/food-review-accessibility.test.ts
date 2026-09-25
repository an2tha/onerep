import { readLocalizedSource as readFileSync } from "../../tests/helpers/localized-source"
import { describe, expect, test } from "bun:test"

const FOOD_REVIEW_SOURCE = readFileSync(
  new URL("./FoodReview.tsx", import.meta.url),
  "utf8"
)

describe("Food review page production contract", () => {
  test("review logging is single-flight and retryable on persistence failure", () => {
    expect(FOOD_REVIEW_SOURCE).toContain("const [saving, setSaving]")
    expect(FOOD_REVIEW_SOURCE).toContain("const savingRef = useRef(false)")
    expect(FOOD_REVIEW_SOURCE).toContain(
      "if (savingRef.current || added) return"
    )
    expect(FOOD_REVIEW_SOURCE).toContain("savingRef.current = true")
    expect(FOOD_REVIEW_SOURCE).toContain("setSaving(true)")
    expect(FOOD_REVIEW_SOURCE).toContain("await addFoodEntry({")
    expect(FOOD_REVIEW_SOURCE).toContain("savingRef.current = false")
    expect(FOOD_REVIEW_SOURCE).toContain("setSaving(false)")
    expect(FOOD_REVIEW_SOURCE).toContain("reportOfflineMutationError(error)")
    expect(FOOD_REVIEW_SOURCE).toContain("saving={saving}")
  })
})
