import { describe, expect, test } from "bun:test"
import {
  NativeEnduranceRecorder,
  resetNativeEndurance,
  nativeClock,
  replayNativeBatch,
  type NativeRecorderPlugin,
  type NativeRecorderState,
  type NativeRouteBatch,
  type ReplayableSession,
} from "../native-endurance"
const session = (): ReplayableSession => ({
  id: "hike",
  sport: "hike",
  status: "recording",
  startedAt: 1000,
  pausedDurationMs: 0,
  points: [],
  distanceMeters: 0,
  elevationGainMeters: 0,
})
const points = Array.from({ length: 100 }, (_, i) => ({
  latitude: 48 + i * 0.0001,
  longitude: 11,
  altitude: 500 + i,
  altitudeAccuracy: 5,
  accuracy: 5,
  timestamp: 2000 + i * 10000,
}))
const batch = (
  seed: ReplayableSession,
  page: NativeRouteBatch["points"] = points,
  cursor = 100
): NativeRouteBatch => ({
  active: true,
  sessionId: seed.id,
  seed: JSON.stringify(seed),
  status: seed.status,
  points: page,
  nextCursor: cursor,
  hasMore: false,
})
const decode = (raw: string) => JSON.parse(raw) as ReplayableSession
function fixture() {
  let current = session(),
    saved = session()
  let failCheckpoint = false
  let checkpointHook = () => {}
  let stopped = false
  const calls: string[] = []
  const state = (): NativeRecorderState => ({
    active: true,
    sessionId: saved.id,
    status: saved.status,
    seed: JSON.stringify(saved),
  })
  const plugin: NativeRecorderPlugin = {
    getState: async () => state(),
    start: async ({ seed }) => {
      saved = decode(seed)
      return state()
    },
    pause: async () => {
      saved = { ...saved, status: "paused", pausedAt: 1000000 }
      return state()
    },
    resume: async () => {
      saved = { ...saved, status: "recording", pausedAt: undefined }
      return state()
    },
    stop: async () => {
      calls.push("stop")
      stopped = true
      saved = { ...saved, status: "paused", pausedAt: 1000000 }
      return state()
    },
    read: async ({ cursor }) => {
      calls.push(`read:${cursor}`)
      return cursor < 100
        ? { ...batch(saved, points.slice(0, 50), 100), hasMore: true }
        : cursor < 200
          ? batch(saved, points.slice(50), 200)
          : batch(saved, [], 200)
    },
    checkpoint: async ({ seed }) => {
      calls.push("checkpoint")
      if (failCheckpoint) {
        failCheckpoint = false
        throw new Error("Disk full")
      }
      saved = decode(seed)
      checkpointHook()
    },
    clear: async () => {
      expect(stopped).toBe(true)
      calls.push("clear")
    },
    reset: async () => {
      calls.push("reset")
    },
  }
  const recorder = () =>
    new NativeEnduranceRecorder<ReplayableSession>(
      plugin,
      () => current,
      (next) => {
        current = next
      },
      decode,
      () => {}
    )
  return {
    plugin,
    recorder,
    calls,
    current: () => current,
    saved: () => saved,
    setCurrent: (next: ReplayableSession) => {
      current = next
    },
    failNextCheckpoint: () => {
      failCheckpoint = true
    },
    onCheckpoint: (fn: () => void) => {
      checkpointHook = fn
    },
  }
}
describe("native endurance replay", () => {
  test("replays points collected while JavaScript was suspended without a distance gap", () => {
    const result = replayNativeBatch(session(), batch(session()))
    expect(result.points.length).toBe(100)
    expect(result.distanceMeters).toBeGreaterThan(1100)
    expect(result.distanceMeters).toBeLessThan(1110)
    expect(result.elevationGainMeters).toBe(95)
  })
  test("replaying an acknowledged page cannot double-count", () => {
    const page = batch(session())
    const result = replayNativeBatch(session(), page)
    expect(replayNativeBatch(result, page)).toBe(result)
  })
  test("pause/resume starts a separate route segment without adding travel during pause", () => {
    const first = replayNativeBatch(
      session(),
      batch(session(), points.slice(0, 2), 10)
    )
    const resumed = replayNativeBatch(
      first,
      batch(first, [{ ...points[2]!, latitude: 49, segmentStart: true }], 20)
    )
    expect(resumed.distanceMeters).toBe(first.distanceMeters)
    expect(resumed.points.at(-1)?.segmentStart).toBe(true)
  })
  test("a process interruption uses the native pause time instead of the time the app reopened", () => {
    const frozen = nativeClock(session(), {
      ...session(),
      status: "paused",
      pausedAt: 12000,
    })
    expect(frozen.status).toBe("paused")
    expect(frozen.pausedAt! - frozen.startedAt - frozen.pausedDurationMs).toBe(
      11000
    )
    expect(() =>
      nativeClock(session(), { ...session(), id: "other" })
    ).toThrow()
  })
  test("pages from another workout are rejected", () => {
    expect(() =>
      replayNativeBatch(session(), {
        ...batch(session()),
        sessionId: "someone-else",
      })
    ).toThrow()
  })
  test("failed checkpoint leaves the cursor unacknowledged and retry counts each point once", async () => {
    const f = fixture(),
      recorder = f.recorder()
    f.failNextCheckpoint()
    await expect(recorder.attach()).rejects.toThrow("Disk full")
    expect(f.current().nativeCursor).toBeUndefined()
    await recorder.sync()
    expect(f.current().nativeCursor).toBe(200)
    expect(f.current().points).toHaveLength(100)
    const distance = f.current().distanceMeters
    await recorder.sync()
    expect(f.current().distanceMeters).toBe(distance)
  })
  test("native checkpoint restores a cursor and totals when the WebView dies before committing", async () => {
    const f = fixture(),
      recorder = f.recorder()
    f.onCheckpoint(() => recorder.detach())
    await recorder.attach()
    expect(f.current().nativeCursor).toBeUndefined()
    expect(f.saved().nativeCursor).toBe(100)
    f.onCheckpoint(() => {})
    const reopened = f.recorder()
    await reopened.attach()
    expect(f.current().nativeCursor).toBe(200)
    expect(f.current().points).toHaveLength(100)
    expect(f.current().distanceMeters).toBeGreaterThan(1100)
  })
  test("existing native session wins over a new empty session after browser storage loss", async () => {
    const f = fixture()
    f.setCurrent({ ...session(), id: "new-empty-session" })
    await f.recorder().attach()
    expect(f.current().id).toBe("hike")
    expect(f.current().points).toHaveLength(100)
  })
  test("finish stops native sampling and drains all pages before clearing the journal", async () => {
    const f = fixture(),
      recorder = f.recorder()
    const final = await recorder.control("stop")
    expect(final.status).toBe("paused")
    expect(final.points).toHaveLength(100)
    await recorder.clear()
    expect(f.calls).toEqual([
      "stop",
      "read:0",
      "checkpoint",
      "read:100",
      "checkpoint",
      "clear",
    ])
  })
  test("a new native journal clears a stale cursor after a previously finished recording", async () => {
    const f = fixture()
    f.setCurrent({ ...session(), nativeCursor: 900, distanceMeters: 100 })
    f.plugin.getState = async () => ({ active: false })
    const start = f.plugin.start
    f.plugin.start = async (args) =>
      start({
        ...args,
        seed: JSON.stringify({ ...decode(args.seed), nativeCursor: 0 }),
      })
    await f.recorder().attach()
    expect(f.current().nativeCursor).toBe(200)
    expect(f.current().distanceMeters).toBeGreaterThan(1200)
  })
  test("sign-out resets native storage and invalidates queued controls from the previous account", async () => {
    const f = fixture(),
      recorder = f.recorder()
    await recorder.attach()
    await resetNativeEndurance(f.plugin)
    await expect(recorder.control("resume")).rejects.toThrow("closed")
    expect(f.calls.at(-1)).toBe("reset")
  })
})
