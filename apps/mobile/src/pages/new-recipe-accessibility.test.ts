import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const NEW_RECIPE_SOURCE = readFileSync(
  new URL("./NewRecipe.tsx", import.meta.url),
  "utf8"
)

describe("New recipe accessibility contract", () => {
  test("recipe name input exposes stable form metadata", () => {
    expect(NEW_RECIPE_SOURCE).toContain('name="recipe-name"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Recipe name"')
  })

  test("ingredient search field and icon controls are named", () => {
    expect(NEW_RECIPE_SOURCE).toContain('name="ingredient-search-query"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Search foods"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Close ingredient search"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Clear search"')
  })

  test("ingredient portion editor exposes names, labels, and explicit buttons", () => {
    expect(NEW_RECIPE_SOURCE).toContain(
      "name={`ingredient-${ingredient.id}-amount`}"
    )
    expect(NEW_RECIPE_SOURCE).toContain(
      "aria-label={`${ingredient.name} amount`}"
    )
    expect(NEW_RECIPE_SOURCE).toContain(
      "name={`ingredient-${ingredient.id}-unit`}"
    )
    expect(NEW_RECIPE_SOURCE).toContain(
      "aria-label={`${ingredient.name} unit`}"
    )
    expect(NEW_RECIPE_SOURCE).toContain(
      "aria-label={`Decrease ${ingredient.name} amount`}"
    )
    expect(NEW_RECIPE_SOURCE).toContain(
      "aria-label={`Edit ${ingredient.name} amount`}"
    )
    expect(NEW_RECIPE_SOURCE).toContain(
      "aria-label={`Increase ${ingredient.name} amount`}"
    )
  })

  test("recipe save is single-flight and exposes pending state", () => {
    expect(NEW_RECIPE_SOURCE).toContain("const [saving, setSaving]")
    expect(NEW_RECIPE_SOURCE).toContain("const savingRef = useRef(false)")
    expect(NEW_RECIPE_SOURCE).toContain(
      "if (savingRef.current || saved || !canSave) return"
    )
    expect(NEW_RECIPE_SOURCE).toContain("savingRef.current = true")
    expect(NEW_RECIPE_SOURCE).toContain("setSaving(true)")
    expect(NEW_RECIPE_SOURCE).toContain("await saveRecipeMutation({")
    expect(NEW_RECIPE_SOURCE).toContain("savingRef.current = false")
    expect(NEW_RECIPE_SOURCE).toContain("setSaving(false)")
    expect(NEW_RECIPE_SOURCE).toContain(
      "disabled={!canSave || saving || saved}"
    )
    expect(NEW_RECIPE_SOURCE).toContain("aria-busy={saving}")
    expect(NEW_RECIPE_SOURCE).toContain('{saving ? "Saving..." : "Save"}')
  })

  test("quick and detailed recipes expose optional media and structured fields", () => {
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Recipe detail level"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Add recipe photos"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Recipe description"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Recipe tags"')
    expect(NEW_RECIPE_SOURCE).toContain('aria-label="Recipe notes"')
    expect(NEW_RECIPE_SOURCE).toContain(
      "aria-label={`Cooking instruction ${index + 1}`}"
    )
  })
})
