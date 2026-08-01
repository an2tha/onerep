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

  test("repeat foods are compact, named, and single-flight", () => {
    expect(NUTRITION_SOURCE).toContain("buildQuickRepeatFoods")
    expect(NUTRITION_SOURCE).toContain('aria-label="Recent foods"')
    expect(NUTRITION_SOURCE).toContain("const [quickRepeatBusyKey")
    expect(NUTRITION_SOURCE).toContain("async function repeatFood")
    expect(NUTRITION_SOURCE).toContain("disabled={quickRepeatBusyKey !== null}")
    expect(NUTRITION_SOURCE).toContain("aria-busy={busy}")
    expect(NUTRITION_SOURCE).toContain("setAddOpen(false)")
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
    expect(NUTRITION_SOURCE).toContain(
      "const [loggingSupplementId, setLoggingSupplementId]"
    )
    expect(NUTRITION_SOURCE).toContain(
      "if (!plan.item._id || loggingSupplementId !== null) return"
    )
    expect(NUTRITION_SOURCE).toContain("await logSupplementTaken({")
    expect(NUTRITION_SOURCE).toContain(
      "saving={loggingSupplementId === String(plan.item._id)}"
    )
    expect(NUTRITION_SOURCE).toContain("aria-busy={saving}")
  })

  test("merged food and water page functions are available on nutrition", () => {
    expect(NUTRITION_SOURCE).toContain("WaterGoalSheet")
    expect(NUTRITION_SOURCE).toContain('name="water-goal-ml"')
    expect(NUTRITION_SOURCE).toContain("SmartMealPresetCard")
    expect(NUTRITION_SOURCE).toContain("DescribeMealSheet")
    expect(NUTRITION_SOURCE).toContain("RecipeLogSheet")
    expect(NUTRITION_SOURCE).toContain("RecipeManagementBox")
    expect(NUTRITION_SOURCE).toContain("api.logs.recipes.remove")
    expect(NUTRITION_SOURCE).toContain("api.logs.mealPresets.create")
    expect(NUTRITION_SOURCE).toContain("api.logs.snap.describeText")
  })

  test("nutrition page consumes plan metadata for tracking modes", () => {
    expect(NUTRITION_SOURCE).toContain("api.users.users.getNutritionPlan")
    expect(NUTRITION_SOURCE).toContain(
      "const visibleMetrics = nutritionPlan?.visibleMetrics"
    )
    expect(NUTRITION_SOURCE).toContain("visibleMetrics.calories")
    expect(NUTRITION_SOURCE).toContain("visibleMetrics.micros")
    expect(NUTRITION_SOURCE).toContain("nutritionPlan?.trackingMode")
  })
})
