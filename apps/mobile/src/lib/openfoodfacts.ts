import { convexClient } from "@/lib/convex"
import { api } from "../../../../convex/_generated/api"
import type {
  FoodDetail,
  FoodResult,
  NutrientRow,
  OpenFoodFactsNutriments,
  OpenFoodFactsProduct,
} from "@repo/models"

const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "brands",
  "quantity",
  "serving_size",
  "serving_quantity",
  "nutriments",
  "nutriscore_grade",
  "nova_group",
].join(",")

async function openFoodFactsFetch<T>(
  path: string,
  params?: URLSearchParams
): Promise<T> {
  return (await convexClient.action(api.food.openFoodFacts.proxy, {
    path,
    params: params
      ? Array.from(params.entries()).map(([key, value]) => ({ key, value }))
      : [],
  })) as T
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "")
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

function nutriments(product: OpenFoodFactsProduct): OpenFoodFactsNutriments {
  return product.nutriments ?? {}
}

function nutrientValue(product: OpenFoodFactsProduct, key: string): number {
  const n = nutriments(product)
  return firstNumber(n[`${key}_100g`], n[key])
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
    nutriments:
      src.nutriments && typeof src.nutriments === "object"
        ? (src.nutriments as OpenFoodFactsNutriments)
        : undefined,
    nutriscore_grade: firstString(src.nutriscore_grade),
    nova_group: firstString(src.nova_group),
  }
}

function productName(product: OpenFoodFactsProduct): string {
  return (
    firstString(
      product.product_name_en,
      product.product_name,
      product.generic_name
    ) ?? product.code
  )
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
        nutrientValue(product, "calcium"),
        nutrientUnit(product, "calcium", "mg")
      ),
      nutrientRow(
        "iron",
        "Iron",
        nutrientValue(product, "iron"),
        nutrientUnit(product, "iron", "mg")
      ),
      nutrientRow(
        "potassium",
        "Potassium",
        nutrientValue(product, "potassium"),
        nutrientUnit(product, "potassium", "mg")
      ),
      nutrientRow(
        "vitaminC",
        "Vitamin C",
        nutrientValue(product, "vitamin-c"),
        nutrientUnit(product, "vitamin-c", "mg")
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
  limit?: number
): Promise<FoodResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const params = new URLSearchParams({
    search_terms: trimmed,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(Math.min(limit ?? 25, 100)),
    fields: PRODUCT_FIELDS,
  })

  const data = await openFoodFactsFetch<OpenFoodFactsSearchResponse>(
    "/cgi/search.pl",
    params
  )

  return (data.products ?? [])
    .map(normalizeProduct)
    .filter((product): product is OpenFoodFactsProduct => product !== null)
    .map(productToResult)
}

export async function getFoodDetail(id: string): Promise<FoodDetail | null> {
  const encoded = encodeURIComponent(id)
  const params = new URLSearchParams({ fields: PRODUCT_FIELDS })
  const data = await openFoodFactsFetch<OpenFoodFactsProductResponse>(
    `/api/v2/product/${encoded}.json`,
    params
  )

  const product = normalizeProduct(data.product)
  return product ? productToDetail(product) : null
}

export async function getFoodByBarcode(
  code: string
): Promise<FoodResult | null> {
  const detail = await getFoodDetail(code)
  return detail ? productToResult(detail.openFoodFacts) : null
}
