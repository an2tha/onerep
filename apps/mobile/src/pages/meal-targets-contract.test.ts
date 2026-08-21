import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

const SETTINGS_SOURCE = readFileSync(
  new URL("./Settings.tsx", import.meta.url),
  "utf8"
)
const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)
const REPORT_SOURCE = readFileSync(
  new URL("./NutritionReport.tsx", import.meta.url),
  "utf8"
)

describe("per-meal calorie targets", () => {
  test("settings exposes a labelled toggle and persists the split", () => {
    expect(SETTINGS_SOURCE).toContain('label="Calories by meal"')
    expect(SETTINGS_SOURCE).toContain("users.users.setMealCalorieTargets")
  })

  test("each meal share stepper is individually labelled", () => {
    expect(SETTINGS_SOURCE).toContain(
      "label={`${mealLabel(share.meal)} share`}"
    )
  })

  test("settings offers a reset and warns before rescaling", () => {
    expect(SETTINGS_SOURCE).toContain(
      'aria-label="Reset meal split to default"'
    )
    expect(SETTINGS_SOURCE).toContain("Saving will rescale these to 100%")
  })

  test("the settings preview uses the same normalisation as the server", () => {
    expect(SETTINGS_SOURCE).toContain("normalizeMealShares(")
    expect(SETTINGS_SOURCE).toContain("resolveMealCalorieTargets(")
  })

  test("nutrition renders per-meal progress only when the budget is on", () => {
    expect(NUTRITION_SOURCE).toContain("mealTargetsEnabled")
    expect(NUTRITION_SOURCE).toContain("<MealBudgetPanel")
    expect(NUTRITION_SOURCE).toContain('aria-label="Calories by meal"')
  })

  test("each per-meal row announces its consumed and target calories", () => {
    expect(NUTRITION_SOURCE).toContain(
      "aria-label={`${mealLabel(target.meal)}: ${energyDisplay(consumed, energyUnit)} of ${"
    )
  })

  test("the report compares planned against actual per meal", () => {
    expect(REPORT_SOURCE).toContain("mealTargetsEnabled")
    expect(REPORT_SOURCE).toContain("planned ")
  })
})
