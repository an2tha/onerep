import { convexClient } from "@/lib/convex"
import { api } from "../../../../convex/_generated/api"
import { parseFoodPortionLabel } from "@/lib/food-log"
import { logDevDebug } from "@/lib/utils"
import type {
  FoodDetail,
  FoodResult,
  NutrientRow,
  OpenFoodFactsNutriments,
  OpenFoodFactsProduct,
} from "@repo/models"

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000

type CacheEntry<T> = {
  expiresAt: number
  promise: Promise<T>
}

const searchCache = new Map<string, CacheEntry<FoodDetail[]>>()
const detailCache = new Map<string, CacheEntry<FoodDetail | null>>()

function cached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now()
  const existing = cache.get(key)
  if (existing && existing.expiresAt > now) return existing.promise

  const entry: CacheEntry<T> = {
    expiresAt: now + ttlMs,
    promise: load(),
  }
  cache.set(key, entry)
  entry.promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key)
  })
  return entry.promise
}

export function __clearOpenFoodFactsCacheForTests() {
  searchCache.clear()
  detailCache.clear()
}

async function fatSecretFetch<T>(args: {
  operation: "search" | "detail" | "barcode"
  value: string
  limit?: number
  language?: string
}): Promise<T> {
  const result = (await convexClient.action(api.food.fatSecret.proxy, {
    ...args,
  })) as T

  if (asRecord(result).unavailable === true) {
    throw new Error("Food database temporarily unavailable. Try again shortly.")
  }

  logDevDebug("FatSecret food API response", {
    operation: args.operation,
    response: result,
  })

  return result
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const token = String(value)
    .replace(/[\s\u00a0]/g, "")
    .match(/[+-]?(?:\d[\d.,]*|[.,]\d+)/)?.[0]
  if (!token) return 0

  const lastComma = token.lastIndexOf(",")
  const lastDot = token.lastIndexOf(".")
  let normalized = token

  // Products can contain localized values such as `1,234.5` or `1.234,5`.
  // When both separators are present, the final one is the decimal separator.
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".")
    } else {
      normalized = normalized.replace(/,/g, "")
    }
  } else if (lastComma >= 0) {
    const firstComma = normalized.indexOf(",")
    if (firstComma !== lastComma) {
      normalized = normalized.replace(/,(?=.*,)/g, "").replace(",", ".")
    } else {
      normalized = normalized.replace(",", ".")
    }
  } else if (normalized.indexOf(".") !== lastDot) {
    normalized = normalized.replace(/\.(?=.*\.)/g, "")
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = toNumber(value)
    if (parsed !== 0) return parsed
  }
  return 0
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value))
      return String(value)
  }
}

function cleanUnknown(value?: string): string | undefined {
  if (!value) return undefined
  const normalized = value.trim()
  if (!normalized || normalized.toLowerCase() === "unknown") return undefined
  return normalized
}

function selectedImageUrl(product: OpenFoodFactsProduct): string | undefined {
  const fronts = product.selected_images?.front
  for (const group of [fronts?.display, fronts?.small, fronts?.thumb]) {
    const url = firstString(...Object.values(group ?? {}))
    if (url) return url
  }
}

function productImageUrl(product: OpenFoodFactsProduct): string | undefined {
  return firstString(
    product.image_front_small_url,
    product.image_front_thumb_url,
    product.image_front_url,
    product.image_url,
    selectedImageUrl(product)
  )
}

function nutriments(product: OpenFoodFactsProduct): OpenFoodFactsNutriments {
  return product.nutriments ?? {}
}

function estimatedNutriments(
  product: OpenFoodFactsProduct
): OpenFoodFactsNutriments {
  return product.nutriments_estimated ?? {}
}

function nutrientValue(
  product: OpenFoodFactsProduct,
  key: string,
  includeEstimated = false
): number {
  const n = nutriments(product)
  const estimated = includeEstimated ? estimatedNutriments(product) : {}
  return firstNumber(
    n[`${key}_100g`],
    n[key],
    estimated[`${key}_100g`],
    estimated[key]
  )
}

function nutrientUnit(
  product: OpenFoodFactsProduct,
  key: string,
  fallback: string
) {
  return firstString(nutriments(product)[`${key}_unit`]) ?? fallback
}

function parseServingGrams(product: OpenFoodFactsProduct): number | null {
  const quantity = toNumber(product.serving_quantity)
  if (quantity > 0) return quantity

  const servingSize = product.serving_size ?? product.quantity
  if (!servingSize) return null

  const parsedPortion = parseFoodPortionLabel(servingSize)
  if (parsedPortion) return parsedPortion.grams

  const match = servingSize.match(/([0-9]+(?:[.,][0-9]+)?)\s*g\b/i)
  if (!match) return null
  const parsed = toNumber(match[1])
  return parsed > 0 ? parsed : null
}

function servingLabel(product: OpenFoodFactsProduct): string {
  return firstString(product.serving_size, product.quantity) ?? "100 g"
}

function normalizeProduct(raw: unknown): OpenFoodFactsProduct | null {
  const src = asRecord(raw)
  const code = firstString(src.code, src._id)
  if (!code) return null

  return {
    code,
    product_name: firstString(src.product_name),
    product_name_en: firstString(src.product_name_en),
    generic_name: firstString(src.generic_name),
    brands: firstString(src.brands),
    quantity: firstString(src.quantity),
    serving_size: firstString(src.serving_size, src.serving),
    serving_quantity: firstString(src.serving_quantity, src.servingQuantity),
    image_url: firstString(src.image_url),
    image_front_url: firstString(src.image_front_url),
    image_front_small_url: firstString(src.image_front_small_url),
    image_front_thumb_url: firstString(src.image_front_thumb_url),
    selected_images:
      src.selected_images && typeof src.selected_images === "object"
        ? (src.selected_images as OpenFoodFactsProduct["selected_images"])
        : undefined,
    nutriments:
      src.nutriments && typeof src.nutriments === "object"
        ? (src.nutriments as OpenFoodFactsNutriments)
        : undefined,
    nutriments_estimated:
      src.nutriments_estimated && typeof src.nutriments_estimated === "object"
        ? (src.nutriments_estimated as OpenFoodFactsNutriments)
        : undefined,
    nutriscore_grade: firstString(src.nutriscore_grade),
    nova_group: firstString(src.nova_group),
  }
}

function titleCaseName(value: string): string {
  return value.replace(/\S+/g, (word) => {
    if (/^[A-Z0-9&.'-]+$/.test(word) && word.length <= 4) return word
    return word
      .toLowerCase()
      .replace(
        /^([\p{L}\p{N}])|([\s'’\-/])([\p{L}\p{N}])/gu,
        (match, first, sep, next) =>
          first ? first.toUpperCase() : `${sep}${next.toUpperCase()}`
      )
  })
}

function productName(product: OpenFoodFactsProduct): string {
  return titleCaseName(
    firstString(
      product.product_name_en,
      product.product_name,
      product.generic_name
    ) ?? product.code
  )
}

function isNumbersOnlyName(name: string): boolean {
  const compact = name.replace(/[^\p{L}\p{N}]+/gu, "")
  return compact.length > 0 && /^\p{N}+$/u.test(compact)
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

function normalizedSearchTokens(value: string): string[] {
  return normalizeFoodSearchText(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
}

function foodResultReferenceKey(item: Pick<FoodResult, "name">): string {
  return normalizedSearchTokens(item.name).join(" ")
}

function isUnknownFoodBrand(brand?: string): boolean {
  const normalized = normalizeFoodSearchText(brand ?? "")
  return normalized === "" || normalized === "unknown"
}

function foodRelevanceScore(
  item: Pick<FoodResult, "name" | "brand">,
  query: string,
  index: number
) {
  const queryTokens = normalizedSearchTokens(query)
  if (queryTokens.length === 0) return -index

  const nameTokens = normalizedSearchTokens(item.name)
  const brandTokens = normalizedSearchTokens(item.brand ?? "")
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
  if (!isUnknownFoodBrand(item.brand)) score += 35

  score -= Math.min(nameTokens.length, 12) * 2
  return score - index * 0.001
}

export function rankAndFilterFoodResults<
  T extends Pick<FoodResult, "name" | "brand">,
>(items: T[], query: string): T[] {
  const knownReferenceKeys = new Set(
    items
      .filter((item) => !isUnknownFoodBrand(item.brand))
      .map(foodResultReferenceKey)
      .filter(Boolean)
  )

  return items
    .filter((item) => {
      if (!isUnknownFoodBrand(item.brand)) return true
      const key = foodResultReferenceKey(item)
      return !key || !knownReferenceKeys.has(key)
    })
    .map((item, index) => ({
      item,
      score: foodRelevanceScore(item, query, index),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item)
}

function productToResult(product: OpenFoodFactsProduct): FoodResult {
  const calories = nutrientValue(product, "energy-kcal")
  const protein = nutrientValue(product, "proteins")
  const carbs = nutrientValue(product, "carbohydrates")
  const fat = nutrientValue(product, "fat")

  return {
    id: product.code,
    source: "openfoodfacts",
    code: product.code,
    name: productName(product),
    brand: cleanUnknown(product.brands),
    serving: servingLabel(product),
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    imageUrl: productImageUrl(product),
    openFoodFacts: product,
  }
}

function nutrientRow(
  key: string,
  name: string,
  per100g: number,
  unit: string
): NutrientRow {
  return { key, name, per100g, unit }
}

function productToDetail(product: OpenFoodFactsProduct): FoodDetail {
  const result = productToResult(product)

  return {
    ...result,
    servingGrams: parseServingGrams(product),
    servingLabel: servingLabel(product),
    nutriscoreGrade: product.nutriscore_grade?.toLowerCase() || undefined,
    novaGroup: product.nova_group
      ? Number(product.nova_group) || undefined
      : undefined,
    nutrients: [
      nutrientRow(
        "energy",
        "Calories",
        nutrientValue(product, "energy-kcal"),
        "kcal"
      ),
      nutrientRow(
        "protein",
        "Protein",
        nutrientValue(product, "proteins"),
        "g"
      ),
      nutrientRow(
        "carbs",
        "Carbohydrates",
        nutrientValue(product, "carbohydrates"),
        "g"
      ),
      nutrientRow("fat", "Total Fat", nutrientValue(product, "fat"), "g"),
      nutrientRow(
        "fiber",
        "Dietary Fiber",
        nutrientValue(product, "fiber"),
        "g"
      ),
      nutrientRow(
        "sugar",
        "Total Sugars",
        nutrientValue(product, "sugars"),
        "g"
      ),
      nutrientRow(
        "satFat",
        "Saturated Fat",
        nutrientValue(product, "saturated-fat"),
        "g"
      ),
      nutrientRow(
        "trans-fat",
        "Trans Fat",
        nutrientValue(product, "trans-fat"),
        "g"
      ),
      nutrientRow(
        "sodium",
        "Sodium",
        nutrientValue(product, "sodium"),
        nutrientUnit(product, "sodium", "g")
      ),
      nutrientRow(
        "cholesterol",
        "Cholesterol",
        nutrientValue(product, "cholesterol"),
        nutrientUnit(product, "cholesterol", "mg")
      ),
    ],
    extraNutrients: [
      nutrientRow(
        "calcium",
        "Calcium",
        nutrientValue(product, "calcium", true),
        nutrientUnit(product, "calcium", "mg")
      ),
      nutrientRow(
        "iron",
        "Iron",
        nutrientValue(product, "iron", true),
        nutrientUnit(product, "iron", "mg")
      ),
      nutrientRow(
        "potassium",
        "Potassium",
        nutrientValue(product, "potassium", true),
        nutrientUnit(product, "potassium", "mg")
      ),
      nutrientRow(
        "magnesium",
        "Magnesium",
        nutrientValue(product, "magnesium", true),
        nutrientUnit(product, "magnesium", "mg")
      ),
      nutrientRow(
        "phosphorus",
        "Phosphorus",
        nutrientValue(product, "phosphorus", true),
        nutrientUnit(product, "phosphorus", "mg")
      ),
      nutrientRow(
        "zinc",
        "Zinc",
        nutrientValue(product, "zinc", true),
        nutrientUnit(product, "zinc", "mg")
      ),
      nutrientRow(
        "vitaminC",
        "Vitamin C",
        nutrientValue(product, "vitamin-c", true),
        nutrientUnit(product, "vitamin-c", "mg")
      ),
      nutrientRow(
        "vitamin-a",
        "Vitamin A",
        nutrientValue(product, "vitamin-a", true),
        nutrientUnit(product, "vitamin-a", "mcg")
      ),
      nutrientRow(
        "vitamin-d",
        "Vitamin D",
        nutrientValue(product, "vitamin-d", true),
        nutrientUnit(product, "vitamin-d", "mcg")
      ),
      nutrientRow(
        "vitamin-b12",
        "Vitamin B12",
        nutrientValue(product, "vitamin-b12", true),
        nutrientUnit(product, "vitamin-b12", "mcg")
      ),
      nutrientRow(
        "caffeine",
        "Caffeine",
        nutrientValue(product, "caffeine"),
        nutrientUnit(product, "caffeine", "mg")
      ),
      nutrientRow(
        "omega-3-fat",
        "Omega-3",
        nutrientValue(product, "omega-3-fat"),
        nutrientUnit(product, "omega-3-fat", "mg")
      ),
      nutrientRow(
        "eicosapentaenoic-acid",
        "EPA",
        nutrientValue(product, "eicosapentaenoic-acid"),
        nutrientUnit(product, "eicosapentaenoic-acid", "mg")
      ),
      nutrientRow(
        "docosahexaenoic-acid",
        "DHA",
        nutrientValue(product, "docosahexaenoic-acid"),
        nutrientUnit(product, "docosahexaenoic-acid", "mg")
      ),
      nutrientRow(
        "alcohol",
        "Alcohol",
        nutrientValue(product, "alcohol"),
        nutrientUnit(product, "alcohol", "g")
      ),
    ].filter((n) => n.per100g > 0),
  }
}

type OpenFoodFactsSearchResponse = {
  products?: unknown[]
}

type OpenFoodFactsProductResponse = {
  product?: unknown
  status?: number
}

export async function searchFoods(
  query: string,
  limit?: number,
  language?: string
): Promise<FoodDetail[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const pageSize = Math.min(limit ?? 25, 50)
  const cacheKey = JSON.stringify({
    query: normalizeFoodSearchText(trimmed),
    pageSize,
    language: language?.trim().toLowerCase() ?? "",
  })

  return cached(searchCache, cacheKey, SEARCH_CACHE_TTL_MS, async () => {
    const data = await fatSecretFetch<OpenFoodFactsSearchResponse>({
      operation: "search",
      value: trimmed,
      limit: pageSize,
      language,
    })

    return (data.products ?? [])
      .map(normalizeProduct)
      .filter((product): product is OpenFoodFactsProduct => product !== null)
      .map(productToDetail)
      .filter((item) => !isNumbersOnlyName(item.name))
  })
}

async function loadFoodDetail(id: string): Promise<FoodDetail | null> {
  let data: OpenFoodFactsProductResponse
  try {
    data = await fatSecretFetch<OpenFoodFactsProductResponse>({
      operation: "detail",
      value: id,
    })
  } catch (error) {
    if (error instanceof Error && /\b404\b/.test(error.message)) return null
    throw error
  }

  const product = normalizeProduct(data.product)
  return product ? productToDetail(product) : null
}

export async function getFoodDetail(id: string): Promise<FoodDetail | null> {
  return cached(detailCache, id.trim(), DETAIL_CACHE_TTL_MS, () =>
    loadFoodDetail(id)
  )
}

export async function searchFoodsAccurate(
  query: string,
  options: { limit?: number; fetchLimit?: number; language?: string } = {}
): Promise<FoodDetail[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100))
  const fetchLimit = Math.max(limit, Math.min(options.fetchLimit ?? 75, 100))
  const results = await searchFoods(query, fetchLimit, options.language)
  return rankAndFilterFoodResults(results, query).slice(0, limit)
}

export async function getFoodByBarcode(
  code: string
): Promise<FoodResult | null> {
  const data = await fatSecretFetch<OpenFoodFactsProductResponse>({
    operation: "barcode",
    value: code.trim(),
  })
  const product = normalizeProduct(data.product)
  const detail = product ? productToDetail(product) : null
  return detail ? productToResult(detail.openFoodFacts) : null
}
