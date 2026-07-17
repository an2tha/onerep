import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const FOOD_DETAIL_SOURCE = readFileSync(
  new URL("../components/food-detail-sheet.tsx", import.meta.url),
  "utf8"
)

describe("Food detail sheet accessibility contract", () => {
  test("portion and meal segmented controls expose selected state", () => {
    expect(FOOD_DETAIL_SOURCE).toContain("aria-pressed={active}")
    expect(FOOD_DETAIL_SOURCE).toContain("aria-pressed={isSelected}")
  })

  test("portion and custom meal category inputs stay named", () => {
    expect(FOOD_DETAIL_SOURCE).toContain('name="food-portion-amount"')
    expect(FOOD_DETAIL_SOURCE).toContain('aria-label="Food portion amount"')
    expect(FOOD_DETAIL_SOURCE).toContain('name="new-meal-category"')
    expect(FOOD_DETAIL_SOURCE).toContain('aria-label="New meal category name"')
  })

  test("icon-only meal category actions expose accessible names", () => {
    expect(FOOD_DETAIL_SOURCE).toContain(
      "aria-label={`Delete ${cat.label} meal category`}"
    )
    expect(FOOD_DETAIL_SOURCE).toContain('aria-label="Save meal category"')
    expect(FOOD_DETAIL_SOURCE).toContain('aria-label="Add meal category"')
  })

  test("log CTA exposes saving state and prevents duplicate submits", () => {
    expect(FOOD_DETAIL_SOURCE).toContain("saving?: boolean")
    expect(FOOD_DETAIL_SOURCE).toContain("saving = false")
    expect(FOOD_DETAIL_SOURCE).toContain('? "Logging..."')
    expect(FOOD_DETAIL_SOURCE).toContain(
      'disabled={saving || added || ctaVisualState === "reverting"}'
    )
    expect(FOOD_DETAIL_SOURCE).toContain("aria-busy={saving}")
  })

  test("extra nutrient disclosure exposes expanded state", () => {
    expect(FOOD_DETAIL_SOURCE).toContain("aria-expanded={showExtra}")
    expect(FOOD_DETAIL_SOURCE).toContain("Collapse minerals and vitamins")
    expect(FOOD_DETAIL_SOURCE).toContain("Expand minerals and vitamins")
  })
})
