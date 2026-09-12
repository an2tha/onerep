import { flOzToMl } from "./measurement-system"
import { browserLocalStorage } from "./utils"
import type { WaterUnit } from "./use-water-unit"

export const CUSTOM_WATER_MIN_ML = 50
export const CUSTOM_WATER_MAX_ML = 3000

/**
 * The standard one-tap pours.
 *
 * 250 ml is 8.5 fl oz, and a control offering "+8.5 fl oz" is asking the user
 * to do the arithmetic the unit was meant to save them. In fl oz the pour is the
 * round number instead; storage stays millilitres either way, so a logged entry
 * is the same kind of number whichever unit drew the button.
 */
export const ONE_GLASS_ML = 250
const ONE_GLASS_FL_OZ = 8

export function oneGlassWaterMl(unit: WaterUnit): number {
  return unit === "fl oz" ? Math.round(flOzToMl(ONE_GLASS_FL_OZ)) : ONE_GLASS_ML
}

/**
 * A quick-add chip row: the millilitre sizes, or the round ounce sizes they
 * stand in for. Always returns millilitres, ready to log.
 */
export function waterPoursMl(
  unit: WaterUnit,
  metricMl: readonly number[],
  imperialFlOz: readonly number[]
): number[] {
  if (unit !== "fl oz") return [...metricMl]
  return imperialFlOz.map((flOz) => Math.round(flOzToMl(flOz)))
}
const RECENT_WATER_AMOUNTS_KEY = "onerep:recent-water-amounts:v1"
const MAX_RECENT_WATER_AMOUNTS = 5

export function fmtMl(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
}

export function validateCustomWaterAmount(value: string): {
  amountMl: number | null
  error: string | null
} {
  const trimmed = value.trim()
  if (!trimmed) return { amountMl: null, error: "Enter an amount in ml." }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return { amountMl: null, error: "Use numbers only." }
  }

  const amountMl = Math.round(parsed)
  if (amountMl < CUSTOM_WATER_MIN_ML) {
    return {
      amountMl: null,
      error: `Use at least ${CUSTOM_WATER_MIN_ML} ml.`,
    }
  }
  if (amountMl > CUSTOM_WATER_MAX_ML) {
    return {
      amountMl: null,
      error: `Use ${fmtMl(CUSTOM_WATER_MAX_ML)} or less for one entry.`,
    }
  }

  return { amountMl, error: null }
}

export function normalizeRecentWaterAmounts(values: unknown): number[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<number>()
  const normalized: number[] = []

  for (const value of values) {
    const amount = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(amount)) continue

    const rounded = Math.round(amount)
    if (
      rounded < CUSTOM_WATER_MIN_ML ||
      rounded > CUSTOM_WATER_MAX_ML ||
      seen.has(rounded)
    ) {
      continue
    }

    seen.add(rounded)
    normalized.push(rounded)
    if (normalized.length >= MAX_RECENT_WATER_AMOUNTS) break
  }

  return normalized
}

export function nextRecentWaterAmounts(current: number[], amountMl: number) {
  return normalizeRecentWaterAmounts([
    amountMl,
    ...current.filter((amount) => Math.round(amount) !== Math.round(amountMl)),
  ])
}

export function visibleRecentWaterAmounts(
  recentAmounts: number[],
  hiddenAmounts: number[]
) {
  const hidden = new Set(hiddenAmounts.map((amount) => Math.round(amount)))
  return normalizeRecentWaterAmounts(recentAmounts).filter(
    (amount) => !hidden.has(amount)
  )
}

export function readRecentWaterAmounts(storage = browserLocalStorage()) {
  if (!storage) return []

  try {
    const raw = storage.getItem(RECENT_WATER_AMOUNTS_KEY)
    if (!raw) return []
    return normalizeRecentWaterAmounts(JSON.parse(raw))
  } catch {
    return []
  }
}

export function writeRecentWaterAmounts(
  amounts: number[],
  storage = browserLocalStorage()
) {
  if (!storage) return

  const normalized = normalizeRecentWaterAmounts(amounts)
  try {
    if (normalized.length === 0) {
      storage.removeItem(RECENT_WATER_AMOUNTS_KEY)
      return
    }

    storage.setItem(RECENT_WATER_AMOUNTS_KEY, JSON.stringify(normalized))
  } catch {
    // Recent water amounts are convenience data only.
  }
}

export function rememberRecentWaterAmount(
  amountMl: number,
  storage = browserLocalStorage()
) {
  const next = nextRecentWaterAmounts(readRecentWaterAmounts(storage), amountMl)
  writeRecentWaterAmounts(next, storage)
  return next
}

export function clearRecentWaterAmounts(storage = browserLocalStorage()) {
  try {
    storage?.removeItem(RECENT_WATER_AMOUNTS_KEY)
  } catch {
    // Recent water amounts are convenience data only.
  }
}
