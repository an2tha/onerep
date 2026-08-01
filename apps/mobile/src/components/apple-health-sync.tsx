import { useCallback, useEffect, useRef } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import {
  getRecentAppleHealthWorkouts,
  isAppleHealthSupportedPlatform,
  requestAppleHealthAuthorization,
} from "@/lib/apple-health"
import {
  APPLE_HEALTH_SYNC_DAYS_BACK,
  APPLE_HEALTH_SYNC_LIMIT,
  appleHealthWorkoutToImport,
  shouldSyncAppleHealth,
} from "@/lib/apple-health-sync"
import { logDevWarn } from "@/lib/utils"

/**
 * Pulls HealthKit workouts into Convex when the app comes to the foreground.
 *
 * Uses `visibilitychange` rather than `@capacitor/app`: that package is not a
 * dependency, and `visibilitychange` is already the app's foreground signal.
 *
 * Deliberately a plain `useMutation`, not `useOfflineMutation` — queuing a
 * HealthKit batch offline is pointless (the next foreground sync re-reads the
 * same data from HealthKit) and would bloat localStorage.
 */
export function AppleHealthSync() {
  const { user } = useAppAuth()
  const preferences = useQuery(
    api.users.users.getPreferences,
    user ? {} : "skip"
  )
  const onboarding = useQuery(api.users.onboarding.get, user ? {} : "skip")
  const importWorkouts = useMutation(
    api.logs.healthWorkouts.importFromAppleHealth
  )
  const recordSyncError = useMutation(api.logs.healthWorkouts.recordSyncError)
  const runningRef = useRef(false)

  const timeZone = preferences?.lastActiveTimezone || "UTC"
  const consentGranted =
    (onboarding as { consent?: { wearableIntegrations?: boolean } } | null)
      ?.consent?.wearableIntegrations === true
  const healthSync = preferences?.healthSync

  const sync = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      const authorization = await requestAppleHealthAuthorization()
      if (!authorization.available || !authorization.granted) return

      const workouts = await getRecentAppleHealthWorkouts({
        daysBack: APPLE_HEALTH_SYNC_DAYS_BACK,
        limit: APPLE_HEALTH_SYNC_LIMIT,
      })
      if (workouts.length === 0) return

      await importWorkouts({
        workouts: workouts.map((workout) =>
          appleHealthWorkoutToImport(workout, timeZone)
        ),
      })
    } catch (error) {
      // A background sync must never interrupt. The failure is surfaced in
      // Settings instead of a toast.
      logDevWarn("Apple Health sync failed", error)
      const message = error instanceof Error ? error.message : "Sync failed"
      await recordSyncError({ message }).catch(() => {})
    } finally {
      runningRef.current = false
    }
  }, [importWorkouts, recordSyncError, timeZone])

  useEffect(() => {
    if (!user || preferences === undefined || onboarding === undefined) return

    function maybeSync() {
      if (typeof document !== "undefined" && document.hidden) return
      if (
        !shouldSyncAppleHealth({
          supported: isAppleHealthSupportedPlatform(),
          consentGranted,
          enabled: healthSync?.appleHealthEnabled ?? false,
          autoSync: healthSync?.autoSyncOnForeground ?? true,
          lastSyncedAt: healthSync?.lastSyncedAt,
          now: Date.now(),
        })
      ) {
        return
      }
      void sync()
    }

    maybeSync()
    document.addEventListener("visibilitychange", maybeSync)
    return () => document.removeEventListener("visibilitychange", maybeSync)
  }, [
    user,
    preferences,
    onboarding,
    consentGranted,
    healthSync?.appleHealthEnabled,
    healthSync?.autoSyncOnForeground,
    healthSync?.lastSyncedAt,
    sync,
  ])

  return null
}
