import { createContext, useContext, type ReactNode } from "react"

/** What gets stored on the account. */
export type EnergyUnitStored = "kcal" | "Cal" | "kJ"

/**
 * What gets rendered. "Cal" is shown lowercase because that is what a US
 * nutrition label trains people to read, whatever the SI pedantry says.
 */
export type EnergyUnitLabel = "kcal" | "cal" | "kJ"

export const KJ_PER_KCAL = 4.184

export function energyUnitLabel(unit: EnergyUnitStored): EnergyUnitLabel {
  return unit === "Cal" ? "cal" : unit
}

/**
 * A displayed energy number in the user's unit. Everything is stored and
 * computed in kcal; only kJ changes the figure (a food Calorie *is* a
 * kilocalorie). Rounding happens here so a converted value never shows
 * decimals a kcal value wouldn't.
 */
export function energyDisplay(
  kcal: number,
  unit: EnergyUnitStored | EnergyUnitLabel
): number {
  return unit === "kJ" ? Math.round(kcal * KJ_PER_KCAL) : Math.round(kcal)
}

// The app provides the user's preferred unit once at the root; components in
// this package read it instead of hardcoding "kcal".
const EnergyUnitContext = createContext<EnergyUnitLabel>("kcal")

export function EnergyUnitProvider({
  unit,
  children,
}: {
  unit: EnergyUnitStored | EnergyUnitLabel
  children: ReactNode
}) {
  return (
    <EnergyUnitContext.Provider
      value={unit === "Cal" ? "cal" : (unit as EnergyUnitLabel)}
    >
      {children}
    </EnergyUnitContext.Provider>
  )
}

export function useEnergyUnitLabel(): EnergyUnitLabel {
  return useContext(EnergyUnitContext)
}
