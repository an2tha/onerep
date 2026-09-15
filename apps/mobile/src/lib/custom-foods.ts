import {
  FOOD_MICRONUTRIENT_KEYS,
  stripUndefined,
  type FoodLogEntry,
  type FoodMicronutrientKey,
  type MealType,
} from "./food-log"
import type { FoodDetail, FoodResult } from "@repo/models"
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

/**
 * The basis a draft's numbers are written on.
 *
 * A US packet prints two columns — per serving and per 100 g — and this editor
 * only ever spoke the serving one, so correcting a two-column label meant
 * deleting the serving text and the grams and retyping both before the numbers
 * meant what the packet said. The basis is explicit instead, and switching it
 * re-scales the numbers rather than reinterpreting them.
 */
export const CUSTOM_FOOD_BASES = ["serving", "100g"] as const
export type CustomFoodBasis = (typeof CUSTOM_FOOD_BASES)[number]

/** How a copy written on the per-100 g basis names its serving. */
export const PER_100G_SERVING_LABEL = "100 g"

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
  /** The basis `nutrients` are written on — one serving, or 100 g. */
  basis: CustomFoodBasis
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
    CUSTOM_FOOD_NUTRIENT_KEYS.map((key) => [key, ""]),
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
    basis: "serving",
    nutrients: emptyNutrientFields(),
  }
}

/**
 * The basis an existing copy is written on.
 *
 * A copy stored under the canonical per-100 g serving *is* a per-100 g row, so
 * the editor opens on that basis and the numbers are read as the packet's
 * 100 g column. Everything else opens on the serving basis: a named portion is
 * the more useful thing to edit, and the toggle is one tap away either way.
 */
function basisFor(
  servingLabel: string | undefined,
  servingGrams: number | undefined | null,
): CustomFoodBasis {
  // A serving nobody weighed is not a scale the numbers can be in: they are per
  // 100 g, which is what the card prints for such a row whatever serving text it
  // carries ("1 Can" is not a weight).
  if (servingGrams === undefined || servingGrams === null) return "100g"
  if (servingGrams !== 100) return "serving"
  return (servingLabel ?? "").trim().toLowerCase() === PER_100G_SERVING_LABEL
    ? "100g"
    : "serving"
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
    basis: basisFor(food.servingLabel, food.servingGrams),
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
  draft: CustomFoodDraft,
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
  draft: CustomFoodDraft,
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
    nutrients.protein * 4 + nutrients.carbs * 4 + nutrients.fat * 9,
  )
}

export function macroCalorieMismatch(nutrients: CustomFoodNutrients) {
  const derived = caloriesFromMacros(nutrients)
  if (nutrients.calories <= 0 || derived <= 0) return false
  const drift = Math.abs(derived - nutrients.calories)
  return drift > Math.max(25, nutrients.calories * 0.2)
}

/**
 * The grams a draft's serving weighs, tolerantly.
 *
 * The field is free text, so "85 g", "85g" and "85,5" are all things a person
 * types while reading a packet. `Number("85 g")` is NaN, and NaN is not a
 * number Convex accepts, so that typed serving used to fail the save with a
 * validator error instead of being understood. Anything unreadable reads as
 * "no weight", which is a state the card already handles.
 */
export function parseServingGramsInput(raw: string): number | undefined {
  const cleaned = raw
    .trim()
    .replace(/\s*(grams?|g)\s*$/i, "")
    .replace(/\s+/g, "")
    .replace(",", ".")
  if (!cleaned) return undefined
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value * 100) / 100
}

/** The grams one unit of a draft's basis weighs — 100 g, or the serving. */
export function customFoodDraftBasisGrams(
  draft: CustomFoodDraft,
): number | undefined {
  return draft.basis === "100g"
    ? 100
    : parseServingGramsInput(draft.servingGrams)
}

/**
 * Re-keys a draft's numbers from one serving to 100 g, or back.
 *
 * The numbers are re-scaled, never reinterpreted: 340 kcal per 100 g becomes
 * the same food described as a 56 g serving (190.4 kcal). The declared serving
 * is left exactly as typed, so switching back restores it untouched — nothing
 * has to be rewritten by hand to move between the packet's two columns.
 *
 * A basis with no weight to scale from (neither the keyed grams nor a declared
 * serving) carries the numbers over as typed, the contract
 * `customFoodDraftFromDatabaseFood` already has for a row that declares none.
 */
export function customFoodDraftInBasis(
  draft: CustomFoodDraft,
  basis: CustomFoodBasis,
): CustomFoodDraft {
  if (basis === draft.basis) return draft
  const from = customFoodDraftBasisGrams(draft)
  const to = basis === "100g" ? 100 : parseServingGramsInput(draft.servingGrams)
  const factor = from !== undefined && to !== undefined ? to / from : 1
  return {
    ...draft,
    basis,
    nutrients: rescaleNutrientFields(draft.nutrients, factor),
  }
}

/**
 * The number fields multiplied by `factor`, as the raw strings the inputs hold.
 *
 * Every field keeps two decimals — the precision `parseNutrientInput` already
 * accepts, and the one that makes the trip between the packet's two columns
 * reversible (whole calories would take a 340 kcal column down to 339 on the
 * way back). Blank and unreadable fields stay exactly as the user left them
 * rather than becoming a number.
 */
function rescaleNutrientFields(
  fields: Record<CustomFoodNutrientKey, string>,
  factor: number,
): Record<CustomFoodNutrientKey, string> {
  const scaled = { ...fields }
  for (const key of CUSTOM_FOOD_NUTRIENT_KEYS) {
    const value = parseNutrientInput(fields[key])
    if (value === undefined) continue
    scaled[key] = String(Math.round(value * factor * 100) / 100)
  }
  return scaled
}

/**
 * The serving a draft's copy is keyed to, and the factor its numbers take.
 *
 * On the serving basis this is simply what was typed. On the 100 g basis the
 * copy is keyed to 100 g — that is the basis the user just typed in, and
 * keeping it is what makes those numbers exact instead of rounded through a
 * serving that is not 100 g — except where the packet declares a serving of
 * its own, which the copy keeps: the numbers are then converted onto it (a
 * two-decimal trip that reconstructs the typed per-100 g values, so the card
 * still counts in the packet's own portion). A packet that names a serving
 * without ever weighing it gets the 100 g copy instead, because a labelled
 * weight it never gave us would be a weight we invented.
 */
function savedServingFor(draft: CustomFoodDraft): {
  servingLabel: string
  servingGrams: number | undefined
  factor: number
} {
  const declared = parseServingGramsInput(draft.servingGrams)
  const label = draft.servingLabel.trim() || PER_100G_SERVING_LABEL
  if (draft.basis !== "100g") {
    return { servingLabel: label, servingGrams: declared, factor: 1 }
  }
  if (declared !== undefined && declared !== 100) {
    return {
      servingLabel: label,
      servingGrams: declared,
      factor: declared / 100,
    }
  }
  return {
    servingLabel: declared === 100 ? label : PER_100G_SERVING_LABEL,
    servingGrams: 100,
    factor: 1,
  }
}

/**
 * The write a draft describes.
 *
 * The correction sheet, the My-foods page and the scanner all save the same
 * shape; keeping it in one place is what stops the row the server stores from
 * drifting away from the row the screen shows.
 */
export function customFoodSaveArgs(draft: CustomFoodDraft) {
  const serving = savedServingFor(draft)
  return {
    name: draft.name.trim(),
    brand: draft.brand.trim() || undefined,
    servingLabel: serving.servingLabel,
    servingGrams: serving.servingGrams,
    barcode: draft.barcode.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    favorite: draft.favorite,
    // The draft's numbers are per its basis; the row is per its serving. The
    // conversion runs over the same fields, and the same rounding, as the
    // toggle itself.
    nutrientsPerServing: customFoodNutrientsFromDraft(
      serving.factor === 1
        ? draft
        : {
            ...draft,
            nutrients: rescaleNutrientFields(draft.nutrients, serving.factor),
          },
    ),
  }
}

/**
 * The corrected copy a draft just wrote, as the screens should draw it.
 *
 * Read back from the draft rather than from the reactive list because the list
 * arrives on its own schedule: the card used to re-read it the instant the
 * write resolved, find nothing (or the previous copy), and keep showing the
 * database's numbers for a food the user had just corrected.
 */
export function customFoodFromDraft(
  draft: CustomFoodDraft,
  id?: string,
): CustomFood {
  return { ...(id ? { id } : {}), ...customFoodSaveArgs(draft) }
}

/**
 * Overlays a user's corrected copy onto a catalogue result.
 *
 * Custom foods store macros per serving; a catalogue result's macros are per
 * 100 g — the basis the whole scanner (portion scaling, presets, entry
 * building) is built on. Rebasing keeps that machinery intact and only the
 * numbers change, so the card shows and logs the user's own values for any
 * quantity they pick.
 */
export function applyCorrectedCopy<
  T extends FoodResult &
    Partial<Pick<FoodDetail, "servingGrams" | "servingLabel" | "nutrients">>,
>(food: T, corrected: CustomFood): T {
  const per100 =
    corrected.servingGrams && corrected.servingGrams > 0
      ? 100 / corrected.servingGrams
      : 1
  const macros = {
    energy: corrected.nutrientsPerServing.calories * per100,
    protein: corrected.nutrientsPerServing.protein * per100,
    carbs: corrected.nutrientsPerServing.carbs * per100,
    fat: corrected.nutrientsPerServing.fat * per100,
  }
  const nutrients = food.nutrients?.map((row) =>
    Object.hasOwn(macros, row.key)
      ? { ...row, per100g: macros[row.key as keyof typeof macros] }
      : row,
  )
  return {
    ...food,
    // Detail cards prefer nutrient rows over compact macro fields. Keep both
    // representations in sync so a correction is also used by the default
    // serving card and log path.
    ...(nutrients ? { nutrients } : {}),
    name: corrected.name,
    brand: corrected.brand ?? food.brand,
    serving: corrected.servingLabel || food.serving,
    // The correction carries its own serving. Keeping the catalogue's grams
    // here would scale the user's numbers by the ratio between the two.
    servingGrams: corrected.servingGrams ?? food.servingGrams,
    servingLabel: corrected.servingLabel || food.servingLabel,
    calories: Math.round(macros.energy),
    protein: Math.round(macros.protein * 10) / 10,
    carbs: Math.round(macros.carbs * 10) / 10,
    fat: Math.round(macros.fat * 10) / 10,
    // A generic spread cannot preserve T on its own; every field above is one
    // T already declares (serving fields optionally), so the result is T.
  } as T
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export function scaleCustomFoodNutrients(
  nutrients: CustomFoodNutrients,
  servings: number,
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
  const amount = Number.isInteger(servings)
    ? String(servings)
    : servings.toFixed(2)
  return `${amount} × ${servingLabel}`
}

/** Turns a saved custom food into a food log entry ready for `setDay`. */
export function foodLogEntryFromCustomFood(
  food: CustomFood,
  options: { meal: MealType; servings?: number; loggedAt?: string },
): FoodLogEntry {
  const servings =
    options.servings && options.servings > 0 ? options.servings : 1
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
    `${food.name} ${food.brand ?? ""}`.toLowerCase().includes(needle),
  )
}

/**
 * The corrected copy a barcode already has, if any.
 *
 * Corrections used to be insert-only, so scanning one packet twice left two
 * rows claiming the same barcode and the card could apply either — and because
 * pinned foods sort first, a pinned copy quietly outranked every later
 * correction. One barcode keeps one corrected copy; correcting it again
 * updates that row instead of adding another.
 */
export function correctedCopyForBarcode(
  foods: CustomFood[],
  barcode?: string | null,
): CustomFood | null {
  const code = (barcode ?? "").trim()
  if (!code) return null
  return foods.find((food) => (food.barcode ?? "").trim() === code) ?? null
}

/**
 * Pre-fills the editor draft from a food that came from the shared database,
 * so "correct these values" starts from what the database claims and the
 * user fixes only what is wrong. The copy carries the barcode for
 * provenance; an empty serving label is given one rather than failing
 * validation for a field the user never meant to change.
 */
export function customFoodDraftFromDatabaseFood(food: {
  code?: string
  name: string
  brand?: string
  servingLabel?: string
  servingGrams?: number | null
  calories: number
  protein: number
  carbs: number
  fat: number
}): CustomFoodDraft {
  const base = emptyCustomFoodDraft()
  // Incoming macros are per 100 g (the datasource basis for both search
  // results and FoodDetail rows). The copy keeps the product's declared
  // serving, so rebase the numbers onto it — otherwise a corrected "1 bar
  // (40 g)" saves the 100 g macros as one serving and every later log
  // over-reports by servingGrams/100. No declared serving keeps the 100 g
  // basis, where the values carry over as typed.
  const servingGrams =
    food.servingGrams !== undefined &&
    food.servingGrams !== null &&
    Number.isFinite(food.servingGrams) &&
    food.servingGrams > 0
      ? food.servingGrams
      : null
  const perServing =
    servingGrams !== null && servingGrams !== 100 ? servingGrams / 100 : 1
  const servingLabel = food.servingLabel || PER_100G_SERVING_LABEL
  return {
    ...base,
    name: food.name,
    brand: food.brand ?? "",
    barcode: food.code ?? "",
    servingLabel,
    servingGrams: servingGrams !== null ? String(servingGrams) : "",
    // A row that weighs nothing, or weighs exactly 100 g, is already written
    // per 100 g: that is the basis the sheet opens on and the one its numbers
    // are read as.
    basis: basisFor(servingLabel, servingGrams),
    nutrients: {
      ...base.nutrients,
      calories: String(Math.round(food.calories * perServing)),
      protein: String(round2(food.protein * perServing)),
      carbs: String(round2(food.carbs * perServing)),
      fat: String(round2(food.fat * perServing)),
    },
  }
}

function round2(value: number) {
  return Math.round(value * 10) / 10
}

/**
 * Pre-fills the editor draft from any scan/search result, so the
 * "correct these values" flow works from the camera sheet too. Every macro
 * on a scan result is per 100 g (that is the datasource's basis), so the
 * serving basis for the corrected copy is 100 g and the numbers carry over
 * as typed — exactly the figures the review card was showing.
 */
export function customFoodDraftFromFoodResult(food: {
  code?: string
  name: string
  brand?: string
  serving?: string
  calories: number
  protein: number
  carbs: number
  fat: number
}): CustomFoodDraft {
  return customFoodDraftFromDatabaseFood({
    code: food.code,
    name: food.name,
    brand: food.brand,
    servingLabel: food.serving,
    servingGrams: 100,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
  })
}
