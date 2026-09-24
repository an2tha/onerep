import { createContext, useContext, type ReactNode } from "react"

// Presentation-only surfaces can suppress live session owners.
// Route exits use frozen DOM snapshots and never mount session owners.
export const RouteActivityContext = createContext(true)

export function ActiveRouteOnly({ children }: { children: ReactNode }) {
  const active = useContext(RouteActivityContext)
  return active ? children : null
}
