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
const MEAL_PREP_SOURCE = readFileSync(
  new URL("./MealPrep.tsx", import.meta.url),
  "utf8"
)
const APP_SOURCE = readFileSync(new URL("../App.tsx", import.meta.url), "utf8")

describe("net carb display mode", () => {
  test("settings exposes a labelled toggle that persists the preference", () => {
    expect(SETTINGS_SOURCE).toContain('label="Show net carbs"')
    expect(SETTINGS_SOURCE).toContain("users.users.setNetCarbsEnabled")
    expect(SETTINGS_SOURCE).toContain("netCarbsEnabled")
  })

  test("settings explains that entry forms still take total carbs", () => {
    expect(SETTINGS_SOURCE).toContain("Entry forms still take total carbs")
  })

  test("every carb display surface derives its label from the mode", () => {
    for (const source of [
      NUTRITION_SOURCE,
      REPORT_SOURCE,
      APP_SOURCE,
    ]) {
      expect(source).toContain("carbLabel(")
    }
    expect(MEAL_PREP_SOURCE).toContain("carbLabelLower(")
  })

  test("no display surface hardcodes a Carbs JSX label", () => {
    for (const source of [NUTRITION_SOURCE, REPORT_SOURCE, APP_SOURCE]) {
      expect(source).not.toContain('label="Carbs"')
    }
  })

  test("the carb goal is derived so intake and goal are both net", () => {
    expect(NUTRITION_SOURCE).toContain("displayCarbGoal(")
    expect(APP_SOURCE).toContain("displayCarbGoal(")
    expect(REPORT_SOURCE).toContain("displayCarbGoal(")
  })

  test("the nutrition goal editor warns that the stored goal is total carbs", () => {
    expect(NUTRITION_SOURCE).toContain("total-carb goal")
  })
})
