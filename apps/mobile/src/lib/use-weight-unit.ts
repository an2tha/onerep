import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"
import type { WeightUnit } from "@/lib/workout-logging"

const WEIGHT_UNIT_KEY = "onerep:weight-unit"

/**
 * The user's weight unit, with no flash of the wrong one.
 *
 * Every screen used to write `preferences?.weightUnit === "lbs" ? … : "kg"`
 * inline, which means that until the preferences query resolves — on every
 * navigation, and again on every reload — a pounds user is shown kilograms,
 * and then the number changes under them. Nothing was converted wrongly; the
 * app simply guessed metric before it knew, on each screen independently.
 *
 * So the last known unit is cached on the device and used as the opening
 * answer. It is correct from the second launch onward, and the server value
 * still wins the moment it lands.
 */
export function readCachedWeightUnit(): WeightUnit {
  return safeLocalStorageGet(WEIGHT_UNIT_KEY) === "lbs" ? "lbs" : "kg"
}

export function cacheWeightUnit(unit: WeightUnit) {
  safeLocalStorageSet(WEIGHT_UNIT_KEY, unit)
}

export function useWeightUnit(): WeightUnit {
  const preferences = useQuery(api.users.users.getPreferences)
  const stored = preferences?.weightUnit
  const known: WeightUnit | null =
    stored === "lbs" || stored === "kg" ? stored : null
  // Read once: localStorage during render is fine, but re-reading on every
  // render of every screen is not.
  const [cached] = useState(readCachedWeightUnit)

  useEffect(() => {
    if (known) cacheWeightUnit(known)
  }, [known])

  return known ?? cached
}
