import { describe, expect, test } from "bun:test"

import {
  healthSyncPresentation,
  syncedAgoLabel,
} from "../health-sync-presentation"

const base = {
  providerLabel: "Health Connect",
  providerAvailable: true,
  consentMissing: false,
  enabled: true,
  running: false,
}

const now = Date.UTC(2026, 9, 15, 12, 0, 0)

describe("how a sync stands, in one word", () => {
  test("a device with no health store is unavailable, and has no action", () => {
    const state = healthSyncPresentation({ ...base, providerAvailable: false })
    expect(state.state).toBe("unavailable")
    expect(state.action).toBeNull()
    expect(state.detail).toContain("Health Connect")
  })

  test("running outranks a stale failure from the sync before it", () => {
    const state = healthSyncPresentation({
      ...base,
      running: true,
      phase: "Importing…",
      error: "Couldn't reach OneRep's server.",
    })
    expect(state.state).toBe("running")
    expect(state.detail).toBe("Importing…")
    expect(state.action).toBe("sync")
  })

  test("a refusal asks for a grant, even when an older error is still on record", () => {
    const state = healthSyncPresentation({
      ...base,
      needsPermission: true,
      error: "Permission was denied.",
    })
    expect(state.state).toBe("permission")
    expect(state.action).toBe("grant")
    expect(state.actionLabel).toBe("Grant access")
  })

  test("consent outranks an error, because nothing can be read without it", () => {
    const state = healthSyncPresentation({
      ...base,
      consentMissing: true,
      error: "Sync failed.",
    })
    expect(state.state).toBe("consent")
    expect(state.action).toBe("consent")
  })

  test("an ordinary failure is a retry, and carries its own message", () => {
    const state = healthSyncPresentation({
      ...base,
      error: "Couldn't reach OneRep's server. Check your connection.",
    })
    expect(state.state).toBe("attention")
    expect(state.action).toBe("sync")
    expect(state.actionLabel).toBe("Try again")
    expect(state.detail).toContain("Check your connection")
  })

  test("off offers to turn on; enabled-but-never-synced offers a first sync", () => {
    const off = healthSyncPresentation({ ...base, enabled: false })
    expect(off.state).toBe("off")
    expect(off.action).toBe("enable")

    const ready = healthSyncPresentation({ ...base, lastSyncedAt: null })
    expect(ready.state).toBe("ready")
    expect(ready.action).toBe("sync")
    expect(ready.detail).toContain("week")
  })

  test("connected says when it last ran and what it did", () => {
    const state = healthSyncPresentation({
      ...base,
      lastSyncedAt: now - 2 * 60 * 60 * 1000,
      lastActivity: { at: now, label: "Imported 3 workouts" },
      now,
    })
    expect(state.state).toBe("connected")
    expect(state.label).toBe("Connected")
    expect(state.detail).toContain("2 h ago")
    expect(state.detail).toContain("Imported 3 workouts")
    expect(state.actionLabel).toBe("Sync now")
  })

  test("a connected sync that found nothing says so rather than going quiet", () => {
    const state = healthSyncPresentation({
      ...base,
      lastSyncedAt: now - 90 * 1000,
      now,
    })
    expect(state.detail).toContain("No new workouts")
  })
})

describe("how long ago a sync ran", () => {
  test("reads in the unit a person would say it in", () => {
    expect(syncedAgoLabel(null, now)).toBeNull()
    expect(syncedAgoLabel(now - 20 * 1000, now)).toBe("just now")
    expect(syncedAgoLabel(now - 30 * 60 * 1000, now)).toBe("30 min ago")
    expect(syncedAgoLabel(now - 3 * 60 * 60 * 1000, now)).toBe("3 h ago")
    expect(syncedAgoLabel(now - 25 * 60 * 60 * 1000, now)).toBe("yesterday")
    expect(syncedAgoLabel(now - 3 * 24 * 60 * 60 * 1000, now)).toBe(
      "3 days ago"
    )
  })

  test("a week or more becomes a date, and never a negative age", () => {
    const old = syncedAgoLabel(now - 30 * 24 * 60 * 60 * 1000, now)
    expect(old).not.toContain("ago")
    expect(syncedAgoLabel(now + 60 * 60 * 1000, now)).toBe("just now")
  })
})
