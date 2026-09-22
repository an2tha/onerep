import { useEffect, useState } from "react"
import { currentDateKey } from "./food-log"
import { useConvexAuth, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
export function useRecovery() {
  const { isAuthenticated } = useConvexAuth()
  return useQuery(api.recovery.get, isAuthenticated ? {} : "skip")
}

/** Match the diary/server timezone, and refresh after midnight or returning to the app. */
export function useRecoveryToday() {
  const { isAuthenticated } = useConvexAuth()
  const preferences = useQuery(
    api.users.users.getPreferences,
    isAuthenticated ? {} : "skip"
  )
  const [, tick] = useState(0)
  useEffect(() => {
    const refresh = () => tick((value) => value + 1)
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  return currentDateKey(preferences?.lastActiveTimezone ?? "UTC")
}
