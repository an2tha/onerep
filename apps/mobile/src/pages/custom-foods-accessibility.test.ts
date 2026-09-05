import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const CUSTOM_FOODS_SOURCE = readFileSync(
  new URL("./CustomFoods.tsx", import.meta.url),
  "utf8"
)
const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)

describe("Custom foods accessibility contract", () => {
  test("the create action is named", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain('aria-label="Create custom food"')
  })

  test("row actions name the food they act on", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain("aria-label={`Log ${food.name}`}")
    expect(CUSTOM_FOODS_SOURCE).toContain("aria-label={`Edit ${food.name}`}")
  })

  test("the search input keeps a label for screen readers", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain(
      '<span className="sr-only">Search my foods</span>'
    )
  })

  test("validation errors are announced", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain('role="alert"')
  })

  test("the favourite toggle exposes its state", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain("aria-pressed={draft.favorite}")
  })

  test("the micronutrient section reports whether it is expanded", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain("aria-expanded={microsOpen}")
  })

  test("sheets can be dismissed by a named button", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain('aria-label="Close food editor"')
    expect(CUSTOM_FOODS_SOURCE).toContain('aria-label="Close log sheet"')
  })

  test("nutrition links to my foods from the add sheet", () => {
    expect(NUTRITION_SOURCE).toContain(
      "navigate(`/foods/custom?date=${dateKey}`)"
    )
  })
})
