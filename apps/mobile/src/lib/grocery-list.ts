import type { Recipe, RecipeIngredient } from "./food-log"

/**
 * Automatic grocery lists.
 *
 * Recipes already store structured ingredients (name + grams + an optional
 * display amount and unit), so a shopping list is mostly a merge problem: pull
 * the ingredients out of every selected recipe, scale them to the servings the
 * user actually wants, and combine lines that name the same thing.
 */

export type GroceryItem = {
  id: string
  name: string
  /** Normalised merge key — two items with the same key are the same food. */
  key: string
  grams?: number
  displayAmount?: number
  displayUnit?: string
  category?: string
  checked: boolean
  manual?: boolean
  /** Recipe names this line came from, so "why is this here?" is answerable. */
  sources?: string[]
}

export type GrocerySourceIngredient = {
  name: string
  grams?: number
  displayAmount?: number
  displayUnit?: string
  sourceLabel?: string
}

export type GroceryList = {
  name: string
  items: GroceryItem[]
}

// ─── Merge keys ───────────────────────────────────────────────────────────────

/** Leading quantities and common size/quality adjectives are not the food. */
const QUALIFIERS = new Set([
  "large",
  "small",
  "medium",
  "extra",
  "fresh",
  "frozen",
  "dried",
  "raw",
  "cooked",
  "organic",
  "free",
  "range",
  "freerange",
  "whole",
  "chopped",
  "sliced",
  "diced",
  "minced",
  "ground",
  "boneless",
  "skinless",
  "ripe",
  "unsalted",
  "salted",
  "of",
  "a",
  "an",
  "the",
])

const IRREGULAR_SINGULARS: Record<string, string> = {
  leaves: "leaf",
  loaves: "loaf",
  potatoes: "potato",
  tomatoes: "tomato",
  berries: "berry",
}

function singularise(word: string): string {
  if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word]
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.length > 3 && word.endsWith("ses")) return word.slice(0, -2)
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1)
  }
  return word
}

/**
 * Collapses a free-text ingredient name to a comparable key.
 *
 * "2 large Free-Range Eggs" and "eggs" both become "egg", so a shopping list
 * built from two recipes shows one line rather than two near-duplicates.
 */
export function groceryMergeKey(name: string): string {
  if (typeof name !== "string") return ""

  const words = name
    .normalize("NFKD")
    // Strip combining marks so "jalapeño" and "jalapeno" match.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Drop leading quantities: "2 eggs" is still eggs.
    .filter((word) => !/^\d+$/.test(word))
    .map(singularise)
    .filter((word) => !QUALIFIERS.has(word))

  // If qualifiers were the whole name, keep something rather than nothing.
  if (words.length === 0) {
    return name.trim().toLowerCase().replace(/\s+/g, " ")
  }
  return words.join(" ")
}

// ─── Units ────────────────────────────────────────────────────────────────────

const MASS_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
}

/**
 * Converts a display amount to grams where the unit is a mass.
 *
 * Returns null for counts and volumes. That null is load-bearing: adding
 * millilitres to grams, or "2 cloves" to "300 g", would silently produce a
 * nonsense quantity on the shopping list.
 */
export function toGrams(amount: number, unit: string): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return null
  }
  if (typeof unit !== "string") return null
  const factor = MASS_TO_GRAMS[unit.trim().toLowerCase()]
  return factor === undefined ? null : amount * factor
}

// ─── Aisles ───────────────────────────────────────────────────────────────────

export const GROCERY_CATEGORIES = [
  "Produce",
  "Protein",
  "Dairy",
  "Pantry",
  "Frozen",
  "Other",
] as const

const CATEGORY_KEYWORDS: [string, string[]][] = [
  [
    "Produce",
    [
      "apple",
      "banana",
      "spinach",
      "kale",
      "lettuce",
      "tomato",
      "onion",
      "garlic",
      "carrot",
      "pepper",
      "broccoli",
      "cucumber",
      "potato",
      "lemon",
      "lime",
      "berry",
      "avocado",
      "mushroom",
      "celery",
      "herb",
      "basil",
      "cilantro",
      "parsley",
      "ginger",
      "zucchini",
      "courgette",
    ],
  ],
  [
    "Protein",
    [
      "chicken",
      "beef",
      "pork",
      "turkey",
      "salmon",
      "tuna",
      "shrimp",
      "prawn",
      "fish",
      "egg",
      "tofu",
      "tempeh",
      "lamb",
      "bacon",
      "sausage",
      "mince",
      "steak",
      "lentil",
      "chickpea",
      "bean",
    ],
  ],
  [
    "Dairy",
    [
      "milk",
      "cheese",
      "yogurt",
      "yoghurt",
      "butter",
      "cream",
      "kefir",
      "mozzarella",
      "cheddar",
      "parmesan",
      "feta",
    ],
  ],
  ["Frozen", ["frozen", "ice cream", "pea"]],
  [
    "Pantry",
    [
      "rice",
      "pasta",
      "flour",
      "sugar",
      "oil",
      "vinegar",
      "salt",
      "pepper",
      "spice",
      "sauce",
      "stock",
      "broth",
      "oat",
      "quinoa",
      "noodle",
      "bread",
      "honey",
      "syrup",
      "nut",
      "almond",
      "peanut",
      "seed",
      "cocoa",
      "tortilla",
      "cereal",
      "couscous",
    ],
  ],
]

/** Best-effort aisle from the ingredient name; falls back to "Other". */
export function guessGroceryCategory(name: string): string {
  const key = groceryMergeKey(name)
  if (!key) return "Other"
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => key.includes(keyword))) return category
  }
  return "Other"
}

// ─── Merging ──────────────────────────────────────────────────────────────────

function mergeSources(a?: string[], b?: string[]): string[] | undefined {
  const combined = [...(a ?? []), ...(b ?? [])]
  if (combined.length === 0) return undefined
  return [...new Set(combined)]
}

/**
 * Combines lines that name the same food.
 *
 * Grams merge with grams and matching non-mass units merge with each other.
 * Anything else stays as a separate line under the same name — a list showing
 * "Milk 500 g" and "Milk 200 ml" is honest; "Milk 700" is not.
 */
export function mergeGroceryItems(items: GroceryItem[]): GroceryItem[] {
  if (!Array.isArray(items)) return []

  const merged: GroceryItem[] = []

  for (const item of items) {
    if (!item) continue
    const target = merged.find((candidate) => {
      if (candidate.key !== item.key) return false
      // Both measured in grams, or both counted in the same unit.
      if (candidate.grams !== undefined && item.grams !== undefined) return true
      if (candidate.grams !== undefined || item.grams !== undefined)
        return false
      return (
        (candidate.displayUnit ?? "") === (item.displayUnit ?? "") &&
        candidate.displayAmount !== undefined &&
        item.displayAmount !== undefined
      )
    })

    if (!target) {
      merged.push({ ...item, sources: mergeSources(item.sources) })
      continue
    }

    if (target.grams !== undefined && item.grams !== undefined) {
      target.grams += item.grams
    } else if (
      target.displayAmount !== undefined &&
      item.displayAmount !== undefined
    ) {
      target.displayAmount += item.displayAmount
    }
    // A merged line is only "done" if every contributing line was ticked off.
    target.checked = target.checked && item.checked
    target.sources = mergeSources(target.sources, item.sources)
  }

  return merged
}

// ─── Building ─────────────────────────────────────────────────────────────────

function itemId(key: string, index: number): string {
  return `${key.replace(/\s+/g, "-") || "item"}-${index}`
}

function ingredientToItem(
  ingredient: GrocerySourceIngredient,
  index: number
): GroceryItem {
  const key = groceryMergeKey(ingredient.name)
  const grams =
    typeof ingredient.grams === "number" &&
    Number.isFinite(ingredient.grams) &&
    ingredient.grams > 0
      ? ingredient.grams
      : undefined

  return {
    id: itemId(key, index),
    name: ingredient.name.trim() || "Item",
    key,
    grams,
    // Keep a display amount only when there is no gram weight to show instead.
    displayAmount:
      grams === undefined && typeof ingredient.displayAmount === "number"
        ? ingredient.displayAmount
        : undefined,
    displayUnit: grams === undefined ? ingredient.displayUnit : undefined,
    category: guessGroceryCategory(ingredient.name),
    checked: false,
    sources: ingredient.sourceLabel ? [ingredient.sourceLabel] : undefined,
  }
}

/**
 * A recipe's ingredients, scaled to the number of servings wanted.
 *
 * `servings` is optional on a recipe and can be zero in bad data, so the scale
 * factor falls back to 1 rather than dividing by zero.
 */
export function ingredientsFromRecipe(
  recipe: Recipe,
  servingsWanted?: number
): GrocerySourceIngredient[] {
  const ingredients = (recipe?.ingredients ?? []) as RecipeIngredient[]
  if (!Array.isArray(ingredients) || ingredients.length === 0) return []

  const recipeServings =
    typeof recipe.servings === "number" &&
    Number.isFinite(recipe.servings) &&
    recipe.servings > 0
      ? recipe.servings
      : 1
  const wanted =
    typeof servingsWanted === "number" &&
    Number.isFinite(servingsWanted) &&
    servingsWanted > 0
      ? servingsWanted
      : recipeServings
  const scale = wanted / recipeServings

  return ingredients.map((ingredient) => ({
    name: ingredient.name,
    grams:
      typeof ingredient.grams === "number" && Number.isFinite(ingredient.grams)
        ? ingredient.grams * scale
        : undefined,
    displayAmount:
      typeof ingredient.displayAmount === "number"
        ? ingredient.displayAmount * scale
        : undefined,
    displayUnit: ingredient.displayUnit,
    sourceLabel: recipe.name,
  }))
}

export type GroceryBatchSource = {
  sourceRecipeId?: string
  servingsTotal?: number
  name?: string
}

/**
 * Builds a merged list from selected recipes and meal-prep batches.
 *
 * Meal-prep batches store only per-serving nutrients, never ingredients, so a
 * batch can only contribute groceries by resolving its `sourceRecipeId` back
 * to the recipe. Batches without one are skipped and reported so the UI can
 * say why rather than silently dropping them.
 */
export function buildGroceryList(input: {
  recipes?: { recipe: Recipe; servings?: number }[]
  batches?: GroceryBatchSource[]
  recipesById?: Map<string, Recipe>
}): { items: GroceryItem[]; skippedBatches: string[] } {
  const sources: GrocerySourceIngredient[] = []
  const skippedBatches: string[] = []

  for (const entry of input.recipes ?? []) {
    if (!entry?.recipe) continue
    sources.push(...ingredientsFromRecipe(entry.recipe, entry.servings))
  }

  for (const batch of input.batches ?? []) {
    const recipe = batch?.sourceRecipeId
      ? input.recipesById?.get(batch.sourceRecipeId)
      : undefined
    if (!recipe) {
      skippedBatches.push(batch?.name ?? "Untitled batch")
      continue
    }
    sources.push(...ingredientsFromRecipe(recipe, batch.servingsTotal))
  }

  const items = mergeGroceryItems(
    sources.map((ingredient, index) => ingredientToItem(ingredient, index))
  )

  return { items: sortGroceryItems(items), skippedBatches }
}

/** A manually typed line, so a user can add "bin bags" to a generated list. */
export function manualGroceryItem(name: string): GroceryItem | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const key = groceryMergeKey(trimmed)
  return {
    id: `manual-${key.replace(/\s+/g, "-") || "item"}-${Date.now()}`,
    name: trimmed,
    key,
    category: guessGroceryCategory(trimmed),
    checked: false,
    manual: true,
  }
}

// ─── Presentation ─────────────────────────────────────────────────────────────

const CATEGORY_ORDER = new Map<string, number>(
  GROCERY_CATEGORIES.map((category, index) => [category, index])
)

/** Aisle order first, then name; ticked-off items sink to the bottom. */
export function sortGroceryItems(items: GroceryItem[]): GroceryItem[] {
  return [...(items ?? [])].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    const categoryDelta =
      (CATEGORY_ORDER.get(a.category ?? "Other") ?? 99) -
      (CATEGORY_ORDER.get(b.category ?? "Other") ?? 99)
    if (categoryDelta !== 0) return categoryDelta
    return a.name.localeCompare(b.name)
  })
}

/** How much of this item to buy, as a short human string. */
export function groceryItemAmount(item: GroceryItem): string {
  if (item.grams !== undefined && item.grams > 0) {
    return item.grams >= 1000
      ? `${Math.round(item.grams / 100) / 10} kg`
      : `${Math.round(item.grams)} g`
  }
  if (item.displayAmount !== undefined && item.displayAmount > 0) {
    const amount = Math.round(item.displayAmount * 100) / 100
    return item.displayUnit ? `${amount} ${item.displayUnit}` : `${amount}`
  }
  return ""
}

/** Plain text for the share sheet and clipboard. */
export function groceryListToText(list: GroceryList): string {
  const lines: string[] = [list.name]
  let currentCategory: string | null = null

  for (const item of sortGroceryItems(list.items ?? [])) {
    const category = item.category ?? "Other"
    if (category !== currentCategory) {
      lines.push("", category)
      currentCategory = category
    }
    const amount = groceryItemAmount(item)
    lines.push(
      `${item.checked ? "[x]" : "[ ]"} ${item.name}${amount ? ` — ${amount}` : ""}`
    )
  }

  return lines.join("\n")
}
