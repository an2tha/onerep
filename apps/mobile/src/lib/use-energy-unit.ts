import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/utils"

/** Stored on the account. The UI renders "Cal" as lowercase "cal". */
export type EnergyUnitStored = "kcal" | "Cal" | "kJ"
/** What screens render, and what `energyDisplay` accepts. */
export type EnergyUnit = "kcal" | "cal" | "kJ"

const ENERGY_UNIT_KEY = "onerep:energy-unit"

/**
 * How food energy is shown: "kcal", "Cal", or "kJ".
 *
 * kcal and Cal are the same number under two spellings — a food Calorie is a
 * kilocalorie. kJ is a real conversion (×4.184), applied at display time
 * only; everything stored and computed stays kcal. Convert with
 * `energyDisplay` from @repo/ui.
 *
 * Cached on-device like the weight unit, so the unit doesn't flip while the
 * preferences query loads.
 */
export function readCachedEnergyUnit(): EnergyUnit {
  const stored = safeLocalStorageGet(ENERGY_UNIT_KEY)
  if (stored === "Cal") return "cal"
  return stored === "kJ" ? "kJ" : "kcal"
}

/** The stored form, for the settings control that writes it back. */
export function readCachedEnergyUnitStored(): EnergyUnitStored {
  const stored = safeLocalStorageGet(ENERGY_UNIT_KEY)
  return stored === "Cal" || stored === "kJ" ? stored : "kcal"
}

export function cacheEnergyUnit(unit: EnergyUnitStored) {
  safeLocalStorageSet(ENERGY_UNIT_KEY, unit)
}

export function useEnergyUnit(): EnergyUnit {
  const preferences = useQuery(api.users.users.getPreferences)
  const stored = preferences?.energyUnit
  const known: EnergyUnit | null =
    stored === "Cal"
      ? "cal"
      : stored === "kcal" || stored === "kJ"
        ? stored
        : null
  // Read once: localStorage during render is fine, but re-reading on every
  // render of every screen is not.
  const [cached] = useState(readCachedEnergyUnit)

  useEffect(() => {
    if (known) cacheEnergyUnit(known === "cal" ? "Cal" : known)
  }, [known])

  return known ?? cached
}
