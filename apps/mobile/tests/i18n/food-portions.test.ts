import { afterEach, expect, test } from "bun:test"
import { i18n } from "@repo/ui/i18n"
import {
  FOOD_PORTION_UNITS,
  foodPortionDisplayLabel,
  foodPortionLabel,
  isNamedFoodServing,
  parseFoodPortionLabel,
} from "../../src/lib/food-log"
import { defaultServingQuantityFromLabel } from "../../src/lib/supplements"

afterEach(async () => {
  await i18n.changeLanguage("en")
})

test("German display leaves serving data parseable and named servings unchanged", async () => {
  await i18n.changeLanguage("de")
  for (const [unit, label, grams] of [
    ["cup", "Tassen", 240],
    ["tbsp", "EL", 15],
    ["tsp", "TL", 5],
  ] as const) {
    const portion = { amount: 1.5, unit, grams: grams * 1.5 }
    const canonical = foodPortionLabel(portion)
    expect(canonical).toBe(`1.5 ${unit}`)
    expect(parseFoodPortionLabel(canonical)).toEqual(portion)
    expect(foodPortionDisplayLabel(portion)).toBe(`1,5 ${label}`)
    expect(FOOD_PORTION_UNITS.find((option) => option.id === unit)?.label).toBe(
      unit
    )
    expect(isNamedFoodServing(canonical, portion)).toBe(false)
    expect(isNamedFoodServing("1.5 cups, chopped", portion)).toBe(true)
    expect(defaultServingQuantityFromLabel(canonical)).toBe(1.5)
  }
})

test("German supplement serving edits still scale imported nutrients", async () => {
  await i18n.changeLanguage("de")
  // Execute the editor's actual pure scaling helpers without loading its native UI.
  const source = await Bun.file(
    new URL("../../src/pages/Supplements.tsx", import.meta.url)
  ).text()
  const start = source.indexOf("function parseServingMassMg(")
  const end = source.indexOf("function scaledNutrientsForServing(", start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const helpers = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.slice(start, end)
  )
  const scale = new Function(
    "parseFoodPortionLabel",
    `${helpers}; return servingScaleFromLabels;`
  )(parseFoodPortionLabel) as (base: string, next: string) => number
  for (const unit of ["cup", "tbsp", "tsp"] as const) {
    const base = foodPortionLabel({ amount: 1, unit, grams: 240 })
    const next = foodPortionLabel({ amount: 2, unit, grams: 480 })
    expect(scale(base, next)).toBe(2)
  }
  expect(defaultServingQuantityFromLabel("1,5 Messlöffel")).toBe(1.5)
})
