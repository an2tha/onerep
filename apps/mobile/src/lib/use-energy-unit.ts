import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

export type EnergyUnit = "kcal" | "Cal"

const ENERGY_UNIT_KEY = "onerep:energy-unit"

/**
 * How food energy is labeled: "kcal" or "Cal".
 *
 * The number is identical either way — a food Calorie is a kilocalorie — but
 * a US label reader who sees "kcal" assumes there is math to do, and there
 * isn't. This is a labeling preference, never a conversion.
 *
 * Cached on-device like the weight unit, so the label doesn't flip between
 * spellings while the preferences query loads.
 */
export function readCachedEnergyUnit(): EnergyUnit {
  return safeLocalStorageGet(ENERGY_UNIT_KEY) === "Cal" ? "Cal" : "kcal"
}

export function cacheEnergyUnit(unit: EnergyUnit) {
  safeLocalStorageSet(ENERGY_UNIT_KEY, unit)
}

export function useEnergyUnit(): EnergyUnit {
  const preferences = useQuery(api.users.users.getPreferences)
  const stored = preferences?.energyUnit
  const known: EnergyUnit | null =
    stored === "Cal" || stored === "kcal" ? stored : null
  // Read once: localStorage during render is fine, but re-reading on every
  // render of every screen is not.
  const [cached] = useState(readCachedEnergyUnit)

  useEffect(() => {
    if (known) cacheEnergyUnit(known)
  }, [known])

  return known ?? cached
}
