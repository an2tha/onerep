import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

export type WaterUnit = "ml" | "fl oz"

const WATER_UNIT_KEY = "onerep:water-unit"
// Marks that the user actually picked a unit in Settings (or the account
// carries one), as opposed to the cache merely being seeded by the
// measurement system. The system switch must not stomp an explicit choice
// when it re-derives defaults.
const WATER_UNIT_EXPLICIT_KEY = "onerep:water-unit-explicit"

export function readCachedWaterUnit(): WaterUnit {
  return safeLocalStorageGet(WATER_UNIT_KEY) === "fl oz" ? "fl oz" : "ml"
}

export function waterUnitIsExplicit(): boolean {
  return safeLocalStorageGet(WATER_UNIT_EXPLICIT_KEY) === "1"
}

export function cacheWaterUnit(unit: WaterUnit, explicit = false) {
  safeLocalStorageSet(WATER_UNIT_KEY, unit)
  if (explicit) safeLocalStorageSet(WATER_UNIT_EXPLICIT_KEY, "1")
  cachedUnit = unit
}

export function clearExplicitWaterUnit() {
  safeLocalStorageSet(WATER_UNIT_EXPLICIT_KEY, "0")
}

/**
 * One cached read for every non-component caller (entry-name builders,
 * drawer helpers): re-reading localStorage per formatted number is not
 * free, and the write path above keeps the cache honest. Components use
 * the `useWaterUnit` hook instead so a unit change re-renders.
 */
let cachedUnit: WaterUnit | null = null

export function currentWaterUnit(): WaterUnit {
  if (cachedUnit === null) cachedUnit = readCachedWaterUnit()
  return cachedUnit
}

/**
 * How water is shown: milliliters or fluid ounces — its own choice, not an
 * implication of the measurement system. A kg user can still think in 8-fl-oz
 * glasses, and a lbs user may have a bottle graduated in ml. Storage stays ml
 * end-to-end; only rendering and input convert.
 *
 * Cached on-device like the weight and energy units, so the unit doesn't flip
 * while the preferences query loads. Until the account has an explicit
 * server-side choice, the cached answer follows the measurement system's
 * default (the system switch writes this cache), so the two stay in step
 * without re-deriving on every render.
 */
export function useWaterUnit(): WaterUnit {
  const preferences = useQuery(api.users.users.getPreferences)
  const stored = preferences?.waterUnit
  const known: WaterUnit | null =
    stored === "fl oz" || stored === "ml" ? stored : null
  // Read once: localStorage during render is fine, but re-reading on every
  // render of every screen is not.
  const [cached] = useState(readCachedWaterUnit)

  useEffect(() => {
    // A server-side choice is an explicit choice: cache it and mark it so
    // the measurement system's default-derivation leaves it alone.
    if (known) cacheWaterUnit(known, true)
  }, [known])

  return known ?? cached
}
