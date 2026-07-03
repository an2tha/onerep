const MAX_FOOD_SEARCH_QUERY_LENGTH = 80

function replaceControlCharacters(value: string) {
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0)
    return code <= 31 || code === 127 ? " " : char
  }).join("")
}

export function normalizeFoodSearchQuery(value: string | null | undefined) {
  return replaceControlCharacters(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FOOD_SEARCH_QUERY_LENGTH)
}

export function readFoodSearchQuery(params: URLSearchParams) {
  return normalizeFoodSearchQuery(params.get("q"))
}

export function foodSearchParamsForQuery(
  params: URLSearchParams,
  query: string
) {
  const next = new URLSearchParams(params)
  const normalized = normalizeFoodSearchQuery(query)

  if (normalized) next.set("q", normalized)
  else next.delete("q")

  return next
}
