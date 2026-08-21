import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core"

/**
 * The web app's view of the Apple Watch companion.
 *
 * The watch is a mirror with two buttons, not a client: it holds no session and
 * never speaks to Convex. State goes out as a snapshot; taps come back as
 * actions that this side turns into the same mutations any other button would.
 * That keeps every rule about what gets logged in one place, in TypeScript,
 * rather than reimplemented in Swift on a device that is hard to debug.
 */

export type WatchTodayState = {
  calories?: number
  calorieGoal?: number
  caloriesLeft?: number
  protein?: number
  proteinGoal?: number
  carbs?: number
  carbsGoal?: number
  fat?: number
  fatGoal?: number
  waterMl?: number
  waterGoalMl?: number
  daysLast28?: number
  workoutBrief?: string
}

export type WatchAvailability = {
  supported: boolean
  paired: boolean
  installed: boolean
}

export type WatchAction =
  | { action: "logWater"; payload: { amountMl?: number } }
  | {
      action: "logWorkout"
      payload: {
        durationSeconds?: number
        activeCalories?: number
        averageHeartRate?: number
        endedAt?: number
      }
    }

type WatchSyncPlugin = {
  isSupported(): Promise<WatchAvailability>
  updateContext(state: WatchTodayState): Promise<{ delivered: boolean }>
  addListener(
    event: "watchAction",
    handler: (action: WatchAction) => void
  ): Promise<PluginListenerHandle>
}

const plugin = registerPlugin<WatchSyncPlugin>("WatchSync")

/** watchOS is an iOS-only companion; everywhere else this is a no-op. */
function unavailable() {
  return !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios"
}

export async function updateWatchToday(state: WatchTodayState) {
  if (unavailable()) return
  await plugin.updateContext(state)
}

export async function watchAvailability(): Promise<WatchAvailability> {
  if (unavailable()) {
    return { supported: false, paired: false, installed: false }
  }
  return plugin.isSupported()
}

/**
 * Subscribes to taps from the wrist. Returns a disposer; callers must await the
 * handle before removing it, which is why this resolves to a function rather
 * than taking a cleanup callback.
 */
export async function onWatchAction(
  handler: (action: WatchAction) => void
): Promise<() => void> {
  if (unavailable()) return () => {}
  const handle = await plugin.addListener("watchAction", handler)
  return () => void handle.remove()
}
