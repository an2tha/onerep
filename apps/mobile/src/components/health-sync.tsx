import { useCallback, useEffect, useRef } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import {
  getHealthDailyMetrics,
  getRecentHealthWorkouts,
  healthProvider,
  healthProviderLabel,
  isHealthSyncSupportedPlatform,
  requestHealthAuthorization,
} from "@/lib/health-provider"
import {
  HEALTH_METRICS_DAYS_BACK,
  HEALTH_SYNC_DAYS_BACK,
  HEALTH_SYNC_LIMIT,
  healthWorkoutToImport,
  shouldSyncHealth,
} from "@/lib/health-sync"
import { logDevWarn } from "@/lib/utils"

/**
 * Pulls platform health workouts into Convex when the app comes to the
 * foreground — HealthKit on iOS, Health Connect on Android.
 *
 * Uses `visibilitychange` rather than `@capacitor/app`'s resume event because
 * it is already the app's foreground signal and covers the web too. This also
 * covers the Android permission flow, which hands control to the Health Connect
 * activity and therefore fires a visibility change on return; `runningRef`
 * keeps that from re-entering mid-request.
 *
 * Deliberately a plain `useMutation`, not `useOfflineMutation` — queuing a
 * health batch offline is pointless (the next foreground sync re-reads the same
 * data from the store) and would bloat localStorage.
 */
export function HealthSync() {
  const { user } = useAppAuth()
  const preferences = useQuery(
    api.users.users.getPreferences,
    user ? {} : "skip"
  )
  const onboarding = useQuery(api.users.onboarding.get, user ? {} : "skip")
  const importWorkouts = useMutation(
    api.logs.healthWorkouts.importHealthWorkouts
  )
  const recordSyncError = useMutation(api.logs.healthWorkouts.recordSyncError)
  const syncMetrics = useMutation(api.logs.healthMetrics.sync)
  const runningRef = useRef(false)

  const timeZone = preferences?.lastActiveTimezone || "UTC"
  const consentGranted =
    (onboarding as { consent?: { wearableIntegrations?: boolean } } | null)
      ?.consent?.wearableIntegrations === true
  const healthSync = preferences?.healthSync
  // healthSyncEnabled is canonical; appleHealthEnabled is the legacy name still
  // dual-written server-side until the backfill runs.
  const healthSyncEnabled =
    healthSync?.healthSyncEnabled ?? healthSync?.appleHealthEnabled ?? false

  const sync = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      const authorization = await requestHealthAuthorization()
      if (!authorization.available || !authorization.granted) return

      const provider = healthProvider()
      if (!provider) return

      const [workouts, days] = await Promise.all([
        getRecentHealthWorkouts({
          daysBack: HEALTH_SYNC_DAYS_BACK,
          limit: HEALTH_SYNC_LIMIT,
        }),
        // Recovery baselines need a month to mean anything, and unlike
        // workouts these rows are upserted per day — re-reading the same
        // fortnight every sync is the intended behaviour, not waste. A watch
        // writes last night's sleep hours after the fact.
        getHealthDailyMetrics({ daysBack: HEALTH_METRICS_DAYS_BACK }),
      ])

      if (days.length > 0) {
        await syncMetrics({ provider, days })
      }

      if (workouts.length === 0) return

      await importWorkouts({
        provider,
        workouts: workouts.map((workout) =>
          healthWorkoutToImport(workout, timeZone)
        ),
      })
    } catch (error) {
      // A background sync must never interrupt. The failure is surfaced in
      // Settings instead of a toast.
      logDevWarn(`${healthProviderLabel()} sync failed`, error)
      const message = error instanceof Error ? error.message : "Sync failed"
      await recordSyncError({ message }).catch(() => {})
    } finally {
      runningRef.current = false
    }
  }, [importWorkouts, recordSyncError, syncMetrics, timeZone])

  useEffect(() => {
    if (!user || preferences === undefined || onboarding === undefined) return

    function maybeSync() {
      if (typeof document !== "undefined" && document.hidden) return
      if (
        !shouldSyncHealth({
          supported: isHealthSyncSupportedPlatform(),
          consentGranted,
          enabled: healthSyncEnabled ?? false,
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
    healthSyncEnabled,
    healthSync?.autoSyncOnForeground,
    healthSync?.lastSyncedAt,
    sync,
  ])

  return null
}
