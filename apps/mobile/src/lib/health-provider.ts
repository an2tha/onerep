import { Capacitor, registerPlugin } from "@capacitor/core"

/**
 * The platform health store, behind one interface.
 *
 * iOS talks to HealthKit through `AppleHealthPlugin.swift`; Android talks to
 * Health Connect through `HealthConnectPlugin.kt`. Both plugins deliberately
 * return the same 14-field workout shape so nothing above this module has to
 * know which platform it is on.
 */

export type HealthProvider = "apple_health" | "health_connect"

export type HealthWorkout = {
  uuid: string
  activityType: string
  activityName: string
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
 * Health Connect can be absent or outdated on a device, which HealthKit never
 * is. `providerStatus` is what lets Settings offer a Play Store link instead of
 * a toggle that cannot succeed.
 */
export type HealthProviderStatus =
  "available" | "update_required" | "unavailable"

export type HealthAvailability = {
  available: boolean
  platform: string
  authorizationStatus?: string
  providerStatus?: HealthProviderStatus
}

export type HealthAuthorization = {
  available: boolean
  granted: boolean
}

type HealthWorkoutQuery = {
  limit?: number
  daysBack?: number
}

/**
 * One local day of ambient signals.
 *
 * Every field is optional because every field is a different sensor with a
 * different failure mode. A phone with no paired watch reports steps and
 * nothing else, which is an ordinary row rather than a broken one.
 *
 * The named fields are the handful the app scores on and can therefore rely on
 * by name. The index signature carries the rest of the platform catalogue —
 * blood glucose, cadence, whatever a custom metric was bound to. The plugins
 * emit whichever keys the device actually holds, so enumerating them here would
 * be a second catalogue to keep in step with `platformHealthMetrics.ts`, and it
 * would go stale the first time either store adds a type.
 */
export type HealthDailyMetrics = {
  date: string
  [key: string]: number | string | undefined
  sleepMinutes?: number
  steps?: number
  restingHeartRateBpm?: number
  hrvMs?: number
  activeEnergyKcal?: number
  // Body readings ride the same daily payload; the server files them as
  // check-ins rather than recovery rows.
  weightKg?: number
  bodyFatPct?: number
  leanBodyMassKg?: number
  boneMassKg?: number
  basalMetabolicRateKcal?: number
}

type HealthPlugin = {
  isAvailable(): Promise<HealthAvailability>
  requestAuthorization(): Promise<HealthAuthorization>
  getRecentWorkouts(
    options?: HealthWorkoutQuery
  ): Promise<{ workouts: HealthWorkout[] }>
  getDailyMetrics?(options?: {
    /**
     * Which catalogue keys to read. Omitted means everything the plugin
     * supports, which is what an older shell running newer JS will do.
     */
    metrics?: string[]
    daysBack?: number
  }): Promise<{ days: HealthDailyMetrics[] }>
  saveWorkout(options: {
    startedAt: number
    endedAt: number
    title: string
  }): Promise<{ saved: boolean }>
  saveDailyMetric?(options: {
    metric: string
    date: string
    value: number
  }): Promise<{ saved: boolean }>
  openHealthSettings?(): Promise<void>
  openProviderListing?(): Promise<void>
}

const appleHealth = registerPlugin<HealthPlugin>("AppleHealth")
const healthConnect = registerPlugin<HealthPlugin>("HealthConnect")

/** Which store this platform uses, or null on web. */
export function healthProvider(): HealthProvider | null {
  if (!Capacitor.isNativePlatform()) return null
  const platform = Capacitor.getPlatform()
  if (platform === "ios") return "apple_health"
  if (platform === "android") return "health_connect"
  return null
}

export function isHealthSyncSupportedPlatform() {
  return healthProvider() !== null
}

/** User-facing name of the store; every Settings string routes through this. */
export function healthProviderLabel(
  provider: HealthProvider | null = healthProvider()
): string {
  if (provider === "health_connect") return "Health Connect"
  return "Apple Health"
}

function plugin(): HealthPlugin | null {
  const provider = healthProvider()
  if (provider === "apple_health") return appleHealth
  if (provider === "health_connect") return healthConnect
  return null
}

export async function getHealthAvailability(): Promise<HealthAvailability> {
  const active = plugin()
  if (!active) {
    return { available: false, platform: Capacitor.getPlatform() }
  }
  return active.isAvailable()
}

export async function requestHealthAuthorization(): Promise<HealthAuthorization> {
  const active = plugin()
  if (!active) return { available: false, granted: false }
  return active.requestAuthorization()
}

export async function getRecentHealthWorkouts(
  options: HealthWorkoutQuery = {}
): Promise<HealthWorkout[]> {
  const active = plugin()
  if (!active) return []
  const { workouts } = await active.getRecentWorkouts({
    daysBack: options.daysBack ?? 30,
    limit: options.limit ?? 12,
  })
  return workouts
}

/**
 * Daily recovery signals, oldest first.
 *
 * Optional on the plugin interface so a device running an app build older than
 * the native one degrades to no recovery data rather than a crash — the OTA
 * channel ships JS without the native layer, so that skew is routine here
 * rather than theoretical.
 */
export async function getHealthDailyMetrics(
  options: { daysBack?: number; metrics?: string[] } = {}
): Promise<HealthDailyMetrics[]> {
  const active = plugin()
  if (!active?.getDailyMetrics) return []
  try {
    const { days } = await active.getDailyMetrics({
      daysBack: options.daysBack ?? 30,
      ...(options.metrics ? { metrics: options.metrics } : {}),
    })
    return Array.isArray(days) ? days : []
  } catch {
    // A permission the user declined on one signal must not lose the others.
    return []
  }
}

/**
 * Writes a finished OneRep session back to the health store.
 *
 * Opt-in on both platforms — callers must check the user's preference first.
 * Resolves `{ saved: false }` rather than throwing when write permission was
 * never granted, because a declined health write must not fail a workout save.
 */
export async function saveWorkoutToHealth(options: {
  startedAt: number
  endedAt: number
  title: string
}): Promise<{ saved: boolean }> {
  const active = plugin()
  if (!active) return { saved: false }
  try {
    return await active.saveWorkout(options)
  } catch {
    return { saved: false }
  }
}

/**
 * Pushes a corrected reading back to the health store.
 *
 * Per-edit and optional: the correction has already been saved in OneRep by the
 * time this runs, so a refusal here is a shrug rather than a failure. Optional
 * on the plugin interface for the same reason `getDailyMetrics` is — the OTA
 * channel ships JS ahead of the native layer routinely.
 *
 * Neither store lets an app amend a sample another app wrote, so this adds our
 * number next to the original rather than replacing it, and Health will show
 * two readings for that day. That is the platforms' answer, not ours.
 */
export async function saveHealthDailyMetric(options: {
  metric: string
  date: string
  value: number
}): Promise<{ saved: boolean }> {
  const active = plugin()
  if (!active?.saveDailyMetric) return { saved: false }
  try {
    return await active.saveDailyMetric(options)
  } catch {
    return { saved: false }
  }
}

/**
 * Android only. Health Connect has no programmatic revoke, so the user has to
 * be sent to the Health Connect app to change or withdraw permissions.
 */
export function supportsHealthSettingsDeepLink() {
  return healthProvider() === "health_connect"
}

export async function openHealthSettings() {
  if (!supportsHealthSettingsDeepLink()) return
  await healthConnect.openHealthSettings?.()
}

/**
 * Android only. Health Connect is a separately-installed app before Android 14,
 * so "not available" is a recoverable state rather than a dead end.
 */
export async function openHealthProviderListing() {
  if (healthProvider() !== "health_connect") return
  await healthConnect.openProviderListing?.()
}
