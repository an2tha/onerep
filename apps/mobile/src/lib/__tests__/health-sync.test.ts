import { describe, expect, test } from "bun:test"
import {
  HEALTH_SYNC_MIN_INTERVAL_MS,
  healthWorkoutToImport,
  shouldSyncHealth,
} from "../health-sync"
import type { HealthWorkout } from "../health-provider"

const NOW = Date.parse("2026-08-01T12:00:00.000Z")

const READY = {
  supported: true,
  consentGranted: true,
  enabled: true,
  autoSync: true,
  lastSyncedAt: undefined,
  now: NOW,
}

describe("shouldSyncHealth", () => {
  test("syncs when everything is on and there is no prior sync", () => {
    expect(shouldSyncHealth(READY)).toBe(true)
  })

  test("refuses on an unsupported platform", () => {
    expect(shouldSyncHealth({ ...READY, supported: false })).toBe(false)
  })

  test("refuses without wearable consent", () => {
    expect(shouldSyncHealth({ ...READY, consentGranted: false })).toBe(false)
  })

  test("refuses when the integration is switched off", () => {
    expect(shouldSyncHealth({ ...READY, enabled: false })).toBe(false)
  })

  test("refuses when auto-sync is off, leaving only the manual button", () => {
    expect(shouldSyncHealth({ ...READY, autoSync: false })).toBe(false)
  })

  test("throttles a sync inside the interval", () => {
    expect(
      shouldSyncHealth({
        ...READY,
        lastSyncedAt: NOW - (HEALTH_SYNC_MIN_INTERVAL_MS - 1000),
      })
    ).toBe(false)
  })

  test("syncs again once the interval has elapsed", () => {
    expect(
      shouldSyncHealth({
        ...READY,
        lastSyncedAt: NOW - HEALTH_SYNC_MIN_INTERVAL_MS,
      })
    ).toBe(true)
  })
})

describe("healthWorkoutToImport", () => {
  const base: HealthWorkout = {
    uuid: "hk-1",
    activityType: "running",
    activityName: "Outdoor Run",
    startedAt: "2026-07-30T17:00:00.000Z",
    endedAt: "2026-07-30T17:45:00.000Z",
    durationSeconds: 2700,
  }

  test("carries the identity and timing fields through", () => {
    const payload = healthWorkoutToImport(base, "UTC")
    expect(payload).toMatchObject({
      uuid: "hk-1",
      activityType: "running",
      activityName: "Outdoor Run",
      date: "2026-07-30",
      durationSeconds: 2700,
    })
  })

  test("omits absent optional fields rather than sending undefined", () => {
    const payload = healthWorkoutToImport(base, "UTC")
    expect(payload).not.toHaveProperty("totalDistanceMeters")
    expect(payload).not.toHaveProperty("avgHeartRateBpm")
    expect(payload).not.toHaveProperty("routeName")
  })

  test("dates a late-evening workout by local day, not UTC day", () => {
    // 9pm on the 30th in New York is already the 31st in UTC. Using the UTC
    // date would file the session under the wrong day in the training log.
    const evening: HealthWorkout = {
      ...base,
      startedAt: "2026-07-31T01:00:00.000Z",
      endedAt: "2026-07-31T01:45:00.000Z",
    }
    expect(healthWorkoutToImport(evening, "America/New_York").date).toBe(
      "2026-07-30"
    )
    expect(healthWorkoutToImport(evening, "UTC").date).toBe("2026-07-31")
  })

  test("dates an early-morning workout by local day ahead of UTC", () => {
    // 8am on the 31st in Tokyo is still the 30th in UTC.
    const morning: HealthWorkout = {
      ...base,
      startedAt: "2026-07-30T23:00:00.000Z",
      endedAt: "2026-07-30T23:45:00.000Z",
    }
    expect(healthWorkoutToImport(morning, "Asia/Tokyo").date).toBe("2026-07-31")
  })

  test("passes through the metrics HealthKit provided", () => {
    const payload = healthWorkoutToImport(
      {
        ...base,
        totalDistanceMeters: 8000,
        avgHeartRateBpm: 152,
        maxHeartRateBpm: 178,
        activeEnergyKcal: 600,
        sourceName: "Apple Watch",
        hasRoute: true,
        routeName: "River loop",
      },
      "UTC"
    )
    expect(payload).toMatchObject({
      totalDistanceMeters: 8000,
      avgHeartRateBpm: 152,
      maxHeartRateBpm: 178,
      activeEnergyKcal: 600,
      sourceName: "Apple Watch",
      hasRoute: true,
      routeName: "River loop",
    })
  })
})
