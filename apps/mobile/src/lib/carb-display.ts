/**
 * Net-carbohydrate display mode.
 *
 * Net carbs are never stored — they are derived as `max(0, carbs - fiber)` at
 * render time. The rule this module exists to enforce: **inputs stay total
 * carbs, outputs respect the mode.** Custom-food and recipe forms must keep
 * asking for total carbs, otherwise the subtraction double-counts.
 */

export type CarbDisplayMode = "total" | "net"

export type CarbSource = {
  carbs?: number | null
  fiber?: number | null
}

/** Coerces anything non-finite or negative to 0 so bad data never shows up. */
function safeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0
}

/** max(0, carbs - fiber). NaN/Infinity/negative-safe on both fields. */
export function netCarbs(source: CarbSource): number {
  return Math.max(0, safeNumber(source.carbs) - safeNumber(source.fiber))
}

/** The carb number to render for the active mode. */
export function displayCarbs(
  source: CarbSource,
  mode: CarbDisplayMode,
): number {
  return mode === "net" ? netCarbs(source) : safeNumber(source.carbs)
}

/** Title-case label for headings, rings and table columns. */
export function carbLabel(mode: CarbDisplayMode): string {
  return mode === "net" ? "Net carbs" : "Carbs"
}

/** Lower-case label for aria-labels and mid-sentence use. */
export function carbLabelLower(mode: CarbDisplayMode): string {
  return mode === "net" ? "net carbs" : "carbs"
}

/** Explanatory label for settings rows and report legends. */
export function carbLabelLong(mode: CarbDisplayMode): string {
  return mode === "net" ? "Net carbs (carbs − fiber)" : "Carbs"
}

/**
 * Sums the display value across entries. Summing per-entry (rather than
 * subtracting total fiber from total carbs) matters: an entry with more fiber
 * than carbs clamps on its own instead of eating into other entries.
 */
export function sumDisplayCarbs(
  items: CarbSource[],
  mode: CarbDisplayMode,
): number {
  if (!Array.isArray(items)) return 0
  return items.reduce((total, item) => total + displayCarbs(item ?? {}, mode), 0)
}

/** Adapts a recipe ingredient's per-100g nutrients to a CarbSource. */
export function ingredientCarbSource(ingredient: {
  grams?: number | null
  carbsPer100?: number | null
  fiberPer100?: number | null
}): CarbSource {
  const factor = safeNumber(ingredient.grams) / 100
  return {
    carbs: safeNumber(ingredient.carbsPer100) * factor,
    fiber: safeNumber(ingredient.fiberPer100) * factor,
  }
}

/**
 * The goal to compare net intake against.
 *
 * The stored goal is always total carbs. In net mode we subtract the fiber
 * target so intake and goal are both net — otherwise the ring always reads
 * generous. With no fiber target the goal passes through unchanged.
 */
export function displayCarbGoal(
  goalCarbs: number,
  fiberGoal: number | undefined | null,
  mode: CarbDisplayMode,
): number {
  const goal = safeNumber(goalCarbs)
  if (mode !== "net") return goal
  return Math.max(0, goal - safeNumber(fiberGoal))
}
