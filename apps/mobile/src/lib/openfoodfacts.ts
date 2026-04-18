import type { FoodResult, FoodDetail } from "@repo/models"
import { convexClient } from "./convex"
import { api } from "../../../../convex/_generated/api"

export async function searchFoods(
  query: string,
  limit?: number
): Promise<FoodResult[]> {
  return await convexClient.action(api.data.foods.fetchAndCache, { query, limit })
}

export async function getFoodDetail(
  id: string
): Promise<FoodDetail | null> {
  // id is the food barcode/code from search results
  return await convexClient.action(api.data.foods.getById, { fdcId: id })
}

export async function getFoodByBarcode(
  code: string
): Promise<FoodResult | null> {
  const detail = await convexClient.action(api.data.foods.getById, { fdcId: code })
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
  }
}
