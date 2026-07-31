import { useEffect, useState } from "react"
import { fastElapsedSeconds, type FastingSession } from "./fasting"
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "./utils"

const ACTIVE_FAST_KEY = "onerep:fasting:active:v1"

export type CachedActiveFast = {
  id: string
  startedAt: number
  targetMinutes: number
  protocol: string
}

/**
 * Elapsed seconds for a running fast.
 *
 * Ticks once a second and re-syncs on `visibilitychange`, because a
 * backgrounded PWA gets its interval throttled or suspended entirely — without
 * the re-sync the timer would silently drift behind by however long the app
 * was hidden. Mirrors the pattern in ActiveWorkout's useElapsedTimer.
 */
export function useFastTimer(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? fastElapsedSeconds(startedAt, Date.now()) : 0
  )

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0)
      return
    }

    function update() {
      setElapsed(fastElapsedSeconds(startedAt as number, Date.now()))
    }

    update()
    const id = setInterval(update, 1000)

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") update()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [startedAt])

  return elapsed
}

/**
 * Local mirror of the running fast.
 *
 * Convex is the source of truth, but its query resolves a beat after mount.
 * Without this the timer would flash "no fast running" on every cold start and
 * would show nothing at all while offline.
 */
export function readCachedActiveFast(): CachedActiveFast | null {
  try {
    const raw = safeLocalStorageGet(ACTIVE_FAST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedActiveFast
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      !Number.isFinite(parsed.startedAt)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeCachedActiveFast(session: FastingSession | null): void {
  if (!session) {
    safeLocalStorageRemove(ACTIVE_FAST_KEY)
    return
  }
  const id = session.id ?? session._id
  if (!id) return
  safeLocalStorageSet(
    ACTIVE_FAST_KEY,
    JSON.stringify({
      id,
      startedAt: session.startedAt,
      targetMinutes: session.targetMinutes,
      protocol: session.protocol,
    } satisfies CachedActiveFast)
  )
}
