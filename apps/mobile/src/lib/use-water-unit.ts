import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

export type WaterUnit = "ml" | "fl oz"

type WaterUnitListener = () => void

const WATER_UNIT_KEY = "onerep:water-unit"
const WATER_UNIT_EXPLICIT_KEY = "onerep:water-unit-explicit"
const listeners = new Set<WaterUnitListener>()
let activeAccountKey: string | null = null
let cachedUnit: WaterUnit | null = null
const optimisticUnits = new Map<string, WaterUnit>()

function scopedKey(key: string, accountKey = activeAccountKey) {
  return accountKey ? `${key}:${accountKey}` : `${key}:unscoped`
}

function notifyWaterUnitChanged() {
  for (const listener of listeners) listener()
}

/** Selects the account namespace used by non-reactive water formatters. */
export function setActiveWaterAccount(accountKey: string | null) {
  if (activeAccountKey === accountKey) return
  activeAccountKey = accountKey
  cachedUnit = null
  notifyWaterUnitChanged()
}

export function subscribeWaterUnit(listener: WaterUnitListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readCachedWaterUnit(accountKey = activeAccountKey): WaterUnit {
  const stored = safeLocalStorageGet(scopedKey(WATER_UNIT_KEY, accountKey))
  if (stored === "fl oz") return "fl oz"
  if (stored === "ml") return "ml"
  // Existing installs have no scoped key yet. Preserve the account's old
  // measurement-system default instead of making imperial users briefly see ml.
  return safeLocalStorageGet("onerep:measurement-system") === "imperial"
    ? "fl oz"
    : "ml"
}

export function waterUnitIsExplicit(accountKey = activeAccountKey): boolean {
  return safeLocalStorageGet(scopedKey(WATER_UNIT_EXPLICIT_KEY, accountKey)) === "1"
}

export function cacheWaterUnit(
  unit: WaterUnit,
  explicit = false,
  accountKey = activeAccountKey,
  optimistic = false
) {
  safeLocalStorageSet(scopedKey(WATER_UNIT_KEY, accountKey), unit)
  if (explicit) {
    safeLocalStorageSet(scopedKey(WATER_UNIT_EXPLICIT_KEY, accountKey), "1")
  }
  const namespace = accountKey ?? "unscoped"
  if (optimistic) optimisticUnits.set(namespace, unit)
  else if (optimisticUnits.get(namespace) === unit) optimisticUnits.delete(namespace)
  cachedUnit = unit
  notifyWaterUnitChanged()
}

export function clearExplicitWaterUnit(accountKey = activeAccountKey) {
  safeLocalStorageSet(scopedKey(WATER_UNIT_EXPLICIT_KEY, accountKey), "0")
  notifyWaterUnitChanged()
}

/** Reverts a pending offline choice when its server mutation fails. */
export function clearOptimisticWaterUnit(accountKey = activeAccountKey) {
  optimisticUnits.delete(accountKey ?? "unscoped")
  notifyWaterUnitChanged()
}

/**
 * One cached read for non-component callers (entry-name builders and drawer
 * helpers). Components use `useWaterUnit` so a server or cache change rerenders.
 */
export function currentWaterUnit(): WaterUnit {
  if (cachedUnit === null) cachedUnit = readCachedWaterUnit()
  return cachedUnit
}

/**
 * How water is shown: milliliters or fluid ounces. The cache is scoped to the
 * active preferences record, so a second account on the same phone cannot
 * inherit the first account's explicit choice.
 */
export function useWaterUnit(): WaterUnit {
  const preferences = useQuery(api.users.users.getPreferences)
  const accountKey = preferences?._id ?? null
  const stored = preferences?.waterUnit
  const known: WaterUnit | null =
    stored === "fl oz" || stored === "ml" ? stored : null
  const namespace = accountKey ?? "unscoped"
  const [cached, setCached] = useState(() => readCachedWaterUnit(accountKey))

  useEffect(() => {
    setActiveWaterAccount(accountKey)
    setCached(readCachedWaterUnit(accountKey))
    if (known) {
      const optimistic = optimisticUnits.get(namespace)
      if (optimistic === known) optimisticUnits.delete(namespace)
      if (!optimisticUnits.has(namespace)) cacheWaterUnit(known, true, accountKey)
    }
  }, [accountKey, known])

  useEffect(() => {
    const unsubscribe = subscribeWaterUnit(() =>
      setCached(readCachedWaterUnit(accountKey))
    )
    return () => {
      unsubscribe()
    }
  }, [accountKey])

  return optimisticUnits.get(namespace) ?? known ?? cached
}
