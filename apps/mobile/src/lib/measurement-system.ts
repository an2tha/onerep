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

export type MeasurementSystem = "metric" | "imperial"

const MEASUREMENT_SYSTEM_KEY = "onerep:measurement-system"

export function readMeasurementSystem(): MeasurementSystem {
  return safeLocalStorageGet(MEASUREMENT_SYSTEM_KEY) === "imperial"
    ? "imperial"
    : "metric"
}

export function writeMeasurementSystem(system: MeasurementSystem) {
  safeLocalStorageSet(MEASUREMENT_SYSTEM_KEY, system)
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
}

/** The cardio distance unit new workouts should start in. */
export function distanceUnitForSystem(system: MeasurementSystem): "km" | "mi" {
  return system === "imperial" ? "mi" : "km"
}

/** The water goal's display unit for the system. */
export function waterUnitForSystem(system: MeasurementSystem): "ml" | "fl oz" {
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
 * Formats a stored ml amount for display in the system's unit. Storage is
 * always ml; only this render step converts, so goals, chips, and history
 * keep one canonical number underneath.
 */
export function formatWater(
  ml: number,
  system: MeasurementSystem
): string {
  if (system === "imperial") {
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
