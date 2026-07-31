import { useMealCategorySync } from "@/lib/use-meal-category-sync"

/** Mount-once bridge between the local and server custom meal categories. */
export function MealCategorySync() {
  useMealCategorySync()
  return null
}
