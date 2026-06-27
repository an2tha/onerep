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

export type SnapAiIngredient = {
  name?: unknown
  quantityInGrams?: unknown
}

export type SnapAiResult = {
  foodName?: unknown
  estimatedQuantity?: unknown
  ingredients?: unknown
}

export type SnapDetection = {
  id: string
  name: string
  quantityText?: string
  estimatedGrams?: number
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

export type FoodSearchFn = (
  query: string,
  limit?: number
) => Promise<FoodResult[]>

function cleanString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value !== "string") return undefined
  const cleaned = value.replace(/\s+/g, " ").trim()
  return cleaned ? cleaned : undefined
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
      const detection: SnapDetection = {
        id: detectionId(name, index),
        name,
      }
      if (quantityText) detection.quantityText = quantityText
      if (estimatedGrams) detection.estimatedGrams = estimatedGrams
      return detection
    })
    .filter((item): item is SnapDetection => item !== null)
    .slice(0, MAX_DETECTIONS)

  if (ingredientDetections.length > 0) return ingredientDetections

  const foodName = cleanString(aiResult.foodName)
  if (!foodName) return []
  const quantityText = cleanString(aiResult.estimatedQuantity)
  const estimatedGrams = parseSnapQuantityGrams(quantityText)
  const detection: SnapDetection = {
    id: detectionId(foodName, 0),
    name: foodName,
  }
  if (quantityText) detection.quantityText = quantityText
  if (estimatedGrams) detection.estimatedGrams = estimatedGrams
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
  searchFoods: FoodSearchFn
): Promise<SnapReviewItem[]> {
  return await Promise.all(
    detections.map(async (detection) => {
      let alternatives: FoodResult[] = []
      try {
        alternatives = dedupeFoodResults(await searchFoods(detection.name, 5))
      } catch {
        alternatives = []
      }

      const food = alternatives[0] ?? null
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
    openFoodFacts: item.food.openFoodFacts,
  })
}
