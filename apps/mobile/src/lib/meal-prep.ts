import {
  FOOD_MICRONUTRIENT_KEYS,
  offsetDateKey,
  stripUndefined,
  type FoodLogEntry,
  type FoodMicronutrientKey,
  type MealType,
  type Recipe,
} from "./food-log"
import { createClientId } from "./utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MealPrepStorage = "fridge" | "freezer" | "pantry"

export type MealPrepNutrients = {
  calories: number
  protein: number
  carbs: number
  fat: number
} & Partial<Record<FoodMicronutrientKey, number>>

export type MealPrepBatch = {
  _id?: string
  id?: string
  name: string
  meal?: MealType
  notes?: string
  preppedOn: string
  useByOn?: string
  storage?: MealPrepStorage
  servingsTotal: number
  servingsLogged: number
  nutrientsPerServing: MealPrepNutrients
  sourceRecipeId?: string
  archivedAt?: number
  createdAt?: number
  updatedAt?: number
}

export type MealPrepDraft = {
  id?: string
  name: string
  meal: MealType
  notes: string
  preppedOn: string
  useByOn: string
  storage: MealPrepStorage
  servingsTotal: string
  /** Nutrition entered for the whole batch, not per serving. */
  batchNutrients: {
    calories: string
    protein: string
    carbs: string
    fat: string
  }
  sourceRecipeId?: string
}

export const MEAL_PREP_STORAGE_OPTIONS: {
  id: MealPrepStorage
  label: string
  /** Typical safe-keeping window used to pre-fill the use-by date. */
  defaultDays: number
}[] = [
  { id: "fridge", label: "Fridge", defaultDays: 4 },
  { id: "freezer", label: "Freezer", defaultDays: 60 },
  { id: "pantry", label: "Pantry", defaultDays: 14 },
]

export function mealPrepStorageOption(storage: MealPrepStorage) {
  return (
    MEAL_PREP_STORAGE_OPTIONS.find((option) => option.id === storage) ??
    MEAL_PREP_STORAGE_OPTIONS[0]
  )
}

/** Use-by date implied by where the batch is stored. */
export function suggestedUseByDate(preppedOn: string, storage: MealPrepStorage) {
  return offsetDateKey(preppedOn, mealPrepStorageOption(storage).defaultDays)
}

// ─── Servings math ────────────────────────────────────────────────────────────

/** Servings are tracked to the quarter so half-portions round-trip cleanly. */
export function roundServings(servings: number) {
  if (!Number.isFinite(servings)) return 0
  return Math.round(servings * 4) / 4
}

export function servingsRemaining(batch: MealPrepBatch) {
  return Math.max(roundServings(batch.servingsTotal - batch.servingsLogged), 0)
}

export function batchIsEmpty(batch: MealPrepBatch) {
  return servingsRemaining(batch) <= 0
}

export function formatServings(servings: number) {
  const rounded = roundServings(servings)
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/0$/, "")
}

// ─── Freshness ────────────────────────────────────────────────────────────────

export type MealPrepFreshness = {
  status: "fresh" | "use-soon" | "expired" | "unknown"
  daysLeft?: number
  label: string
}

/**
 * Days between two YYYY-MM-DD keys. Uses UTC so a DST shift can't turn a
 * 4-day window into 3.9 days and round the wrong way.
 */
export function daysBetweenDateKeys(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.NaN
  return Math.round((end - start) / 86_400_000)
}

export function mealPrepFreshness(
  batch: MealPrepBatch,
  today: string
): MealPrepFreshness {
  if (!batch.useByOn) {
    return { status: "unknown", label: "No use-by date" }
  }

  const daysLeft = daysBetweenDateKeys(today, batch.useByOn)
  if (!Number.isFinite(daysLeft)) {
    return { status: "unknown", label: "No use-by date" }
  }

  if (daysLeft < 0) {
    const days = Math.abs(daysLeft)
    return {
      status: "expired",
      daysLeft,
      label: `Past use-by by ${days} day${days === 1 ? "" : "s"}`,
    }
  }
  if (daysLeft === 0) return { status: "use-soon", daysLeft, label: "Use today" }
  if (daysLeft <= 1) {
    return { status: "use-soon", daysLeft, label: "Use by tomorrow" }
  }
  return { status: "fresh", daysLeft, label: `${daysLeft} days left` }
}

/** Active batches first, then the ones expiring soonest. */
export function sortMealPrepBatches(batches: MealPrepBatch[], today: string) {
  return [...batches].sort((a, b) => {
    const aEmpty = batchIsEmpty(a)
    const bEmpty = batchIsEmpty(b)
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1

    const aDays = a.useByOn ? daysBetweenDateKeys(today, a.useByOn) : Infinity
    const bDays = b.useByOn ? daysBetweenDateKeys(today, b.useByOn) : Infinity
    if (aDays !== bDays) return aDays - bDays

    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })
}

// ─── Batch → per-serving nutrition ────────────────────────────────────────────

function parseNumber(raw: string) {
  const trimmed = raw.trim().replace(",", ".")
  if (!trimmed) return 0
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function perServingFromBatchTotals(
  batchTotals: MealPrepNutrients,
  servingsTotal: number
): MealPrepNutrients {
  const servings = servingsTotal > 0 ? servingsTotal : 1
  const round = (value: number) => Math.round((value / servings) * 100) / 100

  const perServing: MealPrepNutrients = {
    calories: Math.round(batchTotals.calories / servings),
    protein: round(batchTotals.protein),
    carbs: round(batchTotals.carbs),
    fat: round(batchTotals.fat),
  }

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = batchTotals[key]
    if (value === undefined) continue
    perServing[key] = round(value)
  }

  return perServing
}

export function scaleMealPrepNutrients(
  nutrients: MealPrepNutrients,
  servings: number
): MealPrepNutrients {
  const factor = Number.isFinite(servings) && servings > 0 ? servings : 0
  const round = (value: number) => Math.round(value * factor * 100) / 100

  const scaled: MealPrepNutrients = {
    calories: Math.round(nutrients.calories * factor),
    protein: round(nutrients.protein),
    carbs: round(nutrients.carbs),
    fat: round(nutrients.fat),
  }

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = nutrients[key]
    if (value === undefined) continue
    scaled[key] = round(value)
  }

  return scaled
}

export type MealPrepDraftResult = {
  valid: boolean
  errors: Partial<Record<"name" | "servingsTotal" | "nutrition", string>>
  servingsTotal: number
  nutrientsPerServing: MealPrepNutrients
}

export function resolveMealPrepDraft(draft: MealPrepDraft): MealPrepDraftResult {
  const errors: MealPrepDraftResult["errors"] = {}

  if (!draft.name.trim()) errors.name = "Name this batch"

  const servingsTotal = roundServings(parseNumber(draft.servingsTotal))
  if (servingsTotal <= 0) {
    errors.servingsTotal = "How many servings did this batch make?"
  }

  const batchTotals: MealPrepNutrients = {
    calories: parseNumber(draft.batchNutrients.calories),
    protein: parseNumber(draft.batchNutrients.protein),
    carbs: parseNumber(draft.batchNutrients.carbs),
    fat: parseNumber(draft.batchNutrients.fat),
  }

  if (
    batchTotals.calories <= 0 &&
    batchTotals.protein <= 0 &&
    batchTotals.carbs <= 0 &&
    batchTotals.fat <= 0
  ) {
    errors.nutrition = "Enter the nutrition for the whole batch"
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    servingsTotal,
    nutrientsPerServing: perServingFromBatchTotals(
      batchTotals,
      servingsTotal || 1
    ),
  }
}

// ─── Recipe → draft ───────────────────────────────────────────────────────────

/** Whole-recipe macro totals, derived from per-100g ingredient values. */
export function recipeBatchTotals(recipe: Recipe): MealPrepNutrients {
  const totals: MealPrepNutrients = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  }

  for (const ingredient of recipe.ingredients ?? []) {
    const factor = (ingredient.grams ?? 0) / 100
    if (factor <= 0) continue
    totals.calories += (ingredient.caloriesPer100 ?? 0) * factor
    totals.protein += (ingredient.proteinPer100 ?? 0) * factor
    totals.carbs += (ingredient.carbsPer100 ?? 0) * factor
    totals.fat += (ingredient.fatPer100 ?? 0) * factor
  }

  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  }
}

export function emptyMealPrepDraft(today: string): MealPrepDraft {
  return {
    name: "",
    meal: "lunch",
    notes: "",
    preppedOn: today,
    useByOn: suggestedUseByDate(today, "fridge"),
    storage: "fridge",
    servingsTotal: "4",
    batchNutrients: { calories: "", protein: "", carbs: "", fat: "" },
  }
}

export function mealPrepDraftFromRecipe(
  recipe: Recipe,
  today: string
): MealPrepDraft {
  const totals = recipeBatchTotals(recipe)
  const servings = recipe.servings && recipe.servings > 0 ? recipe.servings : 4

  return {
    ...emptyMealPrepDraft(today),
    name: recipe.name,
    servingsTotal: String(servings),
    sourceRecipeId: recipe._id,
    batchNutrients: {
      calories: totals.calories > 0 ? String(totals.calories) : "",
      protein: totals.protein > 0 ? String(totals.protein) : "",
      carbs: totals.carbs > 0 ? String(totals.carbs) : "",
      fat: totals.fat > 0 ? String(totals.fat) : "",
    },
  }
}

export function mealPrepDraftFromBatch(batch: MealPrepBatch): MealPrepDraft {
  const totals = scaleMealPrepNutrients(
    batch.nutrientsPerServing,
    batch.servingsTotal
  )

  return {
    id: batch.id ?? batch._id,
    name: batch.name,
    meal: batch.meal ?? "lunch",
    notes: batch.notes ?? "",
    preppedOn: batch.preppedOn,
    useByOn: batch.useByOn ?? "",
    storage: batch.storage ?? "fridge",
    servingsTotal: String(batch.servingsTotal),
    sourceRecipeId: batch.sourceRecipeId,
    batchNutrients: {
      calories: String(totals.calories),
      protein: String(totals.protein),
      carbs: String(totals.carbs),
      fat: String(totals.fat),
    },
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────

/** Builds the food log entry for taking `servings` out of a batch. */
export function foodLogEntryFromMealPrep(
  batch: MealPrepBatch,
  options: { meal?: MealType; servings?: number; loggedAt?: string } = {}
): FoodLogEntry {
  const servings = roundServings(options.servings ?? 1) || 1
  const nutrients = scaleMealPrepNutrients(batch.nutrientsPerServing, servings)

  const entry: FoodLogEntry = {
    id: createClientId(),
    name: batch.name,
    calories: nutrients.calories,
    protein: nutrients.protein,
    carbs: nutrients.carbs,
    fat: nutrients.fat,
    meal: options.meal ?? batch.meal ?? "lunch",
    loggedAt: options.loggedAt ?? new Date().toISOString(),
    servingLabel: `${formatServings(servings)} serving${
      servings === 1 ? "" : "s"
    } · meal prep`,
    recipeId: batch.sourceRecipeId,
  }

  for (const key of FOOD_MICRONUTRIENT_KEYS) {
    const value = nutrients[key]
    if (value !== undefined && value > 0) entry[key] = value
  }

  return stripUndefined(entry)
}

/** Rolls up what is still in the fridge, for the page's summary block. */
export function mealPrepInventory(batches: MealPrepBatch[], today: string) {
  const active = batches.filter((batch) => !batchIsEmpty(batch))
  let servings = 0
  let calories = 0
  let protein = 0
  let expiringSoon = 0

  for (const batch of active) {
    const remaining = servingsRemaining(batch)
    servings += remaining
    calories += batch.nutrientsPerServing.calories * remaining
    protein += batch.nutrientsPerServing.protein * remaining

    const freshness = mealPrepFreshness(batch, today)
    if (freshness.status === "use-soon" || freshness.status === "expired") {
      expiringSoon += 1
    }
  }

  return {
    batches: active.length,
    servings: roundServings(servings),
    calories: Math.round(calories),
    protein: Math.round(protein),
    expiringSoon,
  }
}
