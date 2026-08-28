export type FoodSearchRankable = {
  brand?: string
  name: string
}

export function normalizeFoodSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function singularizeToken(token: string): string {
  if (token.length <= 3) return token
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`
  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(token)) return token.slice(0, -2)
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1)
  return token
}

function normalizedTokens(value: string): string[] {
  return normalizeFoodSearchText(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
}

function resultReferenceKey(item: FoodSearchRankable): string {
  return normalizedTokens(item.name).join(" ")
}

function isUnknownBrand(brand?: string): boolean {
  const normalized = normalizeFoodSearchText(brand ?? "")
  return normalized === "" || normalized === "unknown"
}

export function foodSearchRelevanceScore(
  item: FoodSearchRankable,
  query: string,
  index: number
) {
  const queryTokens = normalizedTokens(query)
  if (queryTokens.length === 0) return -index

  const nameTokens = normalizedTokens(item.name)
  const brandTokens = normalizedTokens(item.brand ?? "")
  const queryKey = queryTokens.join(" ")
  const nameKey = nameTokens.join(" ")

  let score = 0
  if (nameKey === queryKey) score += 1000
  if (nameKey.startsWith(queryKey)) score += 650
  if (nameKey.includes(queryKey)) score += 350

  let nameMatches = 0
  let anyMatches = 0
  for (const token of queryTokens) {
    if (nameTokens.includes(token)) {
      score += 140
      nameMatches += 1
      anyMatches += 1
    } else if (nameTokens.some((nameToken) => nameToken.startsWith(token))) {
      score += 90
      nameMatches += 1
      anyMatches += 1
    } else if (brandTokens.includes(token)) {
      score += 35
      anyMatches += 1
    }
  }

  if (nameMatches === queryTokens.length) score += 280
  else if (anyMatches === queryTokens.length) score += 90
  if (!isUnknownBrand(item.brand)) score += 35

  score -= Math.min(nameTokens.length, 12) * 2
  return score - index * 0.001
}

export function rankAndFilterFoodSearchResults<T extends FoodSearchRankable>(
  items: T[],
  query: string
): T[] {
  const knownReferenceKeys = new Set(
    items
      .filter((item) => !isUnknownBrand(item.brand))
      .map(resultReferenceKey)
      .filter(Boolean)
  )

  return items
    .filter((item) => {
      if (!isUnknownBrand(item.brand)) return true
      const key = resultReferenceKey(item)
      return !key || !knownReferenceKeys.has(key)
    })
    .map((item, index) => ({
      item,
      score: foodSearchRelevanceScore(item, query, index),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * Food you have eaten before, first.
 *
 * A tester put it plainly: searching should surface what is already in the
 * diary before it offers something new. The catalogue does not know that —
 * it ranks by name, and a stranger's product with a tidier title outranks the
 * yoghurt you have logged forty times.
 *
 * Deliberately a stable partition and not a score. Boosting inside
 * `foodSearchRelevanceScore` would make the promotion negotiable against name
 * length and brand bonuses, which is how "prioritize" quietly becomes
 * "sometimes". Two groups, each still in relevance order, is the promise the
 * sentence actually makes.
 */
export function promoteLoggedFoods<T extends FoodSearchRankable>(
  items: T[],
  loggedNames: Iterable<string>
): T[] {
  const logged = new Set<string>()
  for (const name of loggedNames) {
    const key = resultReferenceKey({ name })
    if (key) logged.add(key)
  }
  if (logged.size === 0) return items

  const seen: T[] = []
  const fresh: T[] = []
  for (const item of items) {
    if (logged.has(resultReferenceKey(item))) seen.push(item)
    else fresh.push(item)
  }
  return [...seen, ...fresh]
}
