import type {
  FoodDetail,
  FoodResult,
  NutrientRow,
  OpenFoodFactsProduct,
} from "@repo/models"
import { CUSTOM_CATEGORY_TONES, DEFAULT_MEAL_TONES } from "@repo/ui"
import {
  createClientId,
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "@/lib/utils"
import { scaledFoodMacros } from "./food-search-nutrition"

// ─── Types ────────────────────────────────────────────────────────────────────

/** Meal identifier — one of the 4 defaults or a custom user-defined string */
export type MealType = string

export type MealCategory = {
  id: string
  label: string
  color: string
  bg: string
  isDefault?: boolean
}

export type FoodLogEntry = {
  _id?: string // Convex ID
  id: string // Client-side UUID
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  loggedAt: string // ISO datetime
  meal: MealType
  // Open Food Facts source metadata
  source?: "openfoodfacts"
  foodCode?: string
  quantityGrams?: number
  servingGrams?: number
  servingLabel?: string
  imageUrl?: string
  openFoodFacts?: OpenFoodFactsProduct
  // Recipe metadata for entries logged from a saved or AI-generated recipe
  recipeId?: string
  recipeDraft?: {
    name: string
    ingredients: RecipeIngredient[]
  }
  // Optional micronutrients
  fiber?: number
  sugar?: number
  saturatedFat?: number
  transFat?: number
  cholesterol?: number
  sodium?: number
  potassium?: number
  calcium?: number
  iron?: number
  magnesium?: number
  phosphorus?: number
  zinc?: number
  vitaminC?: number
  vitaminA?: number
  vitaminD?: number
  vitaminB12?: number
  caffeine?: number
  alcohol?: number
}

export type MealPresetEntry = Omit<
  FoodLogEntry,
  "_id" | "id" | "loggedAt" | "meal"
>

export type MealPreset = {
  _id?: string
  id?: string
  name: string
  meal: MealType
  signature: string
  entries: MealPresetEntry[]
  createdAt?: number
  updatedAt?: number
}

export type FoodLogDaySnapshot = {
  date: string
  entries: FoodLogEntry[]
}

export type SaveMealPresetSuggestion = {
  kind: "save"
  key: string
  meal: MealType
  mealLabel: string
  name: string
  signature: string
  entries: MealPresetEntry[]
  count: number
  latestDate: string
}

export type LogMealPresetSuggestion = {
  kind: "log"
  key: string
  meal: MealType
  mealLabel: string
  preset: MealPreset
  signature: string
  entries: MealPresetEntry[]
}

export type SmartMealPresetSuggestion =
  SaveMealPresetSuggestion | LogMealPresetSuggestion

export type FoodHistoryMealSummary = {
  meal: MealType
  mealLabel: string
  entries: FoodLogEntry[]
  itemSummary: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type FoodHistoryDaySummary = {
  date: string
  entries: FoodLogEntry[]
  meals: FoodHistoryMealSummary[]
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type LogMicros = Omit<
  FoodLogEntry,
  | "id"
  | "name"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "loggedAt"
  | "meal"
  | "source"
  | "foodCode"
  | "quantityGrams"
  | "servingGrams"
  | "servingLabel"
  | "imageUrl"
  | "openFoodFacts"
  | "recipeId"
  | "recipeDraft"
>

export const FOOD_MICRONUTRIENT_KEYS = [
  "fiber",
  "sugar",
  "saturatedFat",
  "transFat",
  "cholesterol",
  "sodium",
  "potassium",
  "calcium",
  "iron",
  "magnesium",
  "phosphorus",
  "zinc",
  "vitaminC",
  "vitaminA",
  "vitaminD",
  "vitaminB12",
  "caffeine",
  "alcohol",
] as const

export type FoodMicronutrientKey = (typeof FOOD_MICRONUTRIENT_KEYS)[number]

type FoodMicronutrientUnit = "g" | "mg" | "mcg"

type OpenFoodFactsNutriments = NonNullable<OpenFoodFactsProduct["nutriments"]>

const OPEN_FOOD_FACTS_MICROS: Record<
  FoodMicronutrientKey,
  {
    sourceKey: string
    sourceUnit: FoodMicronutrientUnit
    targetUnit: FoodMicronutrientUnit
  }
> = {
  fiber: { sourceKey: "fiber", sourceUnit: "g", targetUnit: "g" },
  sugar: { sourceKey: "sugars", sourceUnit: "g", targetUnit: "g" },
  saturatedFat: {
    sourceKey: "saturated-fat",
    sourceUnit: "g",
    targetUnit: "g",
  },
  transFat: { sourceKey: "trans-fat", sourceUnit: "g", targetUnit: "g" },
  cholesterol: {
    sourceKey: "cholesterol",
    sourceUnit: "mg",
    targetUnit: "mg",
  },
  sodium: { sourceKey: "sodium", sourceUnit: "g", targetUnit: "mg" },
  potassium: { sourceKey: "potassium", sourceUnit: "mg", targetUnit: "mg" },
  calcium: { sourceKey: "calcium", sourceUnit: "mg", targetUnit: "mg" },
  iron: { sourceKey: "iron", sourceUnit: "mg", targetUnit: "mg" },
  magnesium: { sourceKey: "magnesium", sourceUnit: "mg", targetUnit: "mg" },
  phosphorus: { sourceKey: "phosphorus", sourceUnit: "mg", targetUnit: "mg" },
  zinc: { sourceKey: "zinc", sourceUnit: "mg", targetUnit: "mg" },
  vitaminC: { sourceKey: "vitamin-c", sourceUnit: "mg", targetUnit: "mg" },
  vitaminA: { sourceKey: "vitamin-a", sourceUnit: "mcg", targetUnit: "mcg" },
  vitaminD: { sourceKey: "vitamin-d", sourceUnit: "mcg", targetUnit: "mcg" },
  vitaminB12: {
    sourceKey: "vitamin-b12",
    sourceUnit: "mcg",
    targetUnit: "mcg",
  },
  caffeine: { sourceKey: "caffeine", sourceUnit: "mg", targetUnit: "mg" },
  alcohol: { sourceKey: "alcohol", sourceUnit: "g", targetUnit: "g" },
}

function numberFromFoodValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const token = String(value)
    .replace(/[\s\u00a0]/g, "")
    .match(/[+-]?(?:\d[\d.,]*|[.,]\d+)/)?.[0]
  if (!token) return 0

  const lastComma = token.lastIndexOf(",")
  const lastDot = token.lastIndexOf(".")
  let normalized = token

  // Open Food Facts values can use either `1,234.5` or `1.234,5`.
  // Treat the final separator as the decimal separator when both appear.
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

function nonNegativeFoodNumber(value: unknown): number {
  return Math.max(0, numberFromFoodValue(value))
}

function positiveFoodNumber(value: unknown): number | null {
  const parsed = nonNegativeFoodNumber(value)
  return parsed > 0 ? parsed : null
}

function firstPositiveFoodNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = numberFromFoodValue(value)
    if (parsed > 0) return parsed
  }
  return 0
}

function foodNutrientPer100(
  nutriments: OpenFoodFactsNutriments,
  key: string
): number {
  return firstPositiveFoodNumber(nutriments[`${key}_100g`], nutriments[key])
}

function foodNutrientUnit(
  nutriments: OpenFoodFactsNutriments,
  key: string,
  fallback: FoodMicronutrientUnit
): string {
  const raw = nutriments[`${key}_unit`]
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback
}

function normalizeFoodMass(
  value: number,
  fromUnit: string,
  toUnit: FoodMicronutrientUnit
): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const normalized = fromUnit
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/[.\s]/g, "")
  const inMg =
    normalized === "g" || normalized === "gram" || normalized === "grams"
      ? value * 1000
      : normalized === "kg" ||
          normalized === "kilogram" ||
          normalized === "kilograms"
        ? value * 1_000_000
        : normalized === "ug" ||
            normalized === "mcg" ||
            normalized === "microgram" ||
            normalized === "micrograms"
          ? value / 1000
          : value

  if (toUnit === "g") return inMg / 1000
  if (toUnit === "mcg") return inMg * 1000
  return inMg
}

function roundFoodNutrient(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

function scaledDetailNutrient(
  rows: NutrientRow[],
  sourceKey: string,
  grams: number,
  targetUnit: FoodMicronutrientUnit
): number | undefined {
  const row = rows.find((nutrient) => nutrient.key === sourceKey)
  const per100g = numberFromFoodValue(row?.per100g)
  const safeGrams = positiveFoodNumber(grams)
  if (!row || per100g <= 0 || safeGrams === null) return undefined
  const scaled = (per100g * safeGrams) / 100
  const normalized = normalizeFoodMass(scaled, row.unit, targetUnit)
  return normalized > 0 ? roundFoodNutrient(normalized) : undefined
}

export function logMicrosFromFoodDetail(
  detail: FoodDetail | null | undefined,
  grams: number
): LogMicros {
  if (!detail || positiveFoodNumber(grams) === null) return {}
  const rows = [...(detail.nutrients ?? []), ...(detail.extraNutrients ?? [])]
  const micros: LogMicros = {}

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const cfg = OPEN_FOOD_FACTS_MICROS[key]
    const value = scaledDetailNutrient(
      rows,
      cfg.sourceKey,
      grams,
      cfg.targetUnit
    )
    if (value !== undefined) micros[key] = value
  }

  return micros
}

function positiveRatio(numerator: number, denominator: number): number | null {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return null
  }
  return numerator / denominator
}

function loggedFoodScale(
  entry: FoodLogEntry,
  nutriments: OpenFoodFactsNutriments
): number {
  // quantityGrams is captured when the entry is logged, so it is more reliable
  // than reconstructing a serving from rounded calories or macros.
  const quantityScale = positiveRatio(
    numberFromFoodValue(entry.quantityGrams),
    100
  )
  if (quantityScale) return quantityScale

  const caloriesRatio = positiveRatio(
    numberFromFoodValue(entry.calories),
    foodNutrientPer100(nutriments, "energy-kcal")
  )
  if (caloriesRatio) return caloriesRatio

  const macroRatios = [
    positiveRatio(
      numberFromFoodValue(entry.protein),
      foodNutrientPer100(nutriments, "proteins")
    ),
    positiveRatio(
      numberFromFoodValue(entry.carbs),
      foodNutrientPer100(nutriments, "carbohydrates")
    ),
    positiveRatio(
      numberFromFoodValue(entry.fat),
      foodNutrientPer100(nutriments, "fat")
    ),
  ].filter((value): value is number => value !== null)

  if (macroRatios.length > 0) {
    return macroRatios.sort((a, b) => a - b)[Math.floor(macroRatios.length / 2)]
  }

  const servingScale = positiveRatio(
    numberFromFoodValue(entry.servingGrams),
    100
  )
  if (servingScale) {
    return servingScale
  }

  return 1
}

function micronutrientForEntry(
  entry: FoodLogEntry,
  key: FoodMicronutrientKey
): number {
  const logged = numberFromFoodValue(entry[key])
  if (logged > 0) {
    return logged
  }

  const nutriments = entry.openFoodFacts?.nutriments
  if (!nutriments) return 0

  const source = OPEN_FOOD_FACTS_MICROS[key]
  const per100 = foodNutrientPer100(nutriments, source.sourceKey)
  if (per100 <= 0) return 0

  const scaled = per100 * loggedFoodScale(entry, nutriments)
  return normalizeFoodMass(
    scaled,
    foodNutrientUnit(nutriments, source.sourceKey, source.sourceUnit),
    source.targetUnit
  )
}

export function nutritionDetailTotals(entries: FoodLogEntry[]) {
  const totals: Partial<Record<FoodMicronutrientKey, number>> = {}

  for (const entry of entries) {
    for (const key of FOOD_MICRONUTRIENT_KEYS) {
      const value = micronutrientForEntry(entry, key)
      if (value > 0) totals[key] = (totals[key] ?? 0) + value
    }
  }

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    if (totals[key] !== undefined) {
      totals[key] = roundFoodNutrient(totals[key])
    }
  }

  return totals
}

export type FoodPortionUnit =
  "g" | "oz" | "ml" | "fl_oz" | "cup" | "tbsp" | "tsp"

export type FoodPortion = {
  amount: number
  unit: FoodPortionUnit
  grams: number
}

export const FOOD_PORTION_UNITS: {
  id: FoodPortionUnit
  label: string
  gramsPerUnit: number
  step: number
}[] = [
  { id: "g", label: "g", gramsPerUnit: 1, step: 25 },
  { id: "oz", label: "oz", gramsPerUnit: 28.3495, step: 0.5 },
  { id: "ml", label: "ml", gramsPerUnit: 1, step: 25 },
  { id: "fl_oz", label: "fl oz", gramsPerUnit: 29.5735, step: 1 },
  { id: "cup", label: "cup", gramsPerUnit: 240, step: 0.25 },
  { id: "tbsp", label: "tbsp", gramsPerUnit: 15, step: 1 },
  { id: "tsp", label: "tsp", gramsPerUnit: 5, step: 1 },
]

export function foodPortionUnitLabel(unit: FoodPortionUnit) {
  return FOOD_PORTION_UNITS.find((option) => option.id === unit)?.label ?? unit
}

function portionUnitConfig(unit: FoodPortionUnit) {
  return (
    FOOD_PORTION_UNITS.find((option) => option.id === unit) ??
    FOOD_PORTION_UNITS[0]
  )
}

function roundPortion(value: number) {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

export function gramsFromFoodPortion(amount: number, unit: FoodPortionUnit) {
  const safeAmount = nonNegativeFoodNumber(amount)
  return Math.max(
    0.1,
    Math.round(safeAmount * portionUnitConfig(unit).gramsPerUnit * 10) / 10
  )
}

export function amountFromFoodPortionGrams(
  grams: number,
  unit: FoodPortionUnit
) {
  return roundPortion(
    nonNegativeFoodNumber(grams) / portionUnitConfig(unit).gramsPerUnit
  )
}

export function formatFoodPortionAmount(amount: number) {
  if (Math.abs(amount - Math.round(amount)) < 0.01)
    return String(Math.round(amount))
  return String(amount)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")
}

export function foodPortionLabel(portion: FoodPortion) {
  return `${formatFoodPortionAmount(portion.amount)} ${foodPortionUnitLabel(portion.unit)}`
}

function normalizePortionUnit(raw: string): FoodPortionUnit | null {
  const unit = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim()
  if (unit === "g" || unit === "gram" || unit === "grams") return "g"
  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") return "g"
  if (unit === "oz" || unit === "ounce" || unit === "ounces") return "oz"
  if (unit === "ml" || unit === "milliliter" || unit === "milliliters")
    return "ml"
  if (unit === "cl" || unit === "centiliter" || unit === "centiliters")
    return "ml"
  if (unit === "l" || unit === "liter" || unit === "liters") return "ml"
  if (
    unit === "fl oz" ||
    unit === "floz" ||
    unit === "fluid ounce" ||
    unit === "fluid ounces"
  )
    return "fl_oz"
  if (unit === "cup" || unit === "cups") return "cup"
  if (unit === "tbsp" || unit === "tablespoon" || unit === "tablespoons")
    return "tbsp"
  if (unit === "tsp" || unit === "teaspoon" || unit === "teaspoons")
    return "tsp"
  return null
}

function normalizedPortionAmount(
  amount: number,
  rawUnit: string,
  unit: FoodPortionUnit
) {
  const normalized = rawUnit.toLowerCase().replace(/\./g, "").trim()
  if (unit === "g" && normalized.startsWith("kg")) return amount * 1000
  if (unit === "ml" && normalized === "cl") return amount * 10
  if (unit === "ml" && (normalized === "l" || normalized.startsWith("liter")))
    return amount * 1000
  return amount
}

function explicitMassGrams(label: string): number | null {
  const matches = label.matchAll(
    /([0-9]+(?:[.,][0-9]+)?)\s*(kilograms?|kg|grams?|g)\b/gi
  )

  for (const match of matches) {
    const amount = positiveFoodNumber(match[1])
    if (amount === null) continue
    const unit = match[2].toLowerCase()
    return unit === "kg" || unit.startsWith("kilogram") ? amount * 1000 : amount
  }

  return null
}

export function parseFoodPortionLabel(
  label?: string | null
): FoodPortion | null {
  if (!label) return null
  const match = label.match(
    /([0-9]+(?:[.,][0-9]+)?)\s*(fluid\s*ounces?|fl\.?\s*oz|floz|tablespoons?|tbsp|teaspoons?|tsp|cups?|kilograms?|kg|grams?|g|milliliters?|ml|centiliters?|cl|liters?|l|ounces?|oz)\b/i
  )
  if (!match) return null

  const rawAmount = numberFromFoodValue(match[1])
  const unit = normalizePortionUnit(match[2])
  if (!Number.isFinite(rawAmount) || rawAmount <= 0 || !unit) return null

  const amount = roundPortion(
    normalizedPortionAmount(rawAmount, match[2], unit)
  )
  const exactMass = explicitMassGrams(label)
  return {
    amount,
    unit,
    // Labels such as "1 cup (230 g)" include an exact source mass. Preserve it
    // instead of assuming a generic volume-to-mass conversion.
    grams: exactMass ?? gramsFromFoodPortion(amount, unit),
  }
}

function looksLikeLiquid(name?: string | null) {
  return /\b(juice|water|milk|soda|drink|beverage|coffee|tea|smoothie|shake|soup|beer|wine)\b/i.test(
    name ?? ""
  )
}

export function inferFoodPortionUnit(
  label?: string | null,
  name?: string | null
): FoodPortionUnit {
  const parsed = parseFoodPortionLabel(label)
  if (parsed) return parsed.unit

  const text = `${label ?? ""} ${name ?? ""}`.toLowerCase()
  if (/\b(ml|milliliter|cl|liter|litre|fluid ounce|fl oz|floz)\b/.test(text))
    return "ml"
  if (/\b(cup|tbsp|tablespoon|tsp|teaspoon)\b/.test(text)) return "cup"
  if (looksLikeLiquid(text)) return "ml"
  if (/\b(oz|ounce)\b/.test(text)) return "oz"
  return "g"
}

export function defaultFoodPortion(
  label?: string | null,
  name?: string | null,
  fallbackGrams = 100
): FoodPortion {
  const parsed = parseFoodPortionLabel(label)
  if (parsed) {
    const genericGramServing =
      parsed.unit === "g" && /\b100\s*g\b/i.test(label ?? "")
    if (genericGramServing && looksLikeLiquid(name)) {
      return {
        amount: parsed.amount,
        unit: "ml",
        grams: parsed.grams,
      }
    }
    return parsed
  }

  const unit = inferFoodPortionUnit(label, name)
  const amount = amountFromFoodPortionGrams(fallbackGrams, unit)
  return {
    amount,
    unit,
    grams: gramsFromFoodPortion(amount, unit),
  }
}

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) cleaned[key] = stripUndefined(child)
    }
    return cleaned as T
  }

  return value
}

// ─── Meal categories ──────────────────────────────────────────────────────────

export const DEFAULT_MEAL_CATEGORIES: MealCategory[] = [
  {
    id: "breakfast",
    label: "Breakfast",
    color: DEFAULT_MEAL_TONES.breakfast.color,
    bg: DEFAULT_MEAL_TONES.breakfast.bg,
    isDefault: true,
  },
  {
    id: "lunch",
    label: "Lunch",
    color: DEFAULT_MEAL_TONES.lunch.color,
    bg: DEFAULT_MEAL_TONES.lunch.bg,
    isDefault: true,
  },
  {
    id: "dinner",
    label: "Dinner",
    color: DEFAULT_MEAL_TONES.dinner.color,
    bg: DEFAULT_MEAL_TONES.dinner.bg,
    isDefault: true,
  },
  {
    id: "snack",
    label: "Snack",
    color: DEFAULT_MEAL_TONES.snack.color,
    bg: DEFAULT_MEAL_TONES.snack.bg,
    isDefault: true,
  },
]

// ─── Smart meal preset helpers ────────────────────────────────────────────────

const MEAL_PRESET_MIN_OCCURRENCES = 2

function normalizeSignatureText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function signatureNumber(value: unknown, decimals = 1) {
  const number = nonNegativeFoodNumber(value)
  const factor = 10 ** decimals
  return Math.round(number * factor) / factor
}

function mealSuggestionKey(meal: MealType, signature: string) {
  return `${meal}:${signature}`
}

export function mealLabel(meal: MealType) {
  const category = DEFAULT_MEAL_CATEGORIES.find((item) => item.id === meal)
  if (category) return category.label
  return String(meal)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function presetId() {
  return createClientId()
}

export function foodLogEntryFromFoodResult(
  food: FoodResult,
  options: {
    grams?: number
    micros?: LogMicros
    meal?: MealType
    detail?: FoodDetail | null
    portion?: FoodPortion
    loggedAt?: string
  } = {}
): FoodLogEntry {
  const grams = positiveFoodNumber(options.grams ?? 100) ?? 100
  const macros = scaledFoodMacros(food, grams, options.detail)
  const portionLabel = options.portion
    ? foodPortionLabel(options.portion)
    : `${grams} g`

  return stripUndefined({
    id: presetId(),
    name:
      grams === 100 && !options.portion
        ? food.name
        : `${food.name} (${portionLabel})`,
    ...macros,
    loggedAt: options.loggedAt ?? new Date().toISOString(),
    meal: options.meal ?? defaultMeal(),
    source: "openfoodfacts" as const,
    foodCode: food.code,
    quantityGrams: grams,
    servingGrams: positiveFoodNumber(options.detail?.servingGrams) ?? undefined,
    servingLabel: options.detail?.servingLabel ?? food.serving,
    imageUrl: options.detail?.imageUrl ?? food.imageUrl,
    openFoodFacts: options.detail?.openFoodFacts ?? food.openFoodFacts,
    ...options.micros,
  }) as FoodLogEntry
}

function mealPresetTotalCalories(entries: MealPresetEntry[]) {
  return entries.reduce(
    (sum, entry) => sum + signatureNumber(entry.calories, 0),
    0
  )
}

function groupFoodEntriesByMeal(entries: FoodLogEntry[]) {
  const groups = new Map<MealType, FoodLogEntry[]>()
  for (const entry of entries) {
    if (!groups.has(entry.meal)) groups.set(entry.meal, [])
    groups.get(entry.meal)!.push(entry)
  }
  return groups
}

function foodLogTotals(entries: Array<FoodLogEntry | MealPresetEntry>) {
  return entries.reduce(
    (acc, entry) => {
      acc.calories += Number(entry.calories) || 0
      acc.protein += Number(entry.protein) || 0
      acc.carbs += Number(entry.carbs) || 0
      acc.fat += Number(entry.fat) || 0
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function foodItemSummary(entries: Array<FoodLogEntry | MealPresetEntry>) {
  const names = entries.map((entry) => entry.name).filter(Boolean)
  if (names.length <= 2) return names.join(", ")
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`
}

function mealSortIndex(meal: MealType) {
  const index = DEFAULT_MEAL_CATEGORIES.findIndex((item) => item.id === meal)
  return index === -1 ? DEFAULT_MEAL_CATEGORIES.length : index
}

export function mealEntriesSignature(
  entries: Array<MealPresetEntry | FoodLogEntry>
) {
  if (entries.length === 0) return ""

  return entries
    .map((entry) =>
      JSON.stringify({
        source: entry.source ?? "",
        code: normalizeSignatureText(entry.foodCode),
        name: normalizeSignatureText(entry.name),
        serving: normalizeSignatureText(entry.servingLabel),
        quantityGrams: signatureNumber(entry.quantityGrams),
        servingGrams: signatureNumber(entry.servingGrams),
        calories: signatureNumber(entry.calories, 0),
        protein: signatureNumber(entry.protein),
        carbs: signatureNumber(entry.carbs),
        fat: signatureNumber(entry.fat),
      })
    )
    .sort()
    .join("|")
}

export function mealPresetTemplateEntries(
  entries: Array<FoodLogEntry | MealPresetEntry>
): MealPresetEntry[] {
  return entries.map((entry) => {
    const {
      _id: _entryId,
      id: _clientId,
      loggedAt: _loggedAt,
      meal: _meal,
      ...template
    } = entry as FoodLogEntry

    return stripUndefined(template) as MealPresetEntry
  })
}

export function foodLogEntriesFromMealPreset(
  preset: Pick<MealPreset, "entries" | "meal">,
  options: { meal?: MealType; loggedAt?: string } = {}
): FoodLogEntry[] {
  const loggedAt = options.loggedAt ?? new Date().toISOString()
  const meal = options.meal ?? preset.meal

  return preset.entries.map(
    (entry) =>
      stripUndefined({
        ...entry,
        id: presetId(),
        name: entry.name,
        calories: signatureNumber(entry.calories, 0),
        protein: signatureNumber(entry.protein),
        carbs: signatureNumber(entry.carbs),
        fat: signatureNumber(entry.fat),
        loggedAt,
        meal,
      }) as FoodLogEntry
  )
}

export function buildFoodHistoryDaySummaries(
  days: FoodLogDaySnapshot[],
  options: { excludeDate?: string; limit?: number } = {}
): FoodHistoryDaySummary[] {
  const limit = options.limit ?? 14

  return days
    .filter((day) => day.date !== options.excludeDate)
    .map((day): FoodHistoryDaySummary | null => {
      const entries = day.entries.filter((entry) => entry.name?.trim())
      if (entries.length === 0) return null

      const meals = [...groupFoodEntriesByMeal(entries).entries()]
        .map(([meal, mealEntries]) => ({
          meal,
          mealLabel: mealLabel(meal),
          entries: mealEntries,
          itemSummary: foodItemSummary(mealEntries),
          ...foodLogTotals(mealEntries),
        }))
        .sort(
          (a, b) =>
            mealSortIndex(a.meal) - mealSortIndex(b.meal) ||
            a.mealLabel.localeCompare(b.mealLabel)
        )

      return {
        date: day.date,
        entries,
        meals,
        ...foodLogTotals(entries),
      }
    })
    .filter((day): day is FoodHistoryDaySummary => Boolean(day))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
}

export function foodLogEntriesFromHistoryMeal(
  entries: FoodLogEntry[],
  options: { meal?: MealType; loggedAt?: string } = {}
) {
  const meal = options.meal ?? entries[0]?.meal ?? defaultMeal()
  return foodLogEntriesFromMealPreset(
    {
      meal,
      entries: mealPresetTemplateEntries(entries),
    },
    options
  )
}

export function findSmartMealPresetSuggestion({
  recentDays,
  presets,
  todayEntries,
  currentMeal,
  dismissedKeys = [],
}: {
  recentDays: FoodLogDaySnapshot[]
  presets: MealPreset[]
  todayEntries: FoodLogEntry[]
  currentMeal: MealType
  dismissedKeys?: string[]
}): SmartMealPresetSuggestion | null {
  const dismissed = new Set(dismissedKeys)
  const todayMealSignatures = new Set<string>()
  const currentMealHasEntries = todayEntries.some(
    (entry) => entry.meal === currentMeal
  )

  for (const [meal, entries] of groupFoodEntriesByMeal(todayEntries)) {
    const signature = mealEntriesSignature(entries)
    if (signature) todayMealSignatures.add(mealSuggestionKey(meal, signature))
  }

  const presetsWithSignatures = presets.map((preset) => {
    const signature =
      preset.signature ||
      mealEntriesSignature(mealPresetTemplateEntries(preset.entries))
    return {
      ...preset,
      signature,
      key: mealSuggestionKey(preset.meal, signature),
    }
  })

  const logPreset = currentMealHasEntries
    ? null
    : presetsWithSignatures
        .filter((preset) => preset.meal === currentMeal)
        .filter((preset) => preset.signature.length > 0)
        .filter((preset) => !todayMealSignatures.has(preset.key))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]

  if (logPreset) {
    return {
      kind: "log",
      key: logPreset.key,
      meal: logPreset.meal,
      mealLabel: mealLabel(logPreset.meal),
      preset: logPreset,
      signature: logPreset.signature,
      entries: mealPresetTemplateEntries(logPreset.entries),
    }
  }

  const existingPresetKeys = new Set(
    presetsWithSignatures.map((preset) => preset.key)
  )
  const occurrences = new Map<
    string,
    {
      key: string
      meal: MealType
      signature: string
      entries: MealPresetEntry[]
      count: number
      latestDate: string
    }
  >()

  for (const day of recentDays) {
    for (const [meal, entries] of groupFoodEntriesByMeal(day.entries)) {
      const templateEntries = mealPresetTemplateEntries(entries)
      const signature = mealEntriesSignature(templateEntries)
      if (!signature) continue

      const key = mealSuggestionKey(meal, signature)
      const existing = occurrences.get(key)
      if (!existing) {
        occurrences.set(key, {
          key,
          meal,
          signature,
          entries: templateEntries,
          count: 1,
          latestDate: day.date,
        })
        continue
      }

      existing.count += 1
      if (day.date > existing.latestDate) {
        existing.latestDate = day.date
        existing.entries = templateEntries
      }
    }
  }

  const repeatedMeal = [...occurrences.values()]
    .filter((occurrence) => occurrence.count >= MEAL_PRESET_MIN_OCCURRENCES)
    .filter((occurrence) => !existingPresetKeys.has(occurrence.key))
    .filter((occurrence) => !dismissed.has(occurrence.key))
    .sort(
      (a, b) =>
        b.latestDate.localeCompare(a.latestDate) ||
        b.count - a.count ||
        mealPresetTotalCalories(b.entries) - mealPresetTotalCalories(a.entries)
    )[0]

  if (!repeatedMeal) return null

  const label = mealLabel(repeatedMeal.meal)
  return {
    kind: "save",
    key: repeatedMeal.key,
    meal: repeatedMeal.meal,
    mealLabel: label,
    name: `Usual ${label}`,
    signature: repeatedMeal.signature,
    entries: repeatedMeal.entries,
    count: repeatedMeal.count,
    latestDate: repeatedMeal.latestDate,
  }
}

export const CUSTOM_CATEGORY_COLORS: Array<{ color: string; bg: string }> =
  CUSTOM_CATEGORY_TONES.map(({ color, bg }) => ({ color, bg }))

// ─── Custom meal category helpers ────────────────────────────────────────────

const CUSTOM_CATEGORIES_KEY = "onerep_custom_meal_categories"

function readCustomCategories(): MealCategory[] {
  try {
    const raw = safeLocalStorageGet(CUSTOM_CATEGORIES_KEY)
    return raw ? (JSON.parse(raw) as MealCategory[]) : []
  } catch {
    return []
  }
}

function writeCustomCategories(cats: MealCategory[]): void {
  safeLocalStorageSet(CUSTOM_CATEGORIES_KEY, JSON.stringify(cats))
}

export function readAllMealCategories(): MealCategory[] {
  return [...DEFAULT_MEAL_CATEGORIES, ...readCustomCategories()]
}

export function addMealCategory(label: string): void {
  const existing = readCustomCategories()
  const colorIdx = existing.length % CUSTOM_CATEGORY_COLORS.length
  const { color, bg } = CUSTOM_CATEGORY_COLORS[colorIdx]
  const id = label.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now()
  writeCustomCategories([...existing, { id, label, color, bg }])
}

export function removeMealCategory(id: string): void {
  writeCustomCategories(readCustomCategories().filter((c) => c.id !== id))
}

// ─── Default meal by time of day ──────────────────────────────────────────────

export function defaultMeal(): MealType {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return "breakfast"
  if (h >= 11 && h < 15) return "lunch"
  if (h >= 15 && h < 21) return "dinner"
  return "snack"
}

// ─── Date key helpers ─────────────────────────────────────────────────────────

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function readDatePartsInTimeZone(timeZone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  }
}

export function detectTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

export function dateForOffset(
  offset: number,
  timeZone = detectTimeZone(),
  date = new Date()
): string {
  const { year, month, day } = readDatePartsInTimeZone(timeZone, date)
  const shifted = new Date(Date.UTC(year, month - 1, day + offset, 12))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function offsetDateKey(dateKey: string, offset: number) {
  const shifted = new Date(`${dateKey}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + offset)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function currentDateKey(timeZone = detectTimeZone(), date = new Date()) {
  return dateForOffset(0, timeZone, date)
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

export type RecipeIngredient = {
  id: string
  name: string
  grams: number
  displayAmount?: number
  displayUnit?: FoodPortionUnit
  servingLabel?: string
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
  fiberPer100?: number
  sugarPer100?: number
  saturatedFatPer100?: number
  transFatPer100?: number
  cholesterolPer100?: number
  sodiumPer100?: number
  potassiumPer100?: number
  calciumPer100?: number
  ironPer100?: number
  magnesiumPer100?: number
  phosphorusPer100?: number
  zincPer100?: number
  vitaminCPer100?: number
  vitaminAPer100?: number
  vitaminDPer100?: number
  vitaminB12Per100?: number
  caffeinePer100?: number
  alcoholPer100?: number
}

export type Recipe = {
  _id?: string // Convex ID
  name: string
  createdAt: string | number
  recipeType?: "quick" | "detailed"
  description?: string
  servings?: number
  prepMinutes?: number
  cookMinutes?: number
  category?: string
  notes?: string
  placeholderImage?: string
  originCountry?: string
  isCommunityShared?: boolean
  communityAuthorName?: string
  sharedAt?: number
  communityAnonymous?: boolean
  isOwnedByViewer?: boolean
  ratingCount?: number
  ratingTotal?: number
  tags?: string[]
  steps?: string[]
  photoStorageIds?: string[]
  photoUrls?: Array<string | null>
  ingredients: RecipeIngredient[]
}
