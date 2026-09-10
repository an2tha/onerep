/**
 * The app-wide measurement system: metric or imperial ("US").
 *
 * One switch that answers every unit question coherently, instead of each
 * screen guessing. The individual settings (weight unit, energy unit) remain
 * — this sets them all at once, and makes the *defaults* agree:
 *
 *   metric    → kg, kcal, km, water in ml / L
 *   imperial  → lb, Cal, mi, water in fl oz
 *
 * Device-local on purpose: it drives *defaults*, and the server-synced
 * individual units stay authoritative for what they own (the same way the
 * weight-unit cache works). Switching the system writes the individual
 * preferences through where a setter is available, so the choice follows the
 * account; the cached copy answers instantly on the next launch.
 */

import { safeLocalStorageGet, safeLocalStorageSet } from "./utils"
import { cacheEnergyUnit } from "./use-energy-unit"
import { cacheWeightUnit } from "./use-weight-unit"
import {
  cacheWaterUnit,
  waterUnitIsExplicit,
  type WaterUnit,
} from "./use-water-unit"

export type { WaterUnit } from "./use-water-unit"
import { formatSnapGrams } from "./food-snap-review"

export type MeasurementSystem = "metric" | "imperial"

const MEASUREMENT_SYSTEM_KEY = "onerep:measurement-system"

export function readMeasurementSystem(): MeasurementSystem {
  return safeLocalStorageGet(MEASUREMENT_SYSTEM_KEY) === "imperial"
    ? "imperial"
    : "metric"
}

export function writeMeasurementSystem(system: MeasurementSystem) {
  safeLocalStorageSet(MEASUREMENT_SYSTEM_KEY, system)
  cachedSystem = system
}

/**
 * One cached read for every non-component caller (formatters, event
 * handlers, entry builders): re-reading localStorage per formatted number
 * is not free, and the write path above keeps the cache honest.
 */
let cachedSystem: MeasurementSystem | null = null

/** Non-reactive read for non-component code (pure helpers, event handlers). */
export function currentMeasurementSystem(): MeasurementSystem {
  if (cachedSystem === null) cachedSystem = readMeasurementSystem()
  return cachedSystem
}

/**
 * Everything the switch implies at once. Weight and energy go through their
 * existing caches so every screen that reads them agrees immediately; the
 * Settings caller additionally persists them to the account.
 */
export function applyMeasurementSystem(system: MeasurementSystem) {
  writeMeasurementSystem(system)
  cacheWeightUnit(system === "imperial" ? "lbs" : "kg")
  // The cache stores the account's spelling ("Cal"), not the display form.
  cacheEnergyUnit(system === "imperial" ? "Cal" : "kcal")
  // Water follows the system only as a *default*: it keeps the cached unit
  // in step for anyone who has never picked one explicitly. An explicit
  // choice (Settings row, or an account that carries one) is never
  // overridden — flipping the master switch must not undo a deliberate
  // "imperial everything, but my bottle reads ml".
  if (!waterUnitIsExplicit()) {
    cacheWaterUnit(waterUnitForSystem(system))
  }
}

/** The cardio distance unit new workouts should start in. */
export function distanceUnitForSystem(system: MeasurementSystem): "km" | "mi" {
  return system === "imperial" ? "mi" : "km"
}

/** The water goal's display unit for a system — the *default*, not the law. */
export function waterUnitForSystem(system: MeasurementSystem): WaterUnit {
  return system === "imperial" ? "fl oz" : "ml"
}

/** 1 US fluid ounce = 29.5735 ml. Storage stays ml end-to-end. */
export const FL_OZ_ML = 29.5735

export function mlToFlOz(ml: number): number {
  return ml / FL_OZ_ML
}

export function flOzToMl(flOz: number): number {
  return flOz * FL_OZ_ML
}

/**
 * Formats a stored ml amount in the user's chosen water unit. Storage is
 * always ml; only this render step converts, so goals, chips, and history
 * keep one canonical number underneath. The unit is its own preference —
 * a metric household can still think in fl-oz glasses — so it is passed in
 * rather than derived from the measurement system.
 */
export function formatWater(ml: number, unit: WaterUnit): string {
  if (unit === "fl oz") {
    const flOz = mlToFlOz(ml)
    if (flOz >= 100) return `${Math.round(flOz)} fl oz`
    return `${Number(flOz.toFixed(1))} fl oz`
  }
  if (ml >= 1000) {
    const liters = ml / 1000
    return `${liters % 1 === 0 ? liters : liters.toFixed(1)} L`
  }
  return `${Math.round(ml)} ml`
}

/**
 * Formats a total/goal pair in ONE unit, so a day-rail row never mixes
 * magnitude systems. formatWater picks per-value (a 250 ml total reads "250
 * ml" while a 2000 ml goal reads "2 L"), which left the pair "0.25 / 500
 * ml" — a quarter milliliter, if you read it literally. The goal anchors
 * the choice: ml stays ml whenever the goal is sub-liter, fl oz is always
 * fl oz.
 */
export function formatWaterPair(
  totalMl: number,
  goalMl: number,
  unit: WaterUnit
): { total: string; goal: string } {
  if (unit === "fl oz") {
    return {
      total: `${Number(mlToFlOz(totalMl).toFixed(1))} fl oz`,
      goal: `${Number(mlToFlOz(goalMl).toFixed(1))} fl oz`,
    }
  }
  if (goalMl >= 1000) {
    const fmt = (ml: number) => {
      if (ml < 1000) return `${Math.round(ml)} ml`
      const liters = ml / 1000
      return `${liters % 1 === 0 ? liters : Number(liters.toFixed(2))} L`
    }
    return { total: fmt(totalMl), goal: fmt(goalMl) }
  }
  return {
    total: `${Math.round(totalMl)} ml`,
    goal: `${Math.round(goalMl)} ml`,
  }
}

/** 1 avoirdupois ounce = 28.3495 g. Food quantities stay grams underneath. */
export const G_PER_OZ = 28.3495

export function gramsToOz(grams: number): number {
  return grams / G_PER_OZ
}

export function ozToGrams(oz: number): number {
  return oz * G_PER_OZ
}

/**
 * A food quantity for display or typed input, in the system's unit.
 *
 * Metric keeps `formatSnapGrams`' exact trimming; imperial rounds to a tenth
 * of an ounce, which is the resolution kitchen scales in the US actually
 * show. Macros stay grams regardless — that is how US nutrition labels are
 * legally presented, so converting "Protein 4.4 g" to ounces would read as
 * wrong, not thorough.
 */
export function formatQuantityAmount(
  grams: number,
  system: MeasurementSystem
): string {
  if (system === "metric") return formatSnapGrams(grams)
  const oz = gramsToOz(grams)
  const rounded = Math.round(oz * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** The typed-in display unit for food quantities. */
export function quantityUnitForSystem(system: MeasurementSystem): "g" | "oz" {
  return system === "imperial" ? "oz" : "g"
}

/**
 * A logged entry's quantity tag — "150 g" or "5.3 oz" — for entry names and
 * history rows. The grams underneath never change; this is only the words.
 */
export function quantityLabel(
  grams: number,
  system: MeasurementSystem
): string {
  return `${formatQuantityAmount(grams, system)} ${quantityUnitForSystem(system)}`
}
