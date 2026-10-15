import { beforeEach, describe, expect, test } from "bun:test"

import {
  DEFAULT_DRINK_ML,
  dayHydrationMl,
  defaultCountsAsWater,
  drinkVolumeMl,
  entryHydrationMl,
  hydrationAmountFor,
  hydrationEnabledFor,
  readHydrationCountDefault,
  withEntryHydration,
  writeHydrationCountDefault,
} from "../hydration"
import type { FoodPortion, FoodPortionUnit } from "../food-log"

function portion(amount: number, unit: FoodPortionUnit): FoodPortion {
  return { amount, unit, grams: amount }
}

/**
 * A Map-backed stand-in for localStorage. The helpers reach storage through
 * `browserLocalStorage`, which falls back to `globalThis`, so the remembered
 * answer can be exercised here without a DOM.
 */
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }
})

describe("a drink's own volume", () => {
  test("reads volume units as millilitres", () => {
    expect(drinkVolumeMl(portion(330, "ml"))).toBe(330)
    expect(drinkVolumeMl(portion(1, "cup"))).toBe(240)
    expect(drinkVolumeMl(portion(2, "tbsp"))).toBe(30)
    expect(drinkVolumeMl(portion(3, "tsp"))).toBe(15)
  })

  test("converts fluid ounces rather than treating them as millilitres", () => {
    // 8 fl oz is 236.6 ml. Passing it through unconverted would under-count a
    // glass by more than half.
    expect(drinkVolumeMl(portion(8, "fl_oz"))).toBe(237)
  })

  test("contributes nothing for a food measured by mass", () => {
    expect(drinkVolumeMl(portion(150, "g"))).toBe(0)
    expect(drinkVolumeMl(portion(5, "oz"))).toBe(0)
    expect(drinkVolumeMl(null)).toBe(0)
  })

  test("falls back to a glass when there is no volume to read", () => {
    expect(hydrationAmountFor(portion(150, "g"))).toBe(DEFAULT_DRINK_ML)
    expect(hydrationAmountFor(portion(1, "cup"))).toBe(240)
  })
})

describe("what one entry contributes", () => {
  test("counts only what was actually recorded", () => {
    expect(entryHydrationMl({})).toBe(0)
    expect(entryHydrationMl({ hydrationMl: 0 })).toBe(0)
    expect(entryHydrationMl({ hydrationMl: -250 })).toBe(0)
    expect(entryHydrationMl({ hydrationMl: Number.NaN })).toBe(0)
    expect(entryHydrationMl({ hydrationMl: 237.6 })).toBe(238)
  })

  test("adds the answer to the entry and takes it away again", () => {
    // Typed rather than a bare literal: `withEntryHydration` infers its generic
    // from the entry, and a fresh literal with no `hydrationMl` on it makes that
    // inference fall back to the constraint and reject the extra keys.
    const drink: { id: string; name: string; hydrationMl?: number } = {
      id: "cola",
      name: "Cola",
    }
    const counted = withEntryHydration(drink, true, 330)
    expect(counted.hydrationMl).toBe(330)

    // Unticking removes the key rather than zeroing it, so nothing downstream
    // can read a counted-but-zero drink as a contribution.
    const unticked = withEntryHydration(counted, false, 330)
    expect("hydrationMl" in unticked).toBe(false)
    expect(unticked).toEqual({ id: "cola", name: "Cola" })
  })

  test("leaves the entry it was given alone", () => {
    const original = { id: "cola", hydrationMl: 330 }
    withEntryHydration(original, false, 0)
    expect(original.hydrationMl).toBe(330)
  })
})

describe("the day's hydration", () => {
  const water = [{ amountMl: 500 }, { amountMl: 250 }]
  const drinks = [{ hydrationMl: 330 }, { name: "Chicken" }, { hydrationMl: 0 }]

  test("is the water rows plus every counted drink", () => {
    expect(dayHydrationMl(water, drinks)).toBe(1080)
  })

  test("treats a missing side as zero rather than as an error", () => {
    expect(dayHydrationMl(water, undefined)).toBe(750)
    expect(dayHydrationMl(undefined, drinks)).toBe(330)
    expect(dayHydrationMl(undefined, undefined)).toBe(0)
    expect(dayHydrationMl(null, null)).toBe(0)
  })

  test("sums the whole day rather than one part of it", () => {
    // The bug this guards: a surface that summed water rows alone would show
    // 750 for a day whose drinks already counted 330.
    expect(dayHydrationMl(water, drinks)).not.toBe(750)
  })
})

describe("whether a drink starts counted", () => {
  test("a drink is offered, a food is not", () => {
    expect(
      defaultCountsAsWater({ name: "Cola", portion: portion(1, "cup") })
    ).toBe(true)
    expect(
      defaultCountsAsWater({
        name: "Grilled chicken breast",
        portion: portion(150, "g"),
      })
    ).toBe(false)
  })

  test("the name alone can make it a drink, with no volume to read", () => {
    expect(
      defaultCountsAsWater({ name: "Coffee", portion: portion(150, "g") })
    ).toBe(true)
    expect(
      defaultCountsAsWater({ name: "Protein shake", portion: portion(150, "g") })
    ).toBe(true)
  })

  test("a volume written into the label is the caller's to supply", () => {
    // "Coca-Cola 330 ml" holds neither a drink word nor a volume portion, so
    // neither of the two guesses above can see it. The sheet knows better — it
    // reads the label — and says so with `liquid`.
    expect(
      defaultCountsAsWater({
        name: "Coca-Cola 330 ml",
        portion: portion(150, "g"),
      })
    ).toBe(false)
    expect(
      defaultCountsAsWater({
        name: "Coca-Cola 330 ml",
        portion: portion(150, "g"),
        liquid: true,
      })
    ).toBe(true)
  })

  test("the user's last answer outranks both guesses", () => {
    writeHydrationCountDefault(false)
    expect(readHydrationCountDefault()).toBe(false)
    // Still false for a cola in a cup: someone who does not count drinks should
    // not be asked again every time one is logged.
    expect(defaultCountsAsWater({ name: "Cola", portion: portion(1, "cup") })).toBe(
      false
    )

    writeHydrationCountDefault(true)
    expect(readHydrationCountDefault()).toBe(true)
    expect(
      defaultCountsAsWater({
        name: "Grilled chicken breast",
        portion: portion(150, "g"),
      })
    ).toBe(true)
  })

  test("no answer yet is distinguishable from an answer of no", () => {
    expect(readHydrationCountDefault()).toBeNull()
  })
})

describe("whether hydration is tracked", () => {
  test("absent means on, so nothing changes for an account that never answered", () => {
    expect(hydrationEnabledFor(null)).toBe(true)
    expect(hydrationEnabledFor(undefined)).toBe(true)
    expect(hydrationEnabledFor({})).toBe(true)
  })

  test("an explicit answer is honoured either way", () => {
    expect(hydrationEnabledFor({ hydrationEnabled: false })).toBe(false)
    expect(hydrationEnabledFor({ hydrationEnabled: true })).toBe(true)
  })
})
