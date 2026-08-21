import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)
const COACH_CHAT_SOURCE = readFileSync(
  new URL("../lib/coach-chat.tsx", import.meta.url),
  "utf8"
)
const COACH_SOURCE = readFileSync(
  new URL("./Coach.tsx", import.meta.url),
  "utf8"
)

/**
 * A logged meal has to be checkable inside the app.
 *
 * The diary row used to carry a name, a time and a calorie count, with delete
 * as the only action — so anything the coach or a photo logged could not be
 * verified or corrected without an API client.
 */
describe("logged food entries can be inspected and corrected", () => {
  test("every diary row opens its own details", () => {
    expect(NUTRITION_SOURCE).toContain("function FoodEntrySheet({")
    expect(NUTRITION_SOURCE).toContain(
      "aria-label={`Details for ${entry.name}`}"
    )
    expect(NUTRITION_SOURCE).toContain("setEntryDetail(entry.id)")
    expect(NUTRITION_SOURCE).toContain("const [entryDetail, setEntryDetail]")
  })

  test("the row itself shows macros, not calories alone", () => {
    // Whitespace-tolerant: Prettier owns the line breaks between these, and a
    // reflow is not a behaviour change.
    expect(NUTRITION_SOURCE).toMatch(
      /\{fmt\(entry\.protein\)\}P\s*(?:\{" "\})?\s*\{fmt\(entry\.carbs\)\}C/
    )
  })

  test("the sheet edits the numbers and can remove the entry", () => {
    expect(NUTRITION_SOURCE).toContain("async function saveFoodEntry(")
    expect(NUTRITION_SOURCE).toContain('aria-label="Entry name"')
    expect(NUTRITION_SOURCE).toContain('aria-label="Meal"')
    expect(NUTRITION_SOURCE).toContain(
      "aria-label={`${label} for ${entry.name}`}"
    )
    expect(NUTRITION_SOURCE).toContain("Save changes")
    expect(NUTRITION_SOURCE).toContain("Remove entry")
    expect(NUTRITION_SOURCE).toContain("Also in this entry")
  })

  test("Coach opens the day the meal was logged to, not today", () => {
    expect(COACH_CHAT_SOURCE).toContain(
      "onOpenNutrition: (date?: string) => void"
    )
    expect(COACH_SOURCE).toContain("`/nutrition?date=${date}`")
  })
})
