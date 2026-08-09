import { currentDateKey } from "@/lib/food-log"
import type { HealthWorkout } from "@/lib/health-provider"

/**
 * How stale a sync may get before a foreground event triggers another.
 *
 * Health data does not change often enough to justify a pull on every
 * app open, and each pull is a permission-gated native round trip.
 */
export const HEALTH_SYNC_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

/** How far back each pull reaches, and how many workouts it takes. */
export const HEALTH_SYNC_DAYS_BACK = 30
export const HEALTH_SYNC_LIMIT = 50

/**
 * How far back the recovery pull reaches.
 *
 * Longer than the workout window because a baseline needs a month to mean
 * anything, and cheaper than it looks: the rows are upserted per local day, so
 * re-reading the same fortnight is idempotent. That repetition is the point —
 * a watch writes last night's sleep several hours after the fact, so the first
 * read of any given day is usually the incomplete one.
 */
export const HEALTH_METRICS_DAYS_BACK = 35

export type HealthSyncState = {
  supported: boolean
  consentGranted: boolean
  enabled: boolean
  autoSync: boolean
  lastSyncedAt?: number
  now: number
}

/**
 * Whether a foreground event should trigger a pull.
 *
 * Pure so the gating rules are testable without a device.
 */
export function shouldSyncHealth(state: HealthSyncState): boolean {
  if (!state.supported) return false
  if (!state.consentGranted) return false
  if (!state.enabled) return false
  if (!state.autoSync) return false
  if (state.lastSyncedAt === undefined) return true
  return state.now - state.lastSyncedAt >= HEALTH_SYNC_MIN_INTERVAL_MS
}

export type HealthImportPayload = {
  uuid: string
  activityType: string
  activityName: string
  date: string
  startedAt: string
  endedAt: string
  durationSeconds: number
  totalDistanceMeters?: number
  avgHeartRateBpm?: number
  maxHeartRateBpm?: number
  activeEnergyKcal?: number
  sourceName?: string
  sourceBundleId?: string
  hasRoute?: boolean
  routeName?: string
}

/**
 * Maps a platform health workout onto the import payload.
 *
 * `date` is the user's **local** calendar date at the workout's start, not the
 * UTC date: a session finished at 9pm local on the 3rd is already the 4th in
 * UTC, and would otherwise land on the wrong day in the training log.
 */
export function healthWorkoutToImport(
  workout: HealthWorkout,
  timeZone: string
): HealthImportPayload {
  return {
    uuid: workout.uuid,
    activityType: workout.activityType,
    activityName: workout.activityName,
    date: currentDateKey(timeZone, new Date(workout.startedAt)),
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSeconds: workout.durationSeconds,
    ...(workout.totalDistanceMeters !== undefined
      ? { totalDistanceMeters: workout.totalDistanceMeters }
      : {}),
    ...(workout.avgHeartRateBpm !== undefined
      ? { avgHeartRateBpm: workout.avgHeartRateBpm }
      : {}),
    ...(workout.maxHeartRateBpm !== undefined
      ? { maxHeartRateBpm: workout.maxHeartRateBpm }
      : {}),
    ...(workout.activeEnergyKcal !== undefined
      ? { activeEnergyKcal: workout.activeEnergyKcal }
      : {}),
    ...(workout.sourceName ? { sourceName: workout.sourceName } : {}),
    ...(workout.sourceBundleId
      ? { sourceBundleId: workout.sourceBundleId }
      : {}),
    ...(workout.hasRoute !== undefined ? { hasRoute: workout.hasRoute } : {}),
    ...(workout.routeName ? { routeName: workout.routeName } : {}),
  }
}
