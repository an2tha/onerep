/**
 * Hydration: optional as a tracker, and fed by drinks as well as by the glass.
 *
 * Two things live here so they cannot drift apart.
 *
 * The *total*: a day's hydration is the water rows plus whatever drinks were
 * counted. Every surface that used to sum `amountMl` on its own now asks this
 * file, because the dashboard tile, the Nutrition card, the home-screen widget,
 * the watch and the health write-back disagreeing about the same day is a bug
 * nobody sees coming.
 *
 * The *rule*: a repeated drink is not the point here — a drink's own portion is
 * the source of its millilitres, and whether it counts is the user's answer,
 * remembered. Nothing is inferred silently: an entry only contributes when it
 * carries `hydrationMl`.
 */

import { useEffect } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  FOOD_PORTION_UNITS,
  looksLikeLiquid,
  type FoodPortion,
  type FoodPortionUnit,
} from "./food-log"
import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"

/** The last explicit answer to "counts toward hydration", or null if never asked. */
const COUNT_DEFAULT_KEY = "onerep:count-drinks-as-water"
/** Paint-time mirror of the server preference, see `useHydrationEnabled`. */
const ENABLED_CACHE_KEY = "onerep:hydration-enabled"

/** Portions measured in volume rather than mass. */
const VOLUME_UNITS = new Set<FoodPortionUnit>([
  "ml",
  "fl_oz",
  "cup",
  "tbsp",
  "tsp",
])

/** A glass, for a drink whose portion the user overrode or never had. */
export const DEFAULT_DRINK_ML = 250

/**
 * The millilitres a drink's portion amounts to, or 0 for a food measured by
 * mass.
 *
 * For the volume units, the per-unit figure already in `FOOD_PORTION_UNITS` *is*
 * millilitres — a cup is 240, a fluid ounce 29.5735 — because that table
 * converts a portion to its water-equivalent mass. Reusing it means a drink
 * cannot disagree with the portion the sheet is showing, and there is no second
 * conversion table to keep in step.
 */
export function drinkVolumeMl(portion: FoodPortion | null | undefined): number {
  if (!portion || !VOLUME_UNITS.has(portion.unit)) return 0
  const mlPerUnit =
    FOOD_PORTION_UNITS.find((option) => option.id === portion.unit)?.gramsPerUnit ??
    0
  return Math.max(0, Math.round(portion.amount * mlPerUnit))
}

/** What a drink contributes when nothing more specific is known. */
export function hydrationAmountFor(portion: FoodPortion | null | undefined) {
  return drinkVolumeMl(portion) || DEFAULT_DRINK_ML
}

/** The millilitres one logged entry contributes. Unticked entries contribute none. */
export function entryHydrationMl(entry: { hydrationMl?: number }): number {
  const ml = entry.hydrationMl
  if (typeof ml !== "number" || !Number.isFinite(ml) || ml <= 0) return 0
  return Math.round(ml)
}

/**
 * One day's two sides.
 *
 * Named so a caller holding several days — a week of them — can pass a day's
 * water rows and food entries together without inventing a shape of its own.
 */
export type HydrationDay = {
  water?: readonly { amountMl: number }[] | undefined
  food?: readonly { hydrationMl?: number }[] | undefined
}

/** What one day's counted drinks add up to. */
export function drinksHydrationMl(
  foodEntries: readonly { hydrationMl?: number }[] | undefined
): number {
  return (foodEntries ?? []).reduce(
    (sum, entry) => sum + entryHydrationMl(entry),
    0
  )
}

/** What one day's glass-and-bottle rows add up to. */
export function waterRowsMl(
  waterEntries: readonly { amountMl: number }[] | undefined
): number {
  return (waterEntries ?? []).reduce((sum, entry) => sum + entry.amountMl, 0)
}

/**
 * The day's hydration: the water rows plus every counted drink.
 *
 * Callers pass whatever they already have; a missing side is zero, because a
 * day with no logged drinks is the normal case rather than an error.
 *
 * The two halves are named above so a caller that wants to say *where* the day's
 * water came from subtracts one from this rather than summing `amountMl` itself.
 */
export function dayHydrationMl(
  waterEntries: readonly { amountMl: number }[] | undefined,
  foodEntries: readonly { hydrationMl?: number }[] | undefined
): number {
  return Math.round(waterRowsMl(waterEntries) + drinksHydrationMl(foodEntries))
}

/** Returns the entry with its hydration answer applied — or removed, if unticked. */
export function withEntryHydration<T extends { hydrationMl?: number }>(
  entry: T,
  counts: boolean,
  amountMl: number
): T {
  const { hydrationMl: _previous, ...rest } = entry
  if (!counts) return rest as T
  return {
    ...rest,
    hydrationMl: Math.max(0, Math.round(amountMl)),
  } as T
}

export function readHydrationCountDefault(): boolean | null {
  const stored = safeLocalStorageGet(COUNT_DEFAULT_KEY)
  if (stored === "1") return true
  if (stored === "0") return false
  return null
}

export function writeHydrationCountDefault(counts: boolean) {
  safeLocalStorageSet(COUNT_DEFAULT_KEY, counts ? "1" : "0")
}

/**
 * Whether the answer should start ticked.
 *
 * The user's last answer wins, because someone who counts their morning coffee
 * should not re-tick it every single day. Before they have ever answered, a
 * drink starts counted and a food does not: the portion is measured in volume,
 * or the name reads as one of the things people drink. This is a starting
 * position being guessed, never a write — an entry contributes only once the
 * answer is on the entry itself.
 */
export function defaultCountsAsWater({
  name,
  portion,
  liquid,
}: {
  name?: string | null
  portion?: FoodPortion | null
  /**
   * The caller already knows this is a drink — the sheet's own liquid test,
   * which can also read a volume baked into a label ("330 ml") that neither a
   * name nor a portion unit would reveal on its own. Passing it keeps the
   * ticked default and the row's own visibility test answering the same way.
   */
  liquid?: boolean
}): boolean {
  const remembered = readHydrationCountDefault()
  if (remembered !== null) return remembered
  if (liquid === true) return true
  if (portion && VOLUME_UNITS.has(portion.unit)) return true
  return looksLikeLiquid(name)
}

/** The preference, as a value rather than a hook. Absent means on. */
export function hydrationEnabledFor(
  preferences: { hydrationEnabled?: boolean } | null | undefined
): boolean {
  return preferences?.hydrationEnabled ?? true
}

/**
 * Whether hydration is tracked, for the surfaces that would otherwise render.
 *
 * While the preference is still loading this answers from a local mirror rather
 * than defaulting to on: a first paint that shows the water tile and then
 * withdraws it is worse than one that never showed it, and someone who turned
 * the tracker off should not be asked about it again on every cold start. The
 * mirror is a display cache only — the server preference stays the source of
 * truth and overwrites it the moment it arrives.
 */
export function useHydrationEnabled(): boolean {
  const preferences = useQuery(api.users.users.getPreferences)
  const known = preferences === undefined ? null : hydrationEnabledFor(preferences)

  useEffect(() => {
    if (known === null) return
    safeLocalStorageSet(ENABLED_CACHE_KEY, known ? "1" : "0")
  }, [known])

  if (known !== null) return known
  return safeLocalStorageGet(ENABLED_CACHE_KEY) !== "0"
}
