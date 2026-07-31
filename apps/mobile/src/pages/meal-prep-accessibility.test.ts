import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const MEAL_PREP_SOURCE = readFileSync(
  new URL("./MealPrep.tsx", import.meta.url),
  "utf8"
)
const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)

describe("Meal prep accessibility contract", () => {
  test("the create action is named", () => {
    expect(MEAL_PREP_SOURCE).toContain('aria-label="Add meal prep batch"')
  })

  test("serving buttons say which batch they log", () => {
    expect(MEAL_PREP_SOURCE).toContain("aria-label={`Log ${formatServings(")
    expect(MEAL_PREP_SOURCE).toContain("of ${batch.name}`}")
  })

  test("the undo control is distinguishable from logging", () => {
    expect(MEAL_PREP_SOURCE).toContain(
      "aria-label={`Undo one logged serving of ${batch.name}`}"
    )
  })

  test("storage choices expose their pressed state", () => {
    expect(MEAL_PREP_SOURCE).toContain("aria-pressed={draft.storage === option.id}")
  })

  test("sheets can be dismissed by a named button", () => {
    expect(MEAL_PREP_SOURCE).toContain('aria-label="Close batch editor"')
    expect(MEAL_PREP_SOURCE).toContain('aria-label="Close recipe picker"')
  })

  test("the freshness warning is announced", () => {
    expect(MEAL_PREP_SOURCE).toContain('role="status"')
  })

  test("nutrition links to meal prep from the add sheet", () => {
    expect(NUTRITION_SOURCE).toContain('navigate("/nutrition/meal-prep")')
  })
})
