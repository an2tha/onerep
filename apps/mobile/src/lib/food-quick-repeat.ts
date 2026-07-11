import type { FoodLogEntry } from "./food-log"

export type FoodLogDay = {
  date: string
  entries: FoodLogEntry[]
}

export type QuickRepeatFood = {
  key: string
  entry: FoodLogEntry
  count: number
}

function normalizedFoodName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function repeatKey(entry: FoodLogEntry) {
  if (entry.recipeId) return `recipe:${entry.recipeId}`
  if (entry.foodCode) return `food:${entry.foodCode}`

  const quantity = Number.isFinite(entry.quantityGrams)
    ? Math.round(entry.quantityGrams ?? 0)
    : ""
  return `name:${normalizedFoodName(entry.name)}:${quantity}:${Math.round(
    entry.calories
  )}`
}

/**
 * Returns the foods worth exposing as one-tap repeats. The most frequent foods
 * win; the newest matching entry supplies the exact portion and nutrients.
 */
export function buildQuickRepeatFoods(
  days: FoodLogDay[],
  limit = 4
): QuickRepeatFood[] {
  const grouped = new Map<string, QuickRepeatFood>()

  for (const day of days) {
    for (const entry of day.entries) {
      const key = repeatKey(entry)
      const existing = grouped.get(key)
      if (!existing) {
        grouped.set(key, { key, entry, count: 1 })
        continue
      }

      existing.count += 1
      if (entry.loggedAt > existing.entry.loggedAt) existing.entry = entry
    }
  }

  return [...grouped.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.entry.loggedAt.localeCompare(a.entry.loggedAt) ||
        a.entry.name.localeCompare(b.entry.name)
    )
    .slice(0, Math.max(0, limit))
}
