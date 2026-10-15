import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

const source = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")

/**
 * Every surface that re-logs a food the account has eaten before.
 *
 * They each used to stamp the copy with the *source* entry's meal tag, which
 * sent a breakfast repeated after dinner to 08:00. The rule now lives in one
 * helper, and this list is what keeps a new surface from reintroducing it.
 */
const REPEAT_SURFACES = [
  ["the dashboard chips", "../../dashboard/repeat-chips.tsx"],
  ["the quick-action drawer", "../../dashboard/quick-action-drawers.tsx"],
  ["the check-in food step", "../../components/moments/quick-food-step.tsx"],
  ["the search page's Log again", "../../pages/SearchFoods.tsx"],
  ["Nutrition's recent foods", "../../pages/Nutrition.tsx"],
] as const

/** The surfaces that offer repeat rows and saved meals from the same list. */
const MIXED_LISTS = [
  "../../dashboard/repeat-chips.tsx",
  "../../dashboard/quick-action-drawers.tsx",
] as const

describe("logging a repeated food", () => {
  test("every repeat surface stamps through the shared rule", () => {
    const missing = REPEAT_SURFACES.flatMap(([label, file]) =>
      source(file).includes("foodLogRepeatStamp(") ? [] : [label]
    )
    expect(missing).toEqual([])
  })

  test("a repeat list picks that rule with its own flag, not the entry's meal", () => {
    for (const file of [
      "../../dashboard/repeat-chips.tsx",
      "../../dashboard/quick-action-drawers.tsx",
      "../../components/moments/quick-food-step.tsx",
    ] as const) {
      const text = source(file)
      expect(text).toContain("repeat: true")
      expect(text).toContain("choice.repeat")
      // The repeat branch hands the helper no meal at all: it reads the clock.
      expect(text).toMatch(/choice\.repeat\s*\?\s*foodLogRepeatStamp/)
    }
  })

  test("the search page's Log again carries nothing over from its source entry", () => {
    const search = source("../../pages/SearchFoods.tsx")
    expect(search).not.toContain("previous.meal")
    expect(search).toContain(
      'foodLogRepeatStamp(date, searchParams.get("time"))'
    )
  })

  test("a saved meal keeps the meal it was authored with", () => {
    for (const file of MIXED_LISTS) {
      const text = source(file)
      expect(text).toContain("repeat: false")
      // The non-repeat branch still lets the meal tag answer the time.
      expect(text).toContain("entry.meal ?? defaultMeal()")
    }
  })
})
