import type {
  HealthNutritionItemWrite,
  HealthStoreMeal,
} from "./health-provider"

/**
 * A logged entry, as this file needs to see it.
 *
 * Deliberately structural rather than `FoodLogEntry`: the two callers read their
 * entries from different sources — the live dashboard hands over the typed log
 * entries, the repair reads loose Convex documents — and every field here is
 * checked rather than trusted, because older entries predate some of them. An
 * entry stored before `meal` existed is written as a meal-less record, not a
 * crash.
 */
export type HealthNutritionItemSource = {
  id?: string
  name?: string
  loggedAt?: string
  meal?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

const CANONICAL_MEALS: Record<string, HealthStoreMeal> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
}

/**
 * The app's meal id, in the store's vocabulary.
 *
 * Both stores have a closed set — Health Connect takes breakfast, lunch, dinner,
 * snack or unknown; HealthKit has no meal on a food entry at all — and the app
 * does not: its meals are user-named strings, with `snack-post-lunch` among the
 * defaults. So the first dash-separated token decides for a name nobody has
 * heard of, and anything else is `unknown` rather than a guess. `unknown` is an
 * honest record of "a meal we cannot place", where inventing `snack` for a
 * custom meal called "second-breakfast" would be a quiet lie on a health record.
 */
export function healthStoreMeal(meal: string | undefined): HealthStoreMeal {
  const clean = (meal ?? "").trim().toLowerCase()
  if (!clean) return "unknown"
  const canonical = CANONICAL_MEALS[clean]
  if (canonical) return canonical
  return CANONICAL_MEALS[clean.split("-")[0]] ?? "unknown"
}

function rounded(value: number | undefined): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

/** A stable, human-readable record id when the entry brought none. */
function fallbackId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return slug ? `${slug}-${index}` : `item-${index}`
}

/**
 * The day's foods, in the shape the store files them.
 *
 * Entries that carry nothing to file are dropped rather than written as zeroes:
 * a record with no name and no numbers is not evidence of a meal, and the store
 * would show it as one. `name` falls back to `Logged food` because Health
 * Connect will take a record without one and every nutrition entry on a health
 * record should be identifiable — a nameless row beside a named one is the
 * shape that made the old totals-only write unreadable in the first place.
 */
export function toHealthNutritionItems(
  entries: readonly HealthNutritionItemSource[]
): HealthNutritionItemWrite[] {
  const items: HealthNutritionItemWrite[] = []
  entries.forEach((entry, index) => {
    const name = (entry.name ?? "").trim()
    const calories = rounded(entry.calories)
    const protein = rounded(entry.protein)
    const carbs = rounded(entry.carbs)
    const fat = rounded(entry.fat)
    if (!name && calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
      return
    }
    items.push({
      id: entry.id?.trim() || fallbackId(name, index),
      name: name || "Logged food",
      ...(entry.loggedAt ? { loggedAt: entry.loggedAt } : {}),
      meal: healthStoreMeal(entry.meal),
      calories,
      protein,
      carbs,
      fat,
    })
  })
  return items
}
