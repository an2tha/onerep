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
  "id" | "name" | "calories" | "protein" | "carbs" | "fat" | "loggedAt" | "meal"
>

// ─── Meal categories ──────────────────────────────────────────────────────────

export const DEFAULT_MEAL_CATEGORIES: MealCategory[] = [
  { id: "breakfast", label: "Breakfast", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", isDefault: true },
  { id: "lunch",     label: "Lunch",     color: "#0ea5e9", bg: "rgba(14,165,233,0.12)", isDefault: true },
  { id: "dinner",    label: "Dinner",    color: "#818cf8", bg: "rgba(129,140,248,0.12)", isDefault: true },
  { id: "snack",     label: "Snack",     color: "#34d399", bg: "rgba(52,211,153,0.12)", isDefault: true },
]

export const CUSTOM_CATEGORY_COLORS = [
  { color: "#f43f5e", bg: "rgba(244,63,94,0.12)"  },
  { color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  { color: "#06b6d4", bg: "rgba(6,182,212,0.12)"  },
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

export function dateForOffset(
  offset: number,
  timeZone = "UTC"
): string {
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
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
}

export type Recipe = {
  _id?: string // Convex ID
  name: string
  createdAt: string
  ingredients: RecipeIngredient[]
}
