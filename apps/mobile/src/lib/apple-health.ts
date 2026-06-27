import { Capacitor, registerPlugin } from "@capacitor/core"

export type AppleHealthWorkout = {
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

type AppleHealthAvailability = {
  available: boolean
  platform: string
  authorizationStatus?: string
}

type AppleHealthAuthorization = {
  available: boolean
  granted: boolean
}

type AppleHealthWorkoutQuery = {
  limit?: number
  daysBack?: number
}

type AppleHealthWorkoutResult = {
  workouts: AppleHealthWorkout[]
}

type AppleHealthPlugin = {
  isAvailable(): Promise<AppleHealthAvailability>
  requestAuthorization(): Promise<AppleHealthAuthorization>
  getRecentWorkouts(
    options?: AppleHealthWorkoutQuery
  ): Promise<AppleHealthWorkoutResult>
}

const AppleHealth = registerPlugin<AppleHealthPlugin>("AppleHealth")

export function isAppleHealthSupportedPlatform() {
  return Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()
}

export async function getAppleHealthAvailability() {
  if (!isAppleHealthSupportedPlatform()) {
    return {
      available: false,
      platform: Capacitor.getPlatform(),
    } satisfies AppleHealthAvailability
  }

  return AppleHealth.isAvailable()
}

export async function requestAppleHealthAuthorization() {
  if (!isAppleHealthSupportedPlatform()) {
    return {
      available: false,
      granted: false,
    } satisfies AppleHealthAuthorization
  }

  return AppleHealth.requestAuthorization()
}

export async function getRecentAppleHealthWorkouts(
  options: AppleHealthWorkoutQuery = {}
) {
  if (!isAppleHealthSupportedPlatform()) {
    return [] satisfies AppleHealthWorkout[]
  }

  const { workouts } = await AppleHealth.getRecentWorkouts({
    daysBack: options.daysBack ?? 30,
    limit: options.limit ?? 12,
  })
  return workouts
}
