import type { ReactNode } from "react"
import { useQuery } from "convex/react"
import { Navigate } from "react-router"
import { api } from "../../../../convex/_generated/api"

export function ExperimentalFeatureGuard({
  children,
}: {
  children: ReactNode
}) {
  const preferences = useQuery(api.users.users.getPreferences)

  if (preferences === undefined) return null
  if (!preferences?.experimentalFeaturesEnabled) {
    return <Navigate to="/" replace />
  }

  return children
}
