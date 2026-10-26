import { tr } from "@repo/ui/i18n"
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

/**
 * Why the store bounced a write, in the store's own terms.
 *
 * Every write in this file used to answer `{ saved: false }` and nothing else,
 * and the callers threw even that away — so "the app never wrote my food" and
 * "the app wrote it" looked identical from every screen. The reason is what
 * turns that silence into a sentence somebody can act on.
 */
export type HealthWriteFailure =
  /** The store holds read access but not write access for this record type. */
  | "no_permission"
  /** This platform has no record for the metric at all. */
  | "unsupported_metric"
  /** The store rejected the record: a bad date, an out-of-range number. */
  | "invalid_record"
  /** No health store on this device, or the provider is too old. */
  | "unavailable"
  | "unknown"

/**
 * The outcome of one write, including the store's own words when it refuses.
 *
 * `message` is diagnostic only — raw, not for display — and exists because the
 * plugins used to swallow the exception that explained the refusal.
 */
export type HealthWriteResult = {
  saved: boolean
  /**
   * How many records the store ended up holding for the write, when the native
   * side counted them. A nutrition day is one record on Health Connect and a
   * series of samples on HealthKit, so the count is about the store's own shape
   * and only ever drives how the journal describes the write.
   */
  written?: number
  reason?: HealthWriteFailure
  message?: string
}

export type HealthDeleteResult = {
  deleted: boolean
  reason?: HealthWriteFailure
  message?: string
}

/**
 * Whether the store will accept our writes.
 *
 * `unknown` is a real answer, not a placeholder: HealthKit deliberately never
 * reveals whether sharing was declined, so on iOS the read-back is the only
 * honest check. Treating it as granted would restore exactly the silence this
 * type exists to end.
 */
export type HealthWriteAccess = "granted" | "missing" | "unavailable" | "unknown"

/** One day's nutrition and hydration, written as a unit. */
export type HealthNutritionDayWrite = {
  date: string
  energyKcal?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  waterMl?: number
}

/**
 * Which meal a record belongs to, in the terms both stores understand.
 *
 * A closed set rather than the app's own meal ids, because the stores have a
 * closed set and nothing else: Health Connect takes breakfast, lunch, dinner,
 * snack or unknown, and HealthKit has no meal on a food entry at all. Whatever
 * the log calls a meal is mapped onto this by `healthStoreMeal`, so the two
 * vocabularies meet in exactly one tested place instead of in each plugin.
 */
export type HealthStoreMeal =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "unknown"

/**
 * One logged food, as the store receives it.
 *
 * This is the shape that makes a health record legible: a name, what it was
 * worth, and when it was eaten — rather than a day's totals under no name at
 * all. `id` travels as the record's own id, so a push can be told apart from a
 * re-push of the same meal.
 */
export type HealthNutritionItemWrite = {
  id: string
  name: string
  /** Local ISO datetime the item was logged at; absent means the day's start. */
  loggedAt?: string
  meal: HealthStoreMeal
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** A day's foods, plus its water, written together. */
export type HealthNutritionItemsWrite = {
  date: string
  items: HealthNutritionItemWrite[]
  waterMl?: number
}

type HealthWorkoutQuery = {
  limit?: number
  daysBack?: number
}

export type HealthWorkoutSave = {
  startedAt: number
  endedAt: number
  title: string
  sport?:
    "run" | "ride" | "swim" | "hike" | "walk" | "trail_run" | "row" | "strength"
  environment?: "outdoor" | "indoor"
  distanceMeters?: number
  activeEnergyKcal?: number
  heartRateSamples?: Array<{ timestamp: number; bpm: number }>
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

/**
 * One day of nutrition somebody else's app logged.
 *
 * `nutrients` is keyed by `platformHealthMetrics`, the same catalogue the
 * metric pickers use, so the screen holds no table of units of its own.
 */
export type ExternalNutritionDay = {
  date: string
  nutrients: Record<string, number>
  sources: string[]
}

type HealthPlugin = {
  isAvailable(): Promise<HealthAvailability>
  requestAuthorization(options?: {
    includeWrite?: boolean
  }): Promise<HealthAuthorization>
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
  /**
   * Nutrition and water written by *other* apps, by local day.
   *
   * Optional like the rest of this interface: an installed shell older than
   * this JS has no such method, and that must not read as an empty store.
   */
  getExternalNutrition?(options?: {
    daysBack?: number
  }): Promise<{ days: ExternalNutritionDay[]; complete?: boolean }>
  saveWorkout(options: HealthWorkoutSave): Promise<{ saved: boolean }>
  saveDailyMetric?(options: {
    metric: string
    date: string
    value: number
  }): Promise<HealthWriteResult>
  /**
   * One day's nutrition and hydration, written as a unit.
   *
   * Optional like everything else here, and for the usual reason: an installed
   * shell older than this JS has no such method, and the caller falls back to
   * the per-metric writes those shells do understand.
   */
  saveNutritionDay?(options: {
    date: string
    energyKcal?: number
    proteinG?: number
    carbsG?: number
    fatG?: number
    waterMl?: number
  }): Promise<HealthWriteResult>
  /**
   * The day's foods, one record each, and its water.
   *
   * Optional for the same reason as `saveNutritionDay`: an installed shell
   * older than this JS has neither, and the caller walks down the chain —
   * items, then the day record, then the per-metric writes — so an OTA that
   * ships this JS ahead of the native layer still files the day somewhere.
   */
  saveNutritionItems?(
    options: HealthNutritionItemsWrite
  ): Promise<HealthWriteResult>
  /**
   * Whether writes will be accepted, asked without prompting anybody.
   *
   * Android answers from the granted-permission set. iOS answers `unknown`
   * because HealthKit refuses to say, and a store that cannot be asked is not
   * one we may report as working.
   */
  getWriteAccess?(): Promise<{ status: HealthWriteAccess }>
  deleteDailyRecords?(options: {
    date: string
    metrics: string[]
  }): Promise<HealthDeleteResult>
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
  if (provider === "health_connect") return tr("Health Connect")
  return tr("Apple Health")
}

/**
 * Whether our own day must be deleted before it can be rewritten.
 *
 * Only Health Connect has to be asked. Its four nutrition metrics share one
 * record class, so the plugin's own write cannot wash the day without taking
 * its batch siblings with it — the caller cleans once, then writes. Apple
 * Health deletes the day's OneRep samples inside the items write itself, since
 * HealthKit only lets an app delete samples it wrote; asking for a separate
 * cleanup there fails every day on a store that has already cleaned up.
 */
export function healthStoreNeedsDailyCleanup(
  provider: HealthProvider | null = healthProvider()
): boolean {
  return provider === "health_connect"
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

/**
 * Asks the store for access, and asks again for writes when they are needed.
 *
 * `includeWrite` exists because Health Connect grants exactly the permissions
 * that were on screen when the user agreed. A phone that connected before
 * write-back shipped holds read access and considers the matter settled — so
 * without saying which access is wanted, the sheet never reopens and the writes
 * fail silently for the life of the install.
 */
export async function requestHealthAuthorization(options?: {
  includeWrite?: boolean
}): Promise<HealthAuthorization> {
  const active = plugin()
  if (!active) return { available: false, granted: false }
  return active.requestAuthorization(options ?? {})
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
  return (await readHealthDailyMetrics(options)).days
}

/**
 * The same read, with the store's refusal kept instead of swallowed.
 *
 * `getHealthDailyMetrics` answers `[]` for both "the store holds nothing" and
 * "the store would not answer", which is fine for a background sync and wrong
 * for anything that *reports* what the store holds: an empty read would be
 * shown as an accusation that every logged day is missing. Callers that put the
 * answer in front of a person use this one and can tell the two apart.
 */
export async function readHealthDailyMetrics(
  options: { daysBack?: number; metrics?: string[] } = {}
): Promise<{
  days: HealthDailyMetrics[]
  reason?: HealthWriteFailure
  message?: string
}> {
  const active = plugin()
  if (!active?.getDailyMetrics) return { days: [], reason: "unsupported_metric" }
  try {
    const { days } = await active.getDailyMetrics({
      daysBack: options.daysBack ?? 30,
      ...(options.metrics ? { metrics: options.metrics } : {}),
    })
    return { days: Array.isArray(days) ? days : [] }
  } catch (error) {
    // A permission the user declined on one signal must not lose the others,
    // so a refused read still resolves — it just says why. The native layer
    // hands back the store's own exception text rather than a reason code, so
    // the permission case is read off it.
    const message = error instanceof Error ? error.message : String(error)
    return {
      days: [],
      reason: /security|permission|denied/i.test(message)
        ? "no_permission"
        : "unknown",
      message,
    }
  }
}

/**
 * Nutrition and water other apps filed into the phone's health store.
 *
 * `complete` is the honest half of the answer: it says whether the store could
 * be read at all. The sync prunes history inside a window it is told was read,
 * so a shell that predates this method — or a permission the user declined —
 * has to answer "I could not read", not "there is nothing there". Those two
 * look identical in `days` and mean opposite things.
 */
export async function getExternalNutrition(
  options: { daysBack?: number } = {}
): Promise<{ days: ExternalNutritionDay[]; complete: boolean }> {
  const active = plugin()
  if (!active?.getExternalNutrition) return { days: [], complete: false }
  try {
    const answer = await active.getExternalNutrition({
      daysBack: options.daysBack ?? 30,
    })
    const days = Array.isArray(answer?.days) ? answer.days : []
    return answer?.complete === true
      ? { days, complete: true }
      : { days, complete: false }
  } catch {
    return { days: [], complete: false }
  }
}

/**
 * Writes a finished OneRep session back to the health store.
 *
 * Opt-in on both platforms — callers must check the user's preference first.
 * Resolves `{ saved: false }` rather than throwing when write permission was
 * never granted, because a declined health write must not fail a workout save.
 */
export async function saveWorkoutToHealth(
  options: HealthWorkoutSave
): Promise<{ saved: boolean }> {
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
}): Promise<HealthWriteResult> {
  const active = plugin()
  if (!active?.saveDailyMetric) {
    return { saved: false, reason: "unsupported_metric" }
  }
  try {
    return await active.saveDailyMetric(options)
  } catch (error) {
    return {
      saved: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Writes one day's food and water as a single unit.
 *
 * One record per day rather than one per nutrient. Health Connect models
 * nutrition as a record a meal can hang off, and four single-nutrient records
 * for the same day is a shape the store tolerates while its screens read the
 * day as four meals of unknown type. It is also one upsert instead of four
 * racing ones, keyed `nutrition:<date>` on the native side, so re-pushing a day
 * replaces it rather than adding to it.
 *
 * Where a day record does not exist the per-metric writes are the right shape
 * anyway: a shell older than this JS, or HealthKit — which has no nutrition
 * record at all and models each nutrient as its own sample series — so the day
 * is written that way rather than not at all.
 */
export async function saveHealthNutritionDay(
  options: HealthNutritionDayWrite
): Promise<HealthWriteResult> {
  const active = plugin()
  if (!active) return { saved: false, reason: "unavailable" }
  if (active.saveNutritionDay) {
    try {
      return await active.saveNutritionDay(options)
    } catch (error) {
      return {
        saved: false,
        reason: "unknown",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
  const legacy: [string, number][] = []
  if (options.energyKcal != null)
    legacy.push(["dietaryEnergyKcal", options.energyKcal])
  if (options.proteinG != null) legacy.push(["dietaryProteinG", options.proteinG])
  if (options.carbsG != null) legacy.push(["dietaryCarbsG", options.carbsG])
  if (options.fatG != null) legacy.push(["dietaryFatG", options.fatG])
  if (options.waterMl != null) legacy.push(["hydrationMl", options.waterMl])
  if (legacy.length === 0) return { saved: true }
  const results = await Promise.all(
    legacy.map(([metric, value]) =>
      saveHealthDailyMetric({ metric, date: options.date, value })
    )
  )
  const refused = results.find((result) => !result.saved)
  if (!refused) return { saved: true }
  return {
    saved: false,
    reason: refused.reason ?? "unknown",
    ...(refused.message ? { message: refused.message } : {}),
  }
}

/**
 * Writes a day's foods, one named record each, plus its water.
 *
 * The reason this exists at all: a day's totals under no name is not a food
 * log. Health Connect's nutrition record carries a `name` and a meal type, and
 * HealthKit carries the food's name on a food correlation, so the app can file
 * what somebody actually ate instead of one anonymous number — and only a
 * totals-only shape was ever a choice, not a limit of either store.
 *
 * One call for the whole day, because the day is replaced as a unit: the native
 * side clears its own records for the date and writes the items back, so a meal
 * added, edited or deleted lands as the day it should be rather than as a second
 * copy of an earlier one.
 *
 * The chain of fallbacks is deliberate. A shell without `saveNutritionItems`
 * takes the day's totals through `saveHealthNutritionDay`, and one without that
 * either takes the four per-metric writes — so an OTA that ships this JS ahead
 * of the native layer still files the day, just less legibly.
 */
export async function saveHealthNutritionItems(
  options: HealthNutritionItemsWrite
): Promise<HealthWriteResult> {
  const active = plugin()
  if (!active) return { saved: false, reason: "unavailable" }

  if (!active.saveNutritionItems) {
    const totals = options.items.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
        carbs: acc.carbs + item.carbs,
        fat: acc.fat + item.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
    const hasFood =
      totals.calories > 0 ||
      totals.protein > 0 ||
      totals.carbs > 0 ||
      totals.fat > 0
    return saveHealthNutritionDay({
      date: options.date,
      ...(hasFood
        ? {
            energyKcal: Math.round(totals.calories),
            proteinG: Math.round(totals.protein),
            carbsG: Math.round(totals.carbs),
            fatG: Math.round(totals.fat),
          }
        : {}),
      ...(options.waterMl ? { waterMl: Math.round(options.waterMl) } : {}),
    })
  }

  try {
    return await active.saveNutritionItems(options)
  } catch (error) {
    return {
      saved: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Whether the store will accept our writes, asked without prompting anyone.
 *
 * `unknown` covers both a shell with no such check and a platform that will not
 * answer — neither of which is evidence that writing works.
 */
export async function getHealthWriteAccess(): Promise<HealthWriteAccess> {
  const active = plugin()
  if (!active) return "unavailable"
  if (!active.getWriteAccess) return "unknown"
  try {
    const { status } = await active.getWriteAccess()
    return status
  } catch {
    return "unknown"
  }
}

/**
 * One-time per-day cleanup for pre-fix Health Connect stacks.
 *
 * Android only: four nutrition metrics share NutritionRecord, so a broad
 * delete inside saveDailyMetric would wipe batch siblings. The repair calls
 * this once per day before pushing, washing records filed without
 * clientRecordIds. No-op on web / iOS / older natives.
 */
export async function deleteHealthDailyRecords(options: {
  date: string
  metrics: string[]
}): Promise<HealthDeleteResult> {
  const active = plugin()
  if (!active?.deleteDailyRecords) {
    return { deleted: false, reason: "unsupported_metric" }
  }
  try {
    return await active.deleteDailyRecords(options)
  } catch (error) {
    return {
      deleted: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Writes body metrics (weight, body fat, etc.) back to the health provider.
 *
 * Best-effort by design: a refusal from the store must not fail the save that
 * already succeeded in OneRep. Each metric is written independently so a
 * failure on one does not block the others.
 */
/** How many of a batch of writes the store took, and why the rest failed. */
export type HealthWriteSummary = {
  saved: number
  refused: number
  reason?: HealthWriteFailure
  message?: string
}

export async function writeBackBodyMetrics(options: {
  date: string
  weightKg?: number
  bodyFatPct?: number
  leanBodyMassKg?: number
  boneMassKg?: number
  basalMetabolicRateKcal?: number
}): Promise<HealthWriteSummary> {
  const entries: [string, number][] = []
  if (options.weightKg != null) entries.push(["weightKg", options.weightKg])
  if (options.bodyFatPct != null)
    entries.push(["bodyFatPct", options.bodyFatPct])
  if (options.leanBodyMassKg != null)
    entries.push(["leanBodyMassKg", options.leanBodyMassKg])
  if (options.boneMassKg != null)
    entries.push(["boneMassKg", options.boneMassKg])
  if (options.basalMetabolicRateKcal != null)
    entries.push(["basalMetabolicRateKcal", options.basalMetabolicRateKcal])
  const results = await Promise.all(
    entries.map(([metric, value]) =>
      saveHealthDailyMetric({ metric, date: options.date, value })
    )
  )
  // Reported rather than thrown: the reading is already saved in OneRep, so a
  // refusal here is something to tell the user about, not a failed save.
  const failed = results.filter((result) => !result.saved)
  return {
    saved: results.length - failed.length,
    refused: failed.length,
    ...(failed[0]?.reason ? { reason: failed[0].reason } : {}),
    ...(failed[0]?.message ? { message: failed[0].message } : {}),
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
