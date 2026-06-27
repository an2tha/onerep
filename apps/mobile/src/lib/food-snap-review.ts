import type { FoodResult } from "@repo/models"
import {
  defaultFoodPortion,
  foodPortionLabel,
  parseFoodPortionLabel,
  stripUndefined,
  type FoodLogEntry,
  type MealType,
} from "./food-log"

const DEFAULT_SNAP_GRAMS = 100
const MAX_SNAP_GRAMS = 5000
const MAX_DETECTIONS = 8
const MAX_SEARCH_QUERIES = 6
const SNAP_SEARCH_LIMIT = 12
const SNAP_ALTERNATIVE_LIMIT = 8

export type SnapAiIngredient = {
  name?: unknown
  quantityInGrams?: unknown
  searchQueries?: unknown
  candidateFoods?: unknown
}

export type SnapAiResult = {
  foodName?: unknown
  estimatedQuantity?: unknown
  ingredients?: unknown
  searchQueries?: unknown
  candidateFoods?: unknown
}

export type SnapDetection = {
  id: string
  name: string
  quantityText?: string
  estimatedGrams?: number
  searchQueries?: string[]
}

export type SnapReviewItem = {
  id: string
  detectedName: string
  quantityText?: string
  grams: number
  selected: boolean
  food: FoodResult | null
  alternatives: FoodResult[]
}

export type SnapFoodMatch = {
  detectionIndex: number
  detectedName?: string
  food?: FoodResult | null
  alternatives?: FoodResult[]
}

export type FoodSearchFn = (
  query: string,
  limit?: number,
  language?: string
) => Promise<FoodResult[]>

function cleanString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value !== "string") return undefined
  const cleaned = value.replace(/\s+/g, " ").trim()
  return cleaned ? cleaned : undefined
}

function normalizeQueryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function cleanStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : cleanString(value) ? [value] : []
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const item of values) {
    const text = cleanString(item)
    if (!text) continue
    const key = normalizeQueryKey(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    cleaned.push(text)
    if (cleaned.length >= MAX_SEARCH_QUERIES) break
  }

  return cleaned
}

function compactSearchQuery(value: string): string | undefined {
  const cleaned = value
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(?:cooked|raw|fresh|grilled|baked|fried|boiled|steamed|roasted|sauteed|sautéed|sliced|diced|chopped|small|large|medium|pieces?|portion|serving|side|bowl|plate)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
  return cleaned && normalizeQueryKey(cleaned) !== normalizeQueryKey(value)
    ? cleaned
    : undefined
}

function searchQueriesForDetection(detection: SnapDetection): string[] {
  const queries = [
    detection.name,
    ...(detection.searchQueries ?? []),
    compactSearchQuery(detection.name),
  ].filter((query): query is string => Boolean(query))

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const query of queries) {
    const key = normalizeQueryKey(query)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(query)
    if (deduped.length >= MAX_SEARCH_QUERIES) break
  }
  return deduped
}

export function toConvexSafe(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return value
  if (Array.isArray(value)) {
    return value
      .map((item) => toConvexSafe(item))
      .filter((item) => item !== undefined)
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      const safe = toConvexSafe(nested)
      if (safe !== undefined) output[key] = safe
    }
    return output
  }
  return value
}

export function clampSnapGrams(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SNAP_GRAMS
  return Math.min(MAX_SNAP_GRAMS, Math.max(1, Math.round(value * 10) / 10))
}

export function parseSnapQuantityGrams(value: unknown): number | undefined {
  const text = cleanString(value)
  if (!text) return undefined

  const normalized = text
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\u2013|\u2014/g, "-")

  const range = normalized.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(?:-|to)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:g|grams?)?\b/
  )
  if (range) {
    return clampSnapGrams((Number(range[1]) + Number(range[2])) / 2)
  }

  const parsedPortion = parseFoodPortionLabel(text)
  if (parsedPortion) return clampSnapGrams(parsedPortion.grams)

  const grams = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:g|grams?)\b/)
  if (grams) return clampSnapGrams(Number(grams[1]))

  const plainNumber = normalized.match(/^[^0-9]*([0-9]+(?:\.[0-9]+)?)[^0-9]*$/)
  if (plainNumber) return clampSnapGrams(Number(plainNumber[1]))

  return undefined
}

function detectionId(name: string, index: number) {
  return `${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
}

export function snapDetectionsFromAiResult(
  aiResult: SnapAiResult
): SnapDetection[] {
  const ingredients = Array.isArray(aiResult.ingredients)
    ? aiResult.ingredients
    : []

  const ingredientDetections = ingredients
    .map((ingredient, index) => {
      const record =
        ingredient && typeof ingredient === "object"
          ? (ingredient as SnapAiIngredient)
          : {}
      const name = cleanString(record.name)
      if (!name) return null
      const quantityText = cleanString(record.quantityInGrams)
      const estimatedGrams = parseSnapQuantityGrams(quantityText)
      const searchQueries = cleanStringList(record.searchQueries)
      const candidateFoods = cleanStringList(record.candidateFoods)
      const detection: SnapDetection = {
        id: detectionId(name, index),
        name,
      }
      if (quantityText) detection.quantityText = quantityText
      if (estimatedGrams) detection.estimatedGrams = estimatedGrams
      if (searchQueries.length > 0 || candidateFoods.length > 0) {
        detection.searchQueries = [...searchQueries, ...candidateFoods]
      }
      return detection
    })
    .filter((item): item is SnapDetection => item !== null)
    .slice(0, MAX_DETECTIONS)

  if (ingredientDetections.length > 0) return ingredientDetections

  const foodName = cleanString(aiResult.foodName)
  if (!foodName) return []
  const quantityText = cleanString(aiResult.estimatedQuantity)
  const estimatedGrams = parseSnapQuantityGrams(quantityText)
  const searchQueries = cleanStringList(aiResult.searchQueries)
  const candidateFoods = cleanStringList(aiResult.candidateFoods)
  const detection: SnapDetection = {
    id: detectionId(foodName, 0),
    name: foodName,
  }
  if (quantityText) detection.quantityText = quantityText
  if (estimatedGrams) detection.estimatedGrams = estimatedGrams
  if (searchQueries.length > 0 || candidateFoods.length > 0) {
    detection.searchQueries = [...searchQueries, ...candidateFoods]
  }
  return [detection]
}

function dedupeFoodResults(results: FoodResult[]): FoodResult[] {
  const seen = new Set<string>()
  const deduped: FoodResult[] = []
  for (const result of results) {
    const key = result.code || result.id
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(result)
  }
  return deduped
}

function defaultGramsFor(food: FoodResult | null, estimatedGrams?: number) {
  if (estimatedGrams) return clampSnapGrams(estimatedGrams)
  if (!food) return DEFAULT_SNAP_GRAMS
  return clampSnapGrams(defaultFoodPortion(food.serving, food.name).grams)
}

export async function mapSnapDetectionsToReviewItems(
  detections: SnapDetection[],
  searchFoods: FoodSearchFn,
  options: {
    language?: string
    perQueryLimit?: number
    maxAlternatives?: number
    rankResults?: (results: FoodResult[], query: string) => FoodResult[]
    providedMatches?: SnapFoodMatch[]
  } = {}
): Promise<SnapReviewItem[]> {
  const perQueryLimit = Math.max(
    3,
    Math.min(options.perQueryLimit ?? SNAP_SEARCH_LIMIT, 25)
  )
  const maxAlternatives = Math.max(
    1,
    Math.min(options.maxAlternatives ?? SNAP_ALTERNATIVE_LIMIT, 12)
  )

  const providedByIndex = new Map(
    (options.providedMatches ?? []).map((match) => [
      match.detectionIndex,
      match,
    ])
  )

  return await Promise.all(
    detections.map(async (detection, index) => {
      const provided = providedByIndex.get(index)
      let alternatives = dedupeFoodResults(provided?.alternatives ?? []).slice(
        0,
        maxAlternatives
      )
      const hasProvidedFood = Boolean(provided && "food" in provided)
      let food = hasProvidedFood ? (provided?.food ?? null) : alternatives[0] ?? null

      if (provided?.food) {
        const selectedKey = provided.food.code || provided.food.id
        alternatives = [
          provided.food,
          ...alternatives.filter((item) => (item.code || item.id) !== selectedKey),
        ].slice(0, maxAlternatives)
      }

      if (alternatives.length > 0) {
        return {
          id: detection.id,
          detectedName: detection.name,
          quantityText: detection.quantityText,
          grams: defaultGramsFor(food ?? alternatives[0] ?? null, detection.estimatedGrams),
          selected: Boolean(food),
          food,
          alternatives,
        }
      }

      const queries = searchQueriesForDetection(detection)
      try {
        const settled = await Promise.allSettled(
          queries.map((query) =>
            searchFoods(query, perQueryLimit, options.language)
          )
        )
        alternatives = dedupeFoodResults(
          settled.flatMap((result) =>
            result.status === "fulfilled" ? result.value : []
          )
        )
        if (options.rankResults) {
          const bestRankByKey = new Map<string, number>()
          for (const query of queries) {
            options.rankResults(alternatives, query).forEach((result, index) => {
              const key = result.code || result.id
              const previous = bestRankByKey.get(key)
              if (previous === undefined || index < previous) {
                bestRankByKey.set(key, index)
              }
            })
          }
          alternatives = [...alternatives].sort((a, b) => {
            const aRank = bestRankByKey.get(a.code || a.id) ?? 999
            const bRank = bestRankByKey.get(b.code || b.id) ?? 999
            return aRank - bRank
          })
        }
        alternatives = alternatives.slice(0, maxAlternatives)
      } catch {
        alternatives = []
      }

      food = alternatives[0] ?? null
      return {
        id: detection.id,
        detectedName: detection.name,
        quantityText: detection.quantityText,
        grams: defaultGramsFor(food, detection.estimatedGrams),
        selected: Boolean(food),
        food,
        alternatives,
      }
    })
  )
}

export function formatSnapGrams(grams: number) {
  const safe = clampSnapGrams(grams)
  if (Math.abs(safe - Math.round(safe)) < 0.01) return String(Math.round(safe))
  return String(safe)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")
}

export function snapPortionLabel(grams: number) {
  return foodPortionLabel({ amount: clampSnapGrams(grams), unit: "g", grams })
}

export function scaleFoodForGrams(food: FoodResult, grams: number) {
  const factor = clampSnapGrams(grams) / 100
  const roundMacro = (value: number) => Math.round(value * factor * 10) / 10
  return {
    calories: Math.round(Number(food.calories) * factor),
    protein: roundMacro(Number(food.protein)),
    carbs: roundMacro(Number(food.carbs)),
    fat: roundMacro(Number(food.fat)),
  }
}

function createFoodLogId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  )
}

export function buildSnapFoodLogEntry(
  item: SnapReviewItem,
  meal: MealType,
  options: { id?: string; loggedAt?: string } = {}
): FoodLogEntry | null {
  if (!item.selected || !item.food) return null

  const grams = clampSnapGrams(item.grams)
  const scaled = scaleFoodForGrams(item.food, grams)
  const label = snapPortionLabel(grams)
  const name =
    grams === DEFAULT_SNAP_GRAMS
      ? item.food.name
      : `${item.food.name} (${label})`

  return stripUndefined({
    id: options.id ?? createFoodLogId(),
    name,
    ...scaled,
    loggedAt: options.loggedAt ?? new Date().toISOString(),
    meal,
    source: "openfoodfacts" as const,
    foodCode: item.food.code,
    quantityGrams: grams,
    servingLabel: item.food.serving,
    imageUrl: item.food.imageUrl,
    openFoodFacts: toConvexSafe(
      item.food.openFoodFacts
    ) as FoodLogEntry["openFoodFacts"],
  })
}
