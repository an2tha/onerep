import type { FoodDetail, FoodResult, NutrientRow } from "@repo/models"
import { dataApiFetch } from "./trpc"

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

function getMultilangText(value: unknown): string {
  if (!value) return "Unknown"
  if (Array.isArray(value)) {
    const main = value.find((v: any) => v.lang === "main")
    if (main?.text) return main.text
    const en = value.find((v: any) => v.lang === "en")
    if (en?.text) return en.text
    return value[0]?.text || "Unknown"
  }
  return String(value)
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
}

function nestedString(value: unknown, path: string[]): string | undefined {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === "string" && current.trim()
    ? current.trim()
    : undefined
}

function foodImageUrl(src: Record<string, unknown>): string | undefined {
  return firstString(
    src.imageUrl,
    src.image_url,
    src.image_front_url,
    src.image_front_thumb_url,
    nestedString(src, ["selected_images", "front", "display", "en"]),
    nestedString(src, ["selected_images", "front", "small", "en"])
  )
}

function nutrientValue(src: any, key: string): number {
  const nutriments = src.nutriments ?? src.other_nutrients
  if (!nutriments) return 0

  if (Array.isArray(nutriments)) {
    const normalizedKey = key.toLowerCase()
    const found = nutriments.find(
      (n: any) => String(n.name ?? "").toLowerCase() === normalizedKey
    )
    return toNumber(found?.["100g"] ?? found?.value)
  }

  return toNumber(nutriments[`${key}_100g`] ?? nutriments[key])
}

function mapHitToResult(hit: any): FoodResult {
  const src = hit._source ?? hit
  const serving =
    [src.servingSize, src.servingUnit].filter(Boolean).join(" ") ||
    src.serving ||
    "100 g"
  const calories = firstNumber(
    src.calories,
    src.calories_100g,
    nutrientValue(src, "energy-kcal")
  )
  const protein = firstNumber(
    src.protein,
    src.protein_100g,
    nutrientValue(src, "proteins")
  )
  const carbs = firstNumber(
    src.carbohydrates,
    src.carbs,
    src.carbs_100g,
    nutrientValue(src, "carbohydrates")
  )
  const fat = firstNumber(src.fat, src.fat_100g, nutrientValue(src, "fat"))

  return {
    id: String(
      src.code ?? src.id ?? src._id ?? hit._id ?? src.externalId ?? ""
    ),
    name: getMultilangText(src.product_name ?? src.name),
    brand: getMultilangText(src.brands ?? src.brand),
    serving,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    imageUrl: foodImageUrl(src),
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

function mapDocToDetail(doc: any): FoodDetail {
  const get = (key: string) => {
    const aliases: Record<string, unknown> = {
      "energy-kcal": doc.calories,
      proteins: doc.protein,
      carbohydrates: doc.carbohydrates ?? doc.carbs,
      fat: doc.fat,
      fiber: doc.fiber,
      sugars: doc.sugar,
      sodium: doc.sodium,
    }
    return firstNumber(aliases[key], nutrientValue(doc, key))
  }

  const servingLabel =
    [doc.servingSize, doc.servingUnit].filter(Boolean).join(" ") ||
    doc.serving ||
    "100 g"

  return {
    id: String(doc.code ?? doc.externalId ?? doc.id ?? ""),
    name: getMultilangText(doc.product_name ?? doc.name),
    brand: getMultilangText(doc.brands ?? doc.brand),
    serving: servingLabel,
    calories: Math.round(get("energy-kcal")),
    protein: get("proteins"),
    carbs: get("carbohydrates"),
    fat: get("fat"),
    servingGrams:
      doc.servingUnit === "g" ? toNumber(doc.servingSize) || null : null,
    servingLabel,
    nutriscoreGrade: doc.nutriscore_grade?.toLowerCase() || undefined,
    novaGroup: doc.nova_group || undefined,
    imageUrl: foodImageUrl(doc),
    nutrients: [
      nutrientRow("energy", "Calories", get("energy-kcal"), "kcal"),
      nutrientRow("protein", "Protein", get("proteins"), "g"),
      nutrientRow("carbs", "Carbohydrates", get("carbohydrates"), "g"),
      nutrientRow("fat", "Total Fat", get("fat"), "g"),
      nutrientRow("fiber", "Dietary Fiber", get("fiber"), "g"),
      nutrientRow("sugar", "Total Sugars", get("sugars"), "g"),
      nutrientRow("satFat", "Saturated Fat", get("saturated-fat"), "g"),
      nutrientRow("sodium", "Sodium", get("sodium"), "mg"),
      nutrientRow("cholesterol", "Cholesterol", get("cholesterol"), "mg"),
    ],
    extraNutrients: [
      nutrientRow("calcium", "Calcium", get("calcium"), "mg"),
      nutrientRow("iron", "Iron", get("iron"), "mg"),
      nutrientRow("potassium", "Potassium", get("potassium"), "mg"),
      nutrientRow("vitaminC", "Vitamin C", get("vitamin-c"), "mg"),
    ].filter((n) => n.per100g > 0),
  }
}

export async function searchFoods(
  query: string,
  limit?: number
): Promise<FoodResult[]> {
  if (query.trim().length < 2) return []
  const params = new URLSearchParams({ q: query.trim() })
  if (limit) params.set("limit", String(Math.min(limit, 50)))
  const hits = await dataApiFetch<any[]>(`/foods/search?${params}`)
  return (Array.isArray(hits) ? hits : []).map(mapHitToResult)
}

export async function getFoodDetail(id: string): Promise<FoodDetail | null> {
  const encoded = encodeURIComponent(id)
  const paths = /^\d+$/.test(id)
    ? [`/foods/${encoded}`, `/foods/barcode/${encoded}`]
    : [`/foods/barcode/${encoded}`]

  for (const path of paths) {
    try {
      const doc = await dataApiFetch<any>(path)
      return mapDocToDetail(doc)
    } catch {
      // Try the next lookup shape.
    }
  }

  return null
}

export async function getFoodByBarcode(
  code: string
): Promise<FoodResult | null> {
  const detail = await getFoodDetail(code)
  if (!detail) return null
  return {
    id: detail.id,
    name: detail.name,
    brand: detail.brand,
    serving: detail.serving,
    calories: detail.calories,
    protein: detail.protein,
    carbs: detail.carbs,
    fat: detail.fat,
    imageUrl: detail.imageUrl,
  }
}
