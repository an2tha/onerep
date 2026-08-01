import { describe, expect, test } from "bun:test"
import {
  offlineSyncErrorText,
  offlineSyncStatusCopy,
} from "../offline-sync-status"

describe("offline sync status copy", () => {
  test("explains offline mode with no queued changes", () => {
    expect(
      offlineSyncStatusCopy({
        online: false,
        canSync: false,
        total: 0,
      })
    ).toEqual({
      title: "Offline mode",
      body: "Keep logging. Changes are saved locally.",
      tone: "offline",
      canRetry: false,
    })
  })

  test("shows queued offline changes waiting for connection", () => {
    expect(
      offlineSyncStatusCopy({
        online: false,
        canSync: false,
        total: 2,
      })
    ).toMatchObject({
      title: "Offline mode",
      body: "2 changes saved locally. Connect to sync.",
      tone: "offline",
      canRetry: false,
    })
  })

  test("distinguishes auth bridge waiting from offline mode", () => {
    expect(
      offlineSyncStatusCopy({
        online: true,
        canSync: false,
        total: 1,
      })
    ).toEqual({
      title: "Waiting to sync",
      body: "Sign-in is still connecting. Changes are saved locally.",
      tone: "pending",
      canRetry: false,
    })
  })

  test("allows retry when queued changes can sync", () => {
    expect(
      offlineSyncStatusCopy({
        online: true,
        canSync: true,
        total: 3,
      })
    ).toEqual({
      title: "3 changes waiting to sync",
      body: "Uploading automatically. You can retry now.",
      tone: "syncing",
      canRetry: true,
    })
  })

  test("confirms that online changes are backed up once the queue is clear", () => {
    expect(
      offlineSyncStatusCopy({
        online: true,
        canSync: true,
        total: 0,
      })
    ).toEqual({
      title: "All changes synced",
      body: "Your latest changes are backed up.",
      tone: "synced",
      canRetry: false,
    })
  })

  test("shows an in-progress state while a flush is running", () => {
    expect(
      offlineSyncStatusCopy({
        online: true,
        canSync: true,
        syncing: true,
        total: 3,
        lastError: "Previous retry failed",
      })
    ).toEqual({
      title: "Syncing changes",
      body: "Uploading saved changes now.",
      tone: "syncing",
      canRetry: false,
    })
  })

  test("surfaces sync errors without leaking the raw message", () => {
    const raw =
      "validation failed because the saved payload was too old to apply safely"
    const copy = offlineSyncStatusCopy({
      online: true,
      canSync: true,
      total: 1,
      lastError: raw,
    })

    expect(copy.title).toBe("Sync needs attention")
    expect(copy.tone).toBe("error")
    expect(copy.canRetry).toBe(true)
    expect(copy.body).not.toContain("validation failed")
    expect(copy.body).toBe(
      "Your changes are safe on this device. Retry to back them up."
    )
  })

  test("names the connection when the failure looks like a network problem", () => {
    const copy = offlineSyncStatusCopy({
      online: true,
      canSync: true,
      total: 1,
      lastError: "TypeError: Failed to fetch",
    })

    expect(copy.body).toBe(
      "We couldn’t reach OneRep. Check your connection, then retry."
    )
  })

  test("surfaces transient retry errors even when no queued count is available", () => {
    expect(
      offlineSyncStatusCopy({
        online: true,
        canSync: true,
        total: 0,
        lastError: "Storage could not be read",
      })
    ).toEqual({
      title: "Sync needs attention",
      body: "Your changes are safe on this device. Retry to back them up.",
      tone: "error",
      canRetry: true,
    })
  })

  test("normalizes unexpected sync failures for display", () => {
    expect(offlineSyncErrorText(new Error("Queue unavailable"))).toBe(
      "Queue unavailable"
    )
    expect(offlineSyncErrorText("Manual retry failed")).toBe(
      "Manual retry failed"
    )
    expect(offlineSyncErrorText(null)).toBe(
      "Your changes are still on this device and not backed up yet."
    )
  })
})
