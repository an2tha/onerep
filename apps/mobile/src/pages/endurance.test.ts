import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const SOURCE = readFileSync(
  new URL("./Endurance.tsx", import.meta.url),
  "utf8"
)
const ACTIVE_SOURCE = readFileSync(
  new URL("./ActiveEnduranceWorkout.tsx", import.meta.url),
  "utf8"
)
const IOS_INFO = readFileSync(
  new URL("../../ios/App/App/Info.plist", import.meta.url),
  "utf8"
)
const ANDROID_MANIFEST = readFileSync(
  new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url),
  "utf8"
)
const WATCH_SYNC_SOURCE = readFileSync(
  new URL("../lib/watch-sync.ts", import.meta.url),
  "utf8"
)
const WATCH_MANAGER_SOURCE = readFileSync(
  new URL("../../ios/App/OneRepWatch/WorkoutSessionManager.swift", import.meta.url),
  "utf8"
)
const APPLE_HEALTH_SOURCE = readFileSync(
  new URL("../../ios/App/App/AppleHealthPlugin.swift", import.meta.url),
  "utf8"
)
const ANDROID_HEALTH_SOURCE = readFileSync(
  new URL(
    "../../android/app/src/main/java/com/ananthh/onerep/HealthConnectPlugin.kt",
    import.meta.url
  ),
  "utf8"
)

describe("endurance tab", () => {
  test("is presented as a beta section", () => {
    expect(SOURCE).toContain("Beta")
    expect(SOURCE).not.toContain("experimentalFeaturesEnabled")
  })

  test("uses the shared hold-to-start training hero", () => {
    expect(SOURCE).toContain("HoldToStartDial")
    expect(SOURCE).toContain("TrainingStatDial")
    expect(SOURCE).toContain("Hold to start GPS tracking.")
    expect(SOURCE).toContain("/endurance/active?sport=")
  })

  test("offers independent run, ride and swim views", () => {
    expect(SOURCE).toContain('type Sport = "run" | "ride" | "swim"')
    expect(SOURCE).toContain('aria-label="Activity type"')
  })

  test("allows weekly distance, time and session goals", () => {
    expect(SOURCE).toContain("api.users.users.setEnduranceGoals")
    expect(SOURCE).toContain('label="Distance"')
    expect(SOURCE).toContain('label="Time"')
    expect(SOURCE).toContain('label="Sessions"')
  })

  test("active workout records, recovers and finishes a GPS session", () => {
    expect(ACTIVE_SOURCE).toContain("navigator.geolocation.watchPosition")
    expect(ACTIVE_SOURCE).toContain("ACTIVE_ENDURANCE_KEY")
    expect(ACTIVE_SOURCE).toContain("Pause workout")
    expect(ACTIVE_SOURCE).toContain("Resume workout")
    expect(ACTIVE_SOURCE).toContain("Lap")
    expect(ACTIVE_SOURCE).toContain(
      "api.logs.healthWorkouts.recordEnduranceWorkout"
    )
  })

  test("active workout exposes GPS and live-stat states accessibly", () => {
    expect(ACTIVE_SOURCE).toContain('aria-label="Live workout statistics"')
    expect(ACTIVE_SOURCE).toContain("EnduranceRouteMap")
    expect(ACTIVE_SOURCE).toContain("Location off")
    expect(ACTIVE_SOURCE).toContain("GPS locked")
    expect(ACTIVE_SOURCE).toContain("coords.accuracy > 250")
    expect(ACTIVE_SOURCE).toContain("Try again")
    expect(ACTIVE_SOURCE).not.toContain('locked: "GPS LOCKED"')
    expect(ACTIVE_SOURCE).not.toContain('locating: "ACQUIRING GPS"')
  })

  test("offers indoor workouts without starting geolocation", () => {
    expect(SOURCE).toContain('aria-label="Workout setting"')
    expect(SOURCE).toContain('["outdoor", "indoor"]')
    expect(ACTIVE_SOURCE).toContain('session.environment === "indoor"')
    expect(ACTIVE_SOURCE).toContain("Timing and laps are active. GPS is off.")
  })

  test("native apps request foreground location access", () => {
    expect(IOS_INFO).toContain("NSLocationWhenInUseUsageDescription")
    expect(ANDROID_MANIFEST).toContain("android.permission.ACCESS_COARSE_LOCATION")
    expect(ANDROID_MANIFEST).toContain("android.permission.ACCESS_FINE_LOCATION")
  })

  test("streams watch heart rate and calories into a recoverable graph", () => {
    expect(SOURCE).toContain("api.logs.healthWorkouts.getHeartRateSeries")
    expect(SOURCE).toContain("Active calories")
    expect(ACTIVE_SOURCE).toContain("EnduranceHeartRateChart")
    expect(ACTIVE_SOURCE).toContain('event.action === "enduranceMetrics"')
    expect(ACTIVE_SOURCE).toContain("MAX_HEART_RATE_SAMPLES")
    expect(WATCH_SYNC_SOURCE).toContain("commandEnduranceWatch")
    expect(WATCH_MANAGER_SOURCE).toContain("HKLiveWorkoutDataSource")
    expect(WATCH_MANAGER_SOURCE).toContain('"heartRateSamples"')
  })

  test("exports activity-aware endurance sessions to native fitness stores", () => {
    expect(APPLE_HEALTH_SOURCE).toContain('case "run": configuration.activityType = .running')
    expect(APPLE_HEALTH_SOURCE).toContain("HKMetadataKeyWorkoutBrandName")
    expect(ANDROID_HEALTH_SOURCE).toContain(
      "ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL"
    )
    expect(ANDROID_HEALTH_SOURCE).toContain("ActiveCaloriesBurnedRecord")
  })
})
