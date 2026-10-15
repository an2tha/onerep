import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8")

/**
 * Everywhere the day's hydration is shown.
 *
 * Each of these used to sum the water rows itself, which is how the tile, the
 * card, the journal and the health store could disagree about the same day once
 * a drink could count too. They all ask one helper now, and this list is what
 * keeps the next surface from quietly going back to `amountMl` alone.
 */
const DISPLAY_SURFACES = [
  ["the dashboard", "../../App.tsx"],
  ["the water tile", "../../dashboard/water.tsx"],
  ["the water drawer", "../../dashboard/quick-action-drawers.tsx"],
  ["the Nutrition card", "../../pages/Nutrition.tsx"],
  ["the journal", "../../pages/Journal.tsx"],
  ["the home widget and the watch", "../../components/widget-data-sync.tsx"],
  ["the legacy dashboard", "../../App.legacy.tsx"],
] as const

/** Everywhere water is offered, or a goal is shown, or a figure is written out. */
const GATED_SURFACES = [
  ["the dashboard rails", "../../App.tsx"],
  ["the water tile", "../../dashboard/water.tsx"],
  ["the check-in moment", "../../components/moments/check-in-moment.tsx"],
  ["the Nutrition card", "../../pages/Nutrition.tsx"],
  ["the journal", "../../pages/Journal.tsx"],
  ["the home widget and the watch", "../../components/widget-data-sync.tsx"],
  ["the health write-back", "../../lib/nutrition-writeback.ts"],
  ["the food sheet", "../../components/food-detail-sheet.tsx"],
  ["the legacy dashboard", "../../App.legacy.tsx"],
] as const

describe("hydration across the app", () => {
  test("a day's figure is the whole day, not the water rows", () => {
    const missing = DISPLAY_SURFACES.filter(
      ([, file]) => !source(file).includes("dayHydrationMl(")
    ).map(([label]) => label)
    expect(missing).toEqual([])
  })

  test("a surface that offers water or a goal can be turned off", () => {
    const missing = GATED_SURFACES.filter(([, file]) => {
      const text = source(file)
      return !(
        text.includes("useHydrationEnabled(") ||
        text.includes("hydrationEnabledFor(")
      )
    }).map(([label]) => label)
    expect(missing).toEqual([])
  })

  test("the doors that log water close when the tracker is off", () => {
    // One guard in the dashboard covers both the timeline's + beside a past
    // glass and the wheel's own add button, since both arrive there.
    expect(source("../../App.tsx")).toContain(
      'if (id === "water" && !hydrationOn) return'
    )
    // The day rail hides the row and its + button together.
    expect(source("../../dashboard/day-rail.tsx")).toContain("waterEnabled")
    expect(source("../../dashboard/day-rail.tsx")).toContain("{waterPair && (")
  })

  test("a counted drink's water lives on the drink, not in a hidden water row", () => {
    const sheet = source("../../components/food-detail-sheet.tsx")
    expect(sheet).toContain("hydrationMl")
    // The sheet must not write a water entry on the drink's behalf: unticking
    // or deleting the drink has to take its water with it.
    expect(sheet).not.toContain("api.logs.water.addEntry")
    expect(sheet).not.toContain("logs.water")

    for (const file of [
      "../../pages/SearchFoods.tsx",
      "../../pages/FoodReview.tsx",
      "../../components/moments/quick-food-step.tsx",
    ] as const)
      expect(source(file)).toContain("hydrationMl")
  })

  test("no hydration figure is written to the health store when it is not tracked", () => {
    const writeback = source("../../lib/nutrition-writeback.ts")
    expect(writeback).toContain("hydrationEnabledFor(preferences)")
    // An absent metric says "not tracked"; a zero would claim the day was spent
    // drinking nothing.
    expect(writeback).toContain("? (waterTotalMl ?? 0) : 0")
  })

  test("the home widget and the watch are told there is no goal, not a stale one", () => {
    const payload = source("../../components/widget-data-sync.tsx")
    // Both native widgets already skip the water row at a goal of zero.
    expect(payload).toContain("{ waterMl: 0, waterGoalMl: 0 }")
  })

  test("a remembered answer is what the switch starts on", () => {
    const sheet = source("../../components/food-detail-sheet.tsx")
    expect(sheet).toContain("defaultCountsAsWater(")
    expect(sheet).toContain("writeHydrationCountDefault(")
    expect(sheet).toContain("useHydrationEnabled()")
  })
})
