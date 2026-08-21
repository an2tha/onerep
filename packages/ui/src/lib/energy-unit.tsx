import { createContext, useContext, type ReactNode } from "react"

export type EnergyUnitLabel = "kcal" | "Cal"

// Label only — a food Calorie is a kilocalorie, so no value ever converts.
// The app provides the user's preferred spelling once at the root; components
// in this package read it instead of hardcoding "kcal".
const EnergyUnitContext = createContext<EnergyUnitLabel>("kcal")

export function EnergyUnitProvider({
  unit,
  children,
}: {
  unit: EnergyUnitLabel
  children: ReactNode
}) {
  return (
    <EnergyUnitContext.Provider value={unit}>
      {children}
    </EnergyUnitContext.Provider>
  )
}

export function useEnergyUnitLabel(): EnergyUnitLabel {
  return useContext(EnergyUnitContext)
}
