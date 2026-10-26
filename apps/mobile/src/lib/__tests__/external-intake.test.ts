import { describe, expect, test } from "bun:test"

import {
  daysBackForDate,
  externalHeadlineRows,
  externalNoun,
  externalNutrients,
  externalSourceLabel,
} from "../external-intake"

const day = {
  dietaryEnergyKcal: 640,
  dietaryProteinG: 40,
  dietaryCarbsG: 70,
  dietaryFatG: 20,
  hydrationMl: 500,
  dietarySodiumMg: 900,
  dietaryFiberG: 12,
}

describe("what another app logged", () => {
  test("energy, the macros and water are the headline", () => {
    const rows = externalHeadlineRows(externalNutrients(day))

    expect(rows.map((row) => row.key)).toEqual([
      "dietaryEnergyKcal",
      "dietaryProteinG",
      "dietaryCarbsG",
      "dietaryFatG",
      "hydrationMl",
    ])
  })

  test("everything else is behind the disclosure", () => {
    const rows = externalNutrients(day)
    const hidden = rows.filter((row) => !row.headline).map((row) => row.key)

    expect(hidden).toEqual(["dietarySodiumMg", "dietaryFiberG"])
  })

  test("labels and units come from the catalogue, not from here", () => {
    const protein = externalNutrients(day).find(
      (row) => row.key === "dietaryProteinG"
    )

    expect(protein?.label).toBe("Protein eaten")
    expect(protein?.unit).toBe("g")
  })

  test("a key the catalogue does not know is dropped rather than rendered", () => {
    const rows = externalNutrients({ ...day, madeUpNutrient: 5 })

    expect(rows.some((row) => row.key === "madeUpNutrient")).toBe(false)
  })

  test("a zero or negative figure is not a reading", () => {
    // An app that files a 0 kcal meal says "nothing here"; a card claiming
    // "0 kcal from other apps" is a claim nobody made.
    const rows = externalNutrients({
      dietaryEnergyKcal: 0,
      dietaryProteinG: -4,
      dietaryFatG: Number.NaN,
    })

    expect(rows).toHaveLength(0)
  })

  test("nothing at all renders as nothing at all", () => {
    expect(externalNutrients(undefined)).toEqual([])
    expect(externalNutrients({})).toEqual([])
  })

  test("the headline reads as prose", () => {
    expect(externalNoun("dietaryProteinG")).toBe("protein")
    expect(externalNoun("hydrationMl")).toBe("water")
    expect(externalNoun("dietaryEnergyKcal")).toBe("")
  })
})

describe("how far back the card reads", () => {
  // Local dates on purpose: the reader slices days by the phone's clock, and a
  // UTC comparison would ask for the wrong window either side of midnight.
  const today = new Date(2026, 9, 26, 13, 0, 0)

  test("the day being looked at is inside the window", () => {
    expect(daysBackForDate("2026-10-26", today)).toBe(1)
    expect(daysBackForDate("2026-10-25", today)).toBe(2)
    expect(daysBackForDate("2026-10-19", today)).toBe(8)
  })

  test("a day past the reader's reach clamps rather than asking for it", () => {
    expect(daysBackForDate("2026-01-01", today)).toBe(45)
  })

  test("a malformed date still asks for something the reader accepts", () => {
    expect(daysBackForDate("not-a-date", today)).toBe(1)
  })
})

describe("who gets the credit", () => {
  test("app labels are named, in the order they arrived", () => {
    expect(
      externalSourceLabel(["Cronometer", "MyFitnessPal"], "another app")
    ).toBe("Cronometer, MyFitnessPal")
  })

  test("the same app twice is named once", () => {
    expect(externalSourceLabel(["MyFitnessPal", "MyFitnessPal"], "x")).toBe(
      "MyFitnessPal"
    )
  })

  test("an unresolved package id is never shown under a calorie figure", () => {
    // "com.myfitnesspal.android" explains nothing to a reader, and the native
    // layer only sends one when it could not resolve a label.
    expect(
      externalSourceLabel(["com.myfitnesspal.android"], "another app")
    ).toBe("another app")
  })

  test("no sources at all falls back rather than leaving a gap", () => {
    expect(externalSourceLabel(undefined, "another app")).toBe("another app")
    expect(externalSourceLabel([], "another app")).toBe("another app")
    expect(externalSourceLabel(["  "], "another app")).toBe("another app")
  })
})
