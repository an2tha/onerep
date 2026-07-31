import {
  FOOD_MICRONUTRIENT_KEYS,
  stripUndefined,
  type FoodLogEntry,
  type FoodMicronutrientKey,
  type MealType,
} from "./food-log"
import { createClientId } from "./utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomFoodNutrients = {
  calories: number
  protein: number
  carbs: number
  fat: number
} & Partial<Record<FoodMicronutrientKey, number>>

export type CustomFood = {
  _id?: string
  id?: string
  name: string
  brand?: string
  servingLabel: string
  servingGrams?: number
  barcode?: string
  notes?: string
  favorite?: boolean
  nutrientsPerServing: CustomFoodNutrients
  createdAt?: number
  updatedAt?: number
  lastUsedAt?: number
}

/** Editor state — every numeric field is a raw string so inputs stay uncontrolled-friendly. */
export type CustomFoodDraft = {
  id?: string
  name: string
  brand: string
  servingLabel: string
  servingGrams: string
  barcode: string
  notes: string
  favorite: boolean
  nutrients: Record<CustomFoodNutrientKey, string>
}

export const CUSTOM_FOOD_MACRO_KEYS = [
  "calories",
  "protein",
  "carbs",
  "fat",
] as const

export type CustomFoodMacroKey = (typeof CUSTOM_FOOD_MACRO_KEYS)[number]
export type CustomFoodNutrientKey = CustomFoodMacroKey | FoodMicronutrientKey

export const CUSTOM_FOOD_NUTRIENT_KEYS: CustomFoodNutrientKey[] = [
  ...CUSTOM_FOOD_MACRO_KEYS,
  ...FOOD_MICRONUTRIENT_KEYS,
]

export const CUSTOM_FOOD_NUTRIENT_LABELS: Record<
  CustomFoodNutrientKey,
  { label: string; unit: string }
> = {
  calories: { label: "Calories", unit: "kcal" },
  protein: { label: "Protein", unit: "g" },
  carbs: { label: "Carbs", unit: "g" },
  fat: { label: "Fat", unit: "g" },
  fiber: { label: "Fiber", unit: "g" },
  sugar: { label: "Sugar", unit: "g" },
  saturatedFat: { label: "Saturated fat", unit: "g" },
  transFat: { label: "Trans fat", unit: "g" },
  cholesterol: { label: "Cholesterol", unit: "mg" },
  sodium: { label: "Sodium", unit: "mg" },
  potassium: { label: "Potassium", unit: "mg" },
  calcium: { label: "Calcium", unit: "mg" },
  iron: { label: "Iron", unit: "mg" },
  magnesium: { label: "Magnesium", unit: "mg" },
  phosphorus: { label: "Phosphorus", unit: "mg" },
  zinc: { label: "Zinc", unit: "mg" },
  vitaminC: { label: "Vitamin C", unit: "mg" },
  vitaminA: { label: "Vitamin A", unit: "mcg" },
  vitaminD: { label: "Vitamin D", unit: "mcg" },
  vitaminB12: { label: "Vitamin B12", unit: "mcg" },
  caffeine: { label: "Caffeine", unit: "mg" },
  alcohol: { label: "Alcohol", unit: "g" },
}

// ─── Draft helpers ────────────────────────────────────────────────────────────

function emptyNutrientFields() {
  return Object.fromEntries(
    CUSTOM_FOOD_NUTRIENT_KEYS.map((key) => [key, ""])
  ) as Record<CustomFoodNutrientKey, string>
}

export function emptyCustomFoodDraft(): CustomFoodDraft {
  return {
    name: "",
    brand: "",
    servingLabel: "1 serving",
    servingGrams: "",
    barcode: "",
    notes: "",
    favorite: false,
    nutrients: emptyNutrientFields(),
  }
}

export function customFoodDraftFromFood(food: CustomFood): CustomFoodDraft {
  const nutrients = emptyNutrientFields()
  for (const key of CUSTOM_FOOD_NUTRIENT_KEYS) {
    const value = food.nutrientsPerServing[key]
    if (value !== undefined && value > 0) nutrients[key] = String(value)
  }

  return {
    id: food.id ?? food._id,
    name: food.name,
    brand: food.brand ?? "",
    servingLabel: food.servingLabel,
    servingGrams:
      food.servingGrams !== undefined ? String(food.servingGrams) : "",
    barcode: food.barcode ?? "",
    notes: food.notes ?? "",
    favorite: Boolean(food.favorite),
    nutrients,
  }
}

/** Parses a user-typed number. Blank, negative and NaN all read as absent. */
export function parseNutrientInput(raw: string): number | undefined {
  const trimmed = raw.trim().replace(",", ".")
  if (!trimmed) return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return undefined
  return Math.round(value * 100) / 100
}

export function customFoodNutrientsFromDraft(
  draft: CustomFoodDraft
): CustomFoodNutrients {
  const nutrients: CustomFoodNutrients = {
    calories: parseNutrientInput(draft.nutrients.calories) ?? 0,
    protein: parseNutrientInput(draft.nutrients.protein) ?? 0,
    carbs: parseNutrientInput(draft.nutrients.carbs) ?? 0,
    fat: parseNutrientInput(draft.nutrients.fat) ?? 0,
  }

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = parseNutrientInput(draft.nutrients[key])
    if (value !== undefined && value > 0) nutrients[key] = value
  }

  return nutrients
}

export type CustomFoodValidation = {
  valid: boolean
  errors: Partial<Record<"name" | "servingLabel" | "calories", string>>
}

export function validateCustomFoodDraft(
  draft: CustomFoodDraft
): CustomFoodValidation {
  const errors: CustomFoodValidation["errors"] = {}

  if (!draft.name.trim()) errors.name = "Give this food a name"
  if (!draft.servingLabel.trim()) {
    errors.servingLabel = "Describe one serving, e.g. “1 scoop”"
  }

  const nutrients = customFoodNutrientsFromDraft(draft)
  const hasAnyMacro =
    nutrients.protein > 0 || nutrients.carbs > 0 || nutrients.fat > 0
  if (nutrients.calories <= 0 && !hasAnyMacro) {
    errors.calories = "Enter calories or at least one macro"
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Calories implied by the macros (4/4/9). Shown next to the calorie field so a
 * typo in either place is obvious before saving.
 */
export function caloriesFromMacros(nutrients: CustomFoodNutrients) {
  return Math.round(
    nutrients.protein * 4 + nutrients.carbs * 4 + nutrients.fat * 9
  )
}

export function macroCalorieMismatch(nutrients: CustomFoodNutrients) {
  const derived = caloriesFromMacros(nutrients)
  if (nutrients.calories <= 0 || derived <= 0) return false
  const drift = Math.abs(derived - nutrients.calories)
  return drift > Math.max(25, nutrients.calories * 0.2)
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export function scaleCustomFoodNutrients(
  nutrients: CustomFoodNutrients,
  servings: number
): CustomFoodNutrients {
  const factor = Number.isFinite(servings) && servings > 0 ? servings : 0
  const round = (value: number) => Math.round(value * 100) / 100

  const scaled: CustomFoodNutrients = {
    calories: Math.round(nutrients.calories * factor),
    protein: round(nutrients.protein * factor),
    carbs: round(nutrients.carbs * factor),
    fat: round(nutrients.fat * factor),
  }

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = nutrients[key]
    if (value === undefined) continue
    scaled[key] = round(value * factor)
  }

  return scaled
}

export function servingsLabel(servings: number, servingLabel: string) {
  const amount =
    Number.isInteger(servings) ? String(servings) : servings.toFixed(2)
  return `${amount} × ${servingLabel}`
}

/** Turns a saved custom food into a food log entry ready for `setDay`. */
export function foodLogEntryFromCustomFood(
  food: CustomFood,
  options: { meal: MealType; servings?: number; loggedAt?: string }
): FoodLogEntry {
  const servings = options.servings && options.servings > 0 ? options.servings : 1
  const nutrients = scaleCustomFoodNutrients(food.nutrientsPerServing, servings)

  const entry: FoodLogEntry = {
    id: createClientId(),
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    calories: nutrients.calories,
    protein: nutrients.protein,
    carbs: nutrients.carbs,
    fat: nutrients.fat,
    meal: options.meal,
    loggedAt: options.loggedAt ?? new Date().toISOString(),
    servingLabel: servingsLabel(servings, food.servingLabel),
    servingGrams: food.servingGrams,
    quantityGrams:
      food.servingGrams !== undefined
        ? Math.round(food.servingGrams * servings * 100) / 100
        : undefined,
    foodCode: food.id ?? food._id,
  }

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = nutrients[key]
    if (value !== undefined && value > 0) entry[key] = value
  }

  return stripUndefined(entry)
}

/** Case-insensitive name/brand match for the custom-food picker. */
export function filterCustomFoods(foods: CustomFood[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return foods
  return foods.filter((food) =>
    `${food.name} ${food.brand ?? ""}`.toLowerCase().includes(needle)
  )
}
