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
  reachable?: boolean
}

export type EnduranceWatchCommand = {
  command: "start" | "pause" | "resume" | "end"
  sessionId: string
  sport: "run" | "ride" | "swim"
  environment: "outdoor" | "indoor"
  startedAt: number
}

export type EnduranceWatchMetrics = {
  sessionId: string
  heartRateBpm?: number
  averageHeartRateBpm?: number
  maxHeartRateBpm?: number
  activeCalories?: number
  elapsedSeconds?: number
  timestamp?: number
  healthWorkoutId?: string
  heartRateSamples?: Array<{ elapsedSeconds: number; bpm: number }>
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
  | { action: "enduranceMetrics"; payload: EnduranceWatchMetrics }
  | {
      action: "enduranceControl"
      payload: {
        sessionId: string
        command: "pause" | "resume" | "end"
      }
    }
  | { action: "enduranceFinished"; payload: EnduranceWatchMetrics }

type WatchSyncPlugin = {
  isSupported(): Promise<WatchAvailability>
  updateContext(state: WatchTodayState): Promise<{ delivered: boolean }>
  commandEndurance(
    command: EnduranceWatchCommand
  ): Promise<{ delivered: boolean; reachable: boolean }>
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
 * Keeps the latest command in WatchConnectivity application context so a watch
 * opened after the phone starts still joins the session. Reachable watches also
 * receive it immediately as a message.
 */
export async function commandEnduranceWatch(command: EnduranceWatchCommand) {
  if (unavailable()) return { delivered: false, reachable: false }
  try {
    return await plugin.commandEndurance(command)
  } catch {
    return { delivered: false, reachable: false }
  }
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
