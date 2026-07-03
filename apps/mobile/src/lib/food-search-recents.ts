import { normalizeFoodSearchQuery } from "./food-search-url"
import { browserLocalStorage } from "./utils"

const RECENT_FOOD_SEARCHES_KEY = "onerep:recent-food-searches:v1"
const MAX_RECENT_FOOD_SEARCHES = 6
export const POPULAR_FOOD_SEARCHES = [
  "Greek yogurt",
  "Chicken breast",
  "Banana",
  "Eggs",
]

export function foodSearchQueryKey(value: string) {
  return normalizeFoodSearchQuery(value).toLocaleLowerCase()
}

export function normalizeRecentFoodSearches(values: unknown) {
  if (!Array.isArray(values)) return []

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    if (typeof value !== "string") continue

    const query = normalizeFoodSearchQuery(value)
    const key = foodSearchQueryKey(query)
    if (query.length < 2 || seen.has(key)) continue

    seen.add(key)
    normalized.push(query)
    if (normalized.length >= MAX_RECENT_FOOD_SEARCHES) break
  }

  return normalized
}

export function nextRecentFoodSearches(current: string[], query: string) {
  const normalized = normalizeFoodSearchQuery(query)
  if (normalized.length < 2) return normalizeRecentFoodSearches(current)

  return normalizeRecentFoodSearches([
    normalized,
    ...current.filter(
      (item) => foodSearchQueryKey(item) !== foodSearchQueryKey(query)
    ),
  ])
}

export function visiblePopularFoodSearches(
  recentSearches: string[],
  popularSearches = POPULAR_FOOD_SEARCHES
) {
  const recentKeys = new Set(recentSearches.map(foodSearchQueryKey))
  return popularSearches.filter((suggestion) => {
    return !recentKeys.has(foodSearchQueryKey(suggestion))
  })
}

export function readRecentFoodSearches(storage = browserLocalStorage()) {
  if (!storage) return []

  try {
    const raw = storage.getItem(RECENT_FOOD_SEARCHES_KEY)
    if (!raw) return []
    return normalizeRecentFoodSearches(JSON.parse(raw))
  } catch {
    return []
  }
}

export function writeRecentFoodSearches(
  searches: string[],
  storage = browserLocalStorage()
) {
  if (!storage) return

  const normalized = normalizeRecentFoodSearches(searches)
  try {
    if (normalized.length === 0) {
      storage.removeItem(RECENT_FOOD_SEARCHES_KEY)
      return
    }

    storage.setItem(RECENT_FOOD_SEARCHES_KEY, JSON.stringify(normalized))
  } catch {
    // Recent searches are convenience data only.
  }
}

export function clearRecentFoodSearches(storage = browserLocalStorage()) {
  try {
    storage?.removeItem(RECENT_FOOD_SEARCHES_KEY)
  } catch {
    // Recent searches are convenience data only.
  }
}
