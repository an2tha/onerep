import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

const HOME_SOURCE = source("../../../../packages/ui/src/components/home/index.tsx")
const NUTRITION_SOURCE = source("./Nutrition.tsx")
const SEARCH_SOURCE = source("./SearchFoods.tsx")
const RECIPE_SOURCE = source("./NewRecipe.tsx")
const SNAP_SOURCE = source("./SnapAndLog.tsx")

describe("Today and nutrition UX contract", () => {
  test("Today exposes the high-frequency actions as labeled rows", () => {
    assert.match(HOME_SOURCE, /Open food selector/)
    assert.match(HOME_SOURCE, /Add 250 ml water/)
    assert.match(HOME_SOURCE, /Nothing logged yet/)
    assert.match(HOME_SOURCE, /Add 250 ml/)
  })

  test("Nutrition keeps logging direct and avoids duplicating target guidance", () => {
    assert.match(NUTRITION_SOURCE, /Add to diary/)
    assert.match(NUTRITION_SOURCE, /Log again/)
    assert.match(NUTRITION_SOURCE, /GoalsCardWrapper/)
    assert.doesNotMatch(NUTRITION_SOURCE, /Daily targets/)
    assert.doesNotMatch(NUTRITION_SOURCE, /Why these targets\?/)
    assert.doesNotMatch(NUTRITION_SOURCE, /Your optimized targets/)
  })

  test("food results present readable nutrition without badge or macro-pill chrome", () => {
    assert.match(SEARCH_SOURCE, /Find a food/)
    assert.match(SEARCH_SOURCE, /Protein/)
    assert.doesNotMatch(SEARCH_SOURCE, /function CalorieBadge/)
    assert.doesNotMatch(SEARCH_SOURCE, /function MacroPill/)
  })

  test("recipe editing uses a linear ingredient list and named controls", () => {
    const recipeViews = source(
      "../../../../packages/ui/src/components/recipe-views.tsx"
    )
    assert.match(recipeViews, /Recipe nutrition/)
    assert.match(RECIPE_SOURCE, /name="recipe-name"/)
    assert.match(RECIPE_SOURCE, /divide-y divide-border border-y/)
    assert.doesNotMatch(RECIPE_SOURCE, /function MacroRing/)
  })

  test("camera and capture review avoid unreadably small utility copy", () => {
    assert.match(SNAP_SOURCE, /aria-label="Close capture results"/)
    assert.match(SNAP_SOURCE, /name="snap-food-grams"/)
    assert.doesNotMatch(SNAP_SOURCE, /text-\[(?:8|9|10|11)(?:\.\d+)?px\]/)
  })
})
