import type { OpenFoodFactsProduct } from "@repo/models"

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
  servingGrams?: number
  servingLabel?: string
  imageUrl?: string
  openFoodFacts?: OpenFoodFactsProduct
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
  | "servingGrams"
  | "servingLabel"
  | "imageUrl"
  | "openFoodFacts"
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
  const parsed = Number(
    String(value)
      .replace(",", ".")
      .replace(/[^0-9.-]/g, "")
  )
  return Number.isFinite(parsed) ? parsed : 0
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
  const normalized = fromUnit.toLowerCase().replace("µ", "u").trim()
  const inMg =
    normalized === "g"
      ? value * 1000
      : normalized === "ug" || normalized === "mcg"
        ? value / 1000
        : value

  if (toUnit === "g") return inMg / 1000
  if (toUnit === "mcg") return inMg * 1000
  return inMg
}

function roundFoodNutrient(value: number): number {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
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
  const caloriesRatio = positiveRatio(
    Number(entry.calories),
    foodNutrientPer100(nutriments, "energy-kcal")
  )
  if (caloriesRatio) return caloriesRatio

  const macroRatios = [
    positiveRatio(Number(entry.protein), foodNutrientPer100(nutriments, "proteins")),
    positiveRatio(
      Number(entry.carbs),
      foodNutrientPer100(nutriments, "carbohydrates")
    ),
    positiveRatio(Number(entry.fat), foodNutrientPer100(nutriments, "fat")),
  ].filter((value): value is number => value !== null)

  if (macroRatios.length > 0) {
    return macroRatios.sort((a, b) => a - b)[Math.floor(macroRatios.length / 2)]
  }

  if (entry.servingGrams && entry.servingGrams > 0) {
    return entry.servingGrams / 100
  }

  return 1
}

function micronutrientForEntry(
  entry: FoodLogEntry,
  key: FoodMicronutrientKey
): number {
  const logged = entry[key]
  if (typeof logged === "number" && Number.isFinite(logged) && logged > 0) {
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
  | "g"
  | "oz"
  | "ml"
  | "fl_oz"
  | "cup"
  | "tbsp"
  | "tsp"

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
  return FOOD_PORTION_UNITS.find((option) => option.id === unit) ?? FOOD_PORTION_UNITS[0]
}

function roundPortion(value: number) {
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

export function gramsFromFoodPortion(amount: number, unit: FoodPortionUnit) {
  return Math.max(0.1, Math.round(amount * portionUnitConfig(unit).gramsPerUnit * 10) / 10)
}

export function amountFromFoodPortionGrams(grams: number, unit: FoodPortionUnit) {
  return roundPortion(grams / portionUnitConfig(unit).gramsPerUnit)
}

export function formatFoodPortionAmount(amount: number) {
  if (Math.abs(amount - Math.round(amount)) < 0.01) return String(Math.round(amount))
  return String(amount).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
}

export function foodPortionLabel(portion: FoodPortion) {
  return `${formatFoodPortionAmount(portion.amount)} ${foodPortionUnitLabel(portion.unit)}`
}

function normalizePortionUnit(raw: string): FoodPortionUnit | null {
  const unit = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim()
  if (unit === "g" || unit === "gram" || unit === "grams") return "g"
  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") return "g"
  if (unit === "oz" || unit === "ounce" || unit === "ounces") return "oz"
  if (unit === "ml" || unit === "milliliter" || unit === "milliliters") return "ml"
  if (unit === "cl" || unit === "centiliter" || unit === "centiliters") return "ml"
  if (unit === "l" || unit === "liter" || unit === "liters") return "ml"
  if (unit === "fl oz" || unit === "floz" || unit === "fluid ounce" || unit === "fluid ounces") return "fl_oz"
  if (unit === "cup" || unit === "cups") return "cup"
  if (unit === "tbsp" || unit === "tablespoon" || unit === "tablespoons") return "tbsp"
  if (unit === "tsp" || unit === "teaspoon" || unit === "teaspoons") return "tsp"
  return null
}

function normalizedPortionAmount(amount: number, rawUnit: string, unit: FoodPortionUnit) {
  const normalized = rawUnit.toLowerCase().replace(/\./g, "").trim()
  if (unit === "g" && normalized.startsWith("kg")) return amount * 1000
  if (unit === "ml" && normalized === "cl") return amount * 10
  if (unit === "ml" && (normalized === "l" || normalized.startsWith("liter"))) return amount * 1000
  return amount
}

export function parseFoodPortionLabel(label?: string | null): FoodPortion | null {
  if (!label) return null
  const match = label.match(
    /([0-9]+(?:[.,][0-9]+)?)\s*(fluid\s*ounces?|fl\.?\s*oz|floz|tablespoons?|tbsp|teaspoons?|tsp|cups?|kilograms?|kg|grams?|g|milliliters?|ml|centiliters?|cl|liters?|l|ounces?|oz)\b/i
  )
  if (!match) return null

  const rawAmount = Number(match[1].replace(",", "."))
  const unit = normalizePortionUnit(match[2])
  if (!Number.isFinite(rawAmount) || rawAmount <= 0 || !unit) return null

  const amount = roundPortion(normalizedPortionAmount(rawAmount, match[2], unit))
  return {
    amount,
    unit,
    grams: gramsFromFoodPortion(amount, unit),
  }
}

function looksLikeLiquid(name?: string | null) {
  return /\b(juice|water|milk|soda|drink|beverage|coffee|tea|smoothie|shake|soup|beer|wine)\b/i.test(
    name ?? ""
  )
}

export function inferFoodPortionUnit(label?: string | null, name?: string | null): FoodPortionUnit {
  const parsed = parseFoodPortionLabel(label)
  if (parsed) return parsed.unit

  const text = `${label ?? ""} ${name ?? ""}`.toLowerCase()
  if (/\b(ml|milliliter|cl|liter|litre|fluid ounce|fl oz|floz)\b/.test(text)) return "ml"
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
    const genericGramServing = parsed.unit === "g" && /\b100\s*g\b/i.test(label ?? "")
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
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    isDefault: true,
  },
  {
    id: "lunch",
    label: "Lunch",
    color: "#0ea5e9",
    bg: "rgba(14,165,233,0.12)",
    isDefault: true,
  },
  {
    id: "dinner",
    label: "Dinner",
    color: "#818cf8",
    bg: "rgba(129,140,248,0.12)",
    isDefault: true,
  },
  {
    id: "snack",
    label: "Snack",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    isDefault: true,
  },
]

export const CUSTOM_CATEGORY_COLORS = [
  { color: "#f43f5e", bg: "rgba(244,63,94,0.12)" },
  { color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  { color: "#06b6d4", bg: "rgba(6,182,212,0.12)" },
  { color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  { color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
  { color: "#84cc16", bg: "rgba(132,204,22,0.12)" },
]

// ─── Custom meal category helpers ────────────────────────────────────────────

const CUSTOM_CATEGORIES_KEY = "onerep_custom_meal_categories"

function readCustomCategories(): MealCategory[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY)
    return raw ? (JSON.parse(raw) as MealCategory[]) : []
  } catch {
    return []
  }
}

function writeCustomCategories(cats: MealCategory[]): void {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(cats))
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

export function dateForOffset(offset: number, timeZone = "UTC"): string {
  const { year, month, day } = readDatePartsInTimeZone(timeZone, new Date())
  const shifted = new Date(Date.UTC(year, month - 1, day + offset, 12))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function offsetDateKey(dateKey: string, offset: number) {
  const shifted = new Date(`${dateKey}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + offset)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function currentDateKey(timeZone = "UTC") {
  return dateForOffset(0, timeZone)
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
  createdAt: string
  ingredients: RecipeIngredient[]
}
