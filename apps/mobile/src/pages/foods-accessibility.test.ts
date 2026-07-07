import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const FOODS_SOURCE = readFileSync(
  new URL("./Foods.tsx", import.meta.url),
  "utf8"
)
const FOOD_DETAIL_SOURCE = readFileSync(
  new URL("../components/food-detail-sheet.tsx", import.meta.url),
  "utf8"
)

describe("Foods page accessibility contract", () => {
  test("history and header icon controls expose stable names", () => {
    expect(FOODS_SOURCE).toContain('aria-label="Open food history"')
    expect(FOODS_SOURCE).toContain('aria-label="Close food history"')
    expect(FOODS_SOURCE).toContain('aria-label="Snap meal"')
    expect(FOODS_SOURCE).toContain('aria-label="Search foods"')
  })

  test("collapsible food panels expose expanded state", () => {
    expect(FOODS_SOURCE).toContain("aria-expanded={open}")
    expect(FOODS_SOURCE).toContain(
      'aria-label={open ? "Collapse micronutrients" : "Expand micronutrients"}'
    )
    expect(FOODS_SOURCE).toContain("aria-expanded={editing}")
  })

  test("daily goal steppers and inputs stay named", () => {
    expect(FOODS_SOURCE).toContain(
      "aria-label={`Decrease ${label.toLowerCase()} goal`}"
    )
    expect(FOODS_SOURCE).toContain("name={`food-goal-${key}`}")
    expect(FOODS_SOURCE).toContain("aria-label={`${label} goal`}")
    expect(FOODS_SOURCE).toContain(
      "aria-label={`Increase ${label.toLowerCase()} goal`}"
    )
  })

  test("recipe logging waits for offline persistence before closing", () => {
    expect(FOODS_SOURCE).toContain("onLog={async (meal) => {")
    expect(FOODS_SOURCE).toContain("await setDay({")
    expect(FOODS_SOURCE).toContain("setLoggingRecipe(null)")
    expect(FOODS_SOURCE).toContain("disabled={Boolean(savingMeal)}")
    expect(FOODS_SOURCE).toContain("aria-busy={savingMeal === cat.id}")
    expect(FOODS_SOURCE).toContain("reportOfflineMutationError(error)")
  })

  test("history meal copy waits for offline persistence before closing", () => {
    expect(FOODS_SOURCE).toContain(
      "onCopyMeal: (meal: FoodHistoryMealSummary) => Promise<void>"
    )
    expect(FOODS_SOURCE).toContain("const [copyingMealKey, setCopyingMealKey]")
    expect(FOODS_SOURCE).toContain("await onCopyMeal(meal)")
    expect(FOODS_SOURCE).toContain("disabled={Boolean(copyingMealKey)}")
    expect(FOODS_SOURCE).toContain("aria-busy={copying}")
    expect(FOODS_SOURCE).toContain("Copying")
    expect(FOODS_SOURCE).toContain(
      "onClose={copyingMealKey ? () => {} : onClose}"
    )
  })

  test("smart meal suggestion actions are single-flight and announced", () => {
    expect(FOODS_SOURCE).toContain("onSave: () => Promise<void>")
    expect(FOODS_SOURCE).toContain("onLog: () => Promise<void>")
    expect(FOODS_SOURCE).toContain("disabled={busy}")
    expect(FOODS_SOURCE).toContain("aria-busy={busy}")
    expect(FOODS_SOURCE).toContain('aria-label="Dismiss smart meal suggestion"')
    expect(FOODS_SOURCE).toContain(
      'className="app-icon-button h-9 w-9 bg-transparent text-muted-foreground/45 disabled:opacity-35"'
    )
    expect(FOODS_SOURCE).toContain(
      'if (suggestion.kind !== "save" || smartMealBusyKey !== null) return'
    )
    expect(FOODS_SOURCE).toContain(
      'if (suggestion.kind !== "log" || smartMealBusyKey !== null) return'
    )
    expect(FOODS_SOURCE).toContain("reportOfflineMutationError(error)")
  })

  test("food page exposes nutrition-plan suggestions and tracking-mode visibility", () => {
    expect(FOODS_SOURCE).toContain("api.users.users.getNutritionPlan")
    expect(FOODS_SOURCE).toContain(
      "const visibleMetrics = nutritionPlan?.visibleMetrics"
    )
    expect(FOODS_SOURCE).toContain(
      "const planMealSuggestions = nutritionPlan?.mealSuggestions ?? []"
    )
    expect(FOODS_SOURCE).toContain("runPlanMealSuggestion")
    expect(FOODS_SOURCE).toContain('SectionHeader title="Suggested starts"')
    expect(FOODS_SOURCE).toContain("visibleMetrics.calories")
    expect(FOODS_SOURCE).toContain("visibleMetrics.micros")
    expect(FOODS_SOURCE).toContain('searchParams.get("history") !== "1"')
  })
})

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
    expect(FOOD_DETAIL_SOURCE).toContain("disabled={saving || added}")
    expect(FOOD_DETAIL_SOURCE).toContain("aria-busy={saving}")
  })

  test("extra nutrient disclosure exposes expanded state", () => {
    expect(FOOD_DETAIL_SOURCE).toContain("aria-expanded={showExtra}")
    expect(FOOD_DETAIL_SOURCE).toContain("Collapse minerals and vitamins")
    expect(FOOD_DETAIL_SOURCE).toContain("Expand minerals and vitamins")
  })
})
