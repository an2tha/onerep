import { createContext, useContext, type ReactNode } from "react"

// The router renders an outgoing outlet a second time for its exit animation.
// That copy is presentation only; session owners must not mount inside it.
export const RouteActivityContext = createContext(true)

export function ActiveRouteOnly({ children }: { children: ReactNode }) {
  const active = useContext(RouteActivityContext)
  return active ? children : null
}
