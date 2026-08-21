import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppVersionReport } from "@/lib/use-app-version-report"

/**
 * Registers the running build against the signed-in account.
 *
 * Mounted beside the other sync bridges. Gated on a resolved user because an
 * anonymous launch has nothing to attach a version to.
 */
export function AppVersionReport() {
  const user = useQuery(api.users.users.getCurrentUser)
  useAppVersionReport(Boolean(user))
  return null
}
