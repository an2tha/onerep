import type { FoodResult, FoodDetail } from "@repo/models"
import { convexClient } from "./convex"
import { api } from "../../../../convex/_generated/api"

export async function searchFoods(
  query: string,
  limit?: number
): Promise<FoodResult[]> {
  return await convexClient.query(api.data.foods.search, {
    query,
  })
}

export async function getFoodDetail(
  id: string
): Promise<FoodDetail | null> {
  // If the ID is a numeric USDA fdcId, use Convex getById
  if (/^\d+$/.test(id)) {
    return await convexClient.action(api.data.foods.getById, {
      fdcId: id,
    })
  }

  // Fallback to OFF for barcodes or other IDs not in USDA
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(id)}.json`
  )
  const data = (await response.json()) as { product?: Record<string, unknown> }
  if (!data || !data.product) return null

  const p = data.product
  const nutriments = (p.nutriments || {}) as any

  return {
    id: String(p.code),
    name: String(p.product_name || p.product_name_en || "Unknown"),
    brand: String(p.brands || ""),
    serving: String(p.serving_size || "100g"),
    calories: Math.round(Number(nutriments["energy-kcal_100g"] || 0)),
    protein: Number(nutriments.proteins_100g || 0),
    carbs: Number(nutriments.carbohydrates_100g || 0),
    fat: Number(nutriments.fat_100g || 0),
    servingGrams: Number(p.serving_quantity) || null,
    servingLabel: String(p.serving_size || "Serving"),
    nutrients: [
      { key: "energy-kcal", name: "Calories", per100g: Number(nutriments["energy-kcal_100g"] || 0), unit: "kcal" },
      { key: "proteins", name: "Protein", per100g: Number(nutriments.proteins_100g || 0), unit: "g" },
      { key: "carbohydrates", name: "Carbs", per100g: Number(nutriments.carbohydrates_100g || 0), unit: "g" },
      { key: "fat", name: "Fat", per100g: Number(nutriments.fat_100g || 0), unit: "g" },
    ],
    extraNutrients: [],
  }
}

export async function getFoodByBarcode(
  code: string
): Promise<FoodResult | null> {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`
  )
  const data = (await response.json()) as { product?: Record<string, unknown> }
  if (!data || !data.product) return null
  
  const p = data.product
  const nutriments = (p.nutriments || {}) as any

  return {
    id: String(p.code),
    name: String(p.product_name || p.product_name_en || "Unknown"),
    brand: String(p.brands || ""),
    serving: String(p.serving_size || "100g"),
    calories: Math.round(Number(nutriments["energy-kcal_100g"] || 0)),
    protein: Number(nutriments.proteins_100g || 0),
    carbs: Number(nutriments.carbohydrates_100g || 0),
    fat: Number(nutriments.fat_100g || 0),
  }
}
