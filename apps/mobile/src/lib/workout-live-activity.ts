import { Capacitor, registerPlugin } from "@capacitor/core"

export type WorkoutActivityState = {
  exerciseName: string
  setLabel: string
  completedSets: number
  totalSets: number
  isResting: boolean
  /** Absolute epoch ms, never a remaining duration — both platforms count to a wall clock. */
  restEndAt?: number
  slot: 1 | 2
  /** Epoch ms. Android's chronometer counts up from this; iOS uses its own attribute. */
  startedAt?: number
}

type LiveStatusPlugin = {
  start(
    state: WorkoutActivityState
  ): Promise<{ supported: boolean; id?: string }>
  update(state: WorkoutActivityState): Promise<void>
  end(state: WorkoutActivityState): Promise<void>
}

// Two plugins, one interface. iOS renders an ActivityKit Live Activity;
// Android renders an ongoing foreground-service notification (promoted to a
// Live Update on API 36+). The shapes are identical by design.
const iosPlugin = registerPlugin<LiveStatusPlugin>("WorkoutLiveActivity")
const androidPlugin = registerPlugin<LiveStatusPlugin>("WorkoutStatus")

/**
 * Whether to offer a user-facing toggle for it.
 *
 * Android only: an ongoing notification sits in the shade for the whole
 * session, where an iOS Live Activity is comparatively unobtrusive and has no
 * equivalent setting.
 */
export function supportsLiveWorkoutStatusSetting() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
}

function activePlugin(): LiveStatusPlugin | null {
  if (!Capacitor.isNativePlatform()) return null
  const platform = Capacitor.getPlatform()
  if (platform === "ios") return iosPlugin
  if (platform === "android") return androidPlugin
  return null
}

export async function startWorkoutLiveActivity(state: WorkoutActivityState) {
  await activePlugin()?.start(state)
}

export async function updateWorkoutLiveActivity(state: WorkoutActivityState) {
  await activePlugin()?.update(state)
}

export async function endWorkoutLiveActivity(state: WorkoutActivityState) {
  await activePlugin()?.end(state)
}
