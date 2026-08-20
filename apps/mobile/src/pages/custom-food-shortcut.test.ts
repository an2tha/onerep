import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SEARCH_SOURCE = readFileSync(
  new URL("./SearchFoods.tsx", import.meta.url),
  "utf8"
)
const NUTRITION_SOURCE = readFileSync(
  new URL("./Nutrition.tsx", import.meta.url),
  "utf8"
)
const CUSTOM_FOODS_SOURCE = readFileSync(
  new URL("./CustomFoods.tsx", import.meta.url),
  "utf8"
)
const SNAP_SOURCE = readFileSync(
  new URL("./SnapAndLog.tsx", import.meta.url),
  "utf8"
)

/**
 * A drink the database has never heard of still has to be loggable.
 *
 * Every dead end in the logging flow — no search results, a camera that will
 * not open — now offers the same way out, and it carries the name the user
 * already typed.
 */
describe("creating a food the database is missing", () => {
  test("an empty search offers to create what was searched for", () => {
    expect(SEARCH_SOURCE).toContain("createCustomFood(completedQuery)")
    expect(SEARCH_SOURCE).toContain("Add “{completedQuery}” yourself")
    expect(SEARCH_SOURCE).toContain("Not here? Add it")
    expect(SEARCH_SOURCE).toContain("name=${encodeURIComponent(name)}")
  })

  test("the add-to-diary menu lists it alongside the other log methods", () => {
    expect(NUTRITION_SOURCE).toContain('label: "Custom food"')
    expect(NUTRITION_SOURCE).toContain('"/foods/custom?new=1&log=1"')
  })

  test("a failed camera offers the same way out", () => {
    expect(SNAP_SOURCE).toContain('navigate("/foods/custom?new=1&log=1")')
    expect(SNAP_SOURCE).toContain("Enter it yourself")
  })

  test("the editor prefills the searched name and logs after saving", () => {
    expect(CUSTOM_FOODS_SOURCE).toContain('searchParams.get("name")')
    expect(CUSTOM_FOODS_SOURCE).toContain('searchParams.get("log") === "1"')
    expect(CUSTOM_FOODS_SOURCE).toContain("if (!draft.id && logAfterSave)")
    expect(CUSTOM_FOODS_SOURCE).toContain("setLogTarget({")
  })
})
