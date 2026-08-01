import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

const GROCERY_SOURCE = readFileSync(
  new URL("./GroceryList.tsx", import.meta.url),
  "utf8"
)
const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)
const RECIPES_SOURCE = readFileSync(
  new URL("./RecipesHub.tsx", import.meta.url),
  "utf8"
)
const MEAL_PREP_SOURCE = readFileSync(
  new URL("./MealPrep.tsx", import.meta.url),
  "utf8"
)
const MAIN_SOURCE = readFileSync(new URL("../main.tsx", import.meta.url), "utf8")
// Task-route registration lives with the navigation helpers, not the router.
const NAVIGATION_SOURCE = readFileSync(
  new URL("../lib/navigation.ts", import.meta.url),
  "utf8"
)
const UI_CSS = readFileSync(
  new URL("../../../../packages/ui/src/index.css", import.meta.url),
  "utf8"
)

describe("grocery list accessibility", () => {
  test("each item checkbox names the item it toggles", () => {
    expect(GROCERY_SOURCE).toContain("aria-label={`Toggle ${item.name}`}")
    expect(GROCERY_SOURCE).toContain('role="checkbox"')
    expect(GROCERY_SOURCE).toContain("aria-checked={item.checked}")
  })

  test("row and list actions are labelled", () => {
    expect(GROCERY_SOURCE).toContain("aria-label={`Remove ${item.name}`}")
    expect(GROCERY_SOURCE).toContain('aria-label="Share grocery list"')
    expect(GROCERY_SOURCE).toContain('aria-label="Print grocery list"')
    expect(GROCERY_SOURCE).toContain('aria-label="Clear checked items"')
    expect(GROCERY_SOURCE).toContain('aria-label="Add a grocery item"')
    expect(GROCERY_SOURCE).toContain('aria-label="Create grocery list"')
  })

  test("selection toggles announce their pressed state", () => {
    expect(GROCERY_SOURCE).toContain("aria-pressed={selected}")
    expect(GROCERY_SOURCE).toContain("to the list`}")
  })

  test("printing reuses the existing print stylesheet", () => {
    expect(GROCERY_SOURCE).toContain("window.print()")
    expect(GROCERY_SOURCE).toContain('typeof window.print !== "function"')
    expect(GROCERY_SOURCE).toContain("print-sheet")
    expect(GROCERY_SOURCE).toContain("print-hidden")
    for (const rule of ["@media print", ".print-sheet", ".print-hidden"]) {
      expect(UI_CSS).toContain(rule)
    }
  })

  test("batches without ingredient data say so instead of vanishing", () => {
    expect(GROCERY_SOURCE).toContain("No ingredient data")
    expect(GROCERY_SOURCE).toContain("skippedBatches")
  })
})

describe("grocery list discoverability", () => {
  // The entry point is the food library grid on the nutrition page, alongside
  // My foods and Meal prep, rather than the add sheet it once lived in.
  test("nutrition links to grocery lists from the food library", () => {
    expect(NUTRITION_SOURCE).toContain('navigate("/nutrition/groceries")')
    expect(NUTRITION_SOURCE).toContain('label: "Groceries"')
  })

  test("a recipe card can start a list for that recipe", () => {
    expect(RECIPES_SOURCE).toContain(
      "aria-label={`Add ${recipe.name} to grocery list`}"
    )
    expect(RECIPES_SOURCE).toContain("/nutrition/groceries?recipe=")
  })

  test("a meal prep batch built from a recipe can be shopped for", () => {
    expect(MEAL_PREP_SOURCE).toContain("aria-label={`Shop for ${batch.name}`}")
    expect(MEAL_PREP_SOURCE).toContain("batch.sourceRecipeId &&")
  })

  test("both routes are registered and hide the bottom bar", () => {
    expect(MAIN_SOURCE).toContain('path: "/nutrition/groceries"')
    expect(MAIN_SOURCE).toContain('path: "/nutrition/groceries/:id"')
    expect(MAIN_SOURCE).toContain('label="Grocery list"')
    const prefixes = NAVIGATION_SOURCE.slice(
      NAVIGATION_SOURCE.indexOf("const TASK_ROUTE_PREFIXES")
    ).slice(0, 400)
    expect(prefixes).toContain('"/nutrition/groceries"')
  })
})
