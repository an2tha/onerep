import { platformMetric } from "../../../../convex/lib/platformHealthMetrics"

/**
 * One inbound nutrient, ready to render.
 *
 * The label and the unit come from `platformHealthMetrics` rather than a local
 * table: those are the labels the metric pickers already show, and a second
 * copy here would drift the first time a unit changed its mind.
 */
export type ExternalNutrientRow = {
  key: string
  label: string
  unit: string
  value: number
  /**
   * Shown even when the card is collapsed.
   *
   * Energy, the three macros and water are what someone checks this figure for.
   * The other fourteen — sodium, the saturated-fat split, the vitamins — are
   * worth reading once and not worth pushing the diary down the screen for.
   */
  headline: boolean
}

/** The short word after the number, so the line reads as prose. */
const HEADLINE_NOUNS: Record<string, string> = {
  dietaryEnergyKcal: "",
  dietaryProteinG: "protein",
  dietaryCarbsG: "carbs",
  dietaryFatG: "fat",
  hydrationMl: "water",
}

export function externalNutrients(
  nutrients: Record<string, number> | undefined
): ExternalNutrientRow[] {
  if (!nutrients) return []
  return Object.entries(nutrients)
    .filter(([key, value]) => platformMetric(key) && Number.isFinite(value) && value > 0)
    .map(([key, value]) => {
      const metric = platformMetric(key)!
      return {
        key,
        label: metric.label,
        unit: metric.unit,
        value,
        headline: key in HEADLINE_NOUNS,
      }
    })
}

/** The collapsed line's parts, in the order a food label puts them. */
export function externalHeadlineRows(
  rows: readonly ExternalNutrientRow[]
): ExternalNutrientRow[] {
  const order = Object.keys(HEADLINE_NOUNS)
  return [...rows]
    .filter((row) => row.headline)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}

export function externalNoun(key: string): string {
  return HEADLINE_NOUNS[key] ?? ""
}

/**
 * Who to credit, in the reader's words.
 *
 * The native reader answers with app labels already resolved, so this only has
 * to decide how a list of them reads. Unknown and unlabelled packages are
 * dropped rather than shown as a package id — "com.example.thing" under a
 * calorie figure explains nothing.
 */
export function externalSourceLabel(
  sources: readonly string[] | undefined,
  fallback: string
): string {
  const named = (sources ?? [])
    .map((source) => source.trim())
    // A dotted name is a package id the native layer could not resolve to a
    // label. Under a calorie figure it explains nothing, so it is left out
    // rather than shown — the fallback word is better than a mystery string.
    .filter((source) => source.length > 0 && !source.includes("."))
  const unique = [...new Set(named)].join(", ")
  return unique || fallback
}
