import { beforeEach, describe, expect, test } from "bun:test"

// The app shell provides localStorage; unit tests stub it on globalThis the
// same way the repo's other storage-backed tests do.
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
}
;(globalThis as Record<string, unknown>).localStorage = new MemoryStorage()

import {
  beginHealthSync,
  clearSyncActivities,
  endHealthSync,
  friendlyHealthError,
  getHealthSyncStatus,
  recordSyncActivity,
  setHealthSyncPhase,
} from "../health-sync-status"

describe("health-sync-status", () => {
  beforeEach(() => {
    endHealthSync({ error: null })
    clearSyncActivities()
  })

  test("begin/end tracks running state, phase, and duration", () => {
    beginHealthSync("Reading workouts…")
    expect(getHealthSyncStatus().running).toBe(true)
    expect(getHealthSyncStatus().phase).toBe("Reading workouts…")
    expect(getHealthSyncStatus().startedAt).not.toBeNull()

    setHealthSyncPhase("Importing…")
    expect(getHealthSyncStatus().phase).toBe("Importing…")

    endHealthSync({ error: null })
    expect(getHealthSyncStatus().running).toBe(false)
    expect(getHealthSyncStatus().phase).toBeNull()
    expect(getHealthSyncStatus().startedAt).toBeNull()
    expect(getHealthSyncStatus().lastDurationMs).not.toBeNull()
  })

  test("setHealthSyncPhase is a no-op when nothing is running", () => {
    setHealthSyncPhase("ghost")
    expect(getHealthSyncStatus().phase).toBeNull()
  })

  test("endHealthSync records the error", () => {
    beginHealthSync("Reading…")
    endHealthSync({ error: "Health Connect refused a read." })
    expect(getHealthSyncStatus().lastError).toBe("Health Connect refused a read.")
    expect(getHealthSyncStatus().running).toBe(false)
  })

  test("activity journal is newest-first and capped at six", () => {
    for (let i = 0; i < 8; i++) {
      recordSyncActivity(`sync ${i}`, i)
    }
    const recent = getHealthSyncStatus().recent
    expect(recent.length).toBe(6)
    expect(recent[0].label).toBe("sync 7")
    expect(recent[0].count).toBe(7)
    expect(recent[5].label).toBe("sync 2")
  })

  test("clearSyncActivities empties the journal", () => {
    recordSyncActivity("one")
    clearSyncActivities()
    expect(getHealthSyncStatus().recent.length).toBe(0)
  })

  test("friendlyHealthError maps known failures to sentences", () => {
    expect(
      friendlyHealthError(
        "android.health.connect.HealthConnectException: java.lang.SecurityException: Caller does not have permission to read data"
      )
    ).toContain("re-grant access")
    expect(friendlyHealthError("Health sync is not enabled for this account")).toContain(
      "consent"
    )
    expect(friendlyHealthError("fetch failed")).toContain("server")
  })

  test("friendlyHealthError degrades unknown failures and passes null through", () => {
    expect(friendlyHealthError("weird quantum failure")).toBe(
      "Sync failed. Try again shortly."
    )
    expect(friendlyHealthError(null)).toBeNull()
    expect(friendlyHealthError(undefined)).toBeNull()
  })
})
