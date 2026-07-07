import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)

describe("Nutrition page accessibility contract", () => {
  test("custom water stepper controls expose accessible names", () => {
    expect(NUTRITION_SOURCE).toContain(
      'aria-label="Decrease custom water amount"'
    )
    expect(NUTRITION_SOURCE).toContain(
      'aria-label="Increase custom water amount"'
    )
  })

  test("custom water amount input exposes a stable name and label", () => {
    expect(NUTRITION_SOURCE).toContain('name="nutrition-custom-water-ml"')
    expect(NUTRITION_SOURCE).toContain(
      'aria-label="Custom water amount in milliliters"'
    )
  })

  test("nutrition entry sheet keeps its primary action named", () => {
    expect(NUTRITION_SOURCE).toContain('aria-label="Add nutrition entry"')
  })

  test("quick water and supplement actions expose single-flight busy states", () => {
    expect(NUTRITION_SOURCE).toContain(
      "const [loggingWaterAmount, setLoggingWaterAmount]"
    )
    expect(NUTRITION_SOURCE).toContain(
      "if (amountMl <= 0 || loggingWaterAmount !== null) return false"
    )
    expect(NUTRITION_SOURCE).toContain("await addWaterEntry({")
    expect(NUTRITION_SOURCE).toContain("disabled={loggingWaterAmount !== null}")
    expect(NUTRITION_SOURCE).toContain(
      "aria-busy={loggingWaterAmount === amount}"
    )
    expect(NUTRITION_SOURCE).toContain("saving={loggingWaterAmount !== null}")
    expect(NUTRITION_SOURCE).toContain(
      "const [loggingSupplementId, setLoggingSupplementId]"
    )
    expect(NUTRITION_SOURCE).toContain(
      "if (!plan.item._id || loggingSupplementId !== null) return"
    )
    expect(NUTRITION_SOURCE).toContain("await logSupplementTaken({")
    expect(NUTRITION_SOURCE).toContain(
      "disabled={loggingSupplementId !== null}"
    )
    expect(NUTRITION_SOURCE).toContain("aria-busy={saving}")
  })

  test("nutrition page consumes plan metadata for tracking modes and calibration", () => {
    expect(NUTRITION_SOURCE).toContain("api.users.users.getNutritionPlan")
    expect(NUTRITION_SOURCE).toContain(
      "api.users.users.applyNutritionCalibration"
    )
    expect(NUTRITION_SOURCE).toContain(
      "const visibleMetrics = nutritionPlan?.visibleMetrics"
    )
    expect(NUTRITION_SOURCE).toContain(
      "const mealSuggestions = nutritionPlan?.mealSuggestions ?? []"
    )
    expect(NUTRITION_SOURCE).toContain("Suggested starts")
    expect(NUTRITION_SOURCE).toContain("runMealSuggestion")
    expect(NUTRITION_SOURCE).toContain("visibleMetrics.calories")
    expect(NUTRITION_SOURCE).toContain("visibleMetrics.micros")
    expect(NUTRITION_SOURCE).toContain("applyPlanCalibration")
  })
})
