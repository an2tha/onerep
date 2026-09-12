import { Capacitor, registerPlugin } from "@capacitor/core"
import {
  acceptGpsPoint,
  appendRoutePoint,
  elevationStep,
  type GpsPoint,
} from "./hiking-tracking"
export type NativeRecorderState = {
  active: boolean
  sessionId?: string
  seed?: string
  status?: "recording" | "paused" | "stopped"
  error?: string
}
export type NativeRouteBatch = NativeRecorderState & {
  points: GpsPoint[]
  nextCursor: number
  hasMore: boolean
}
export type NativeRecorderPlugin = {
  getState(): Promise<NativeRecorderState>
  start(args: { sessionId: string; seed: string }): Promise<NativeRecorderState>
  resume(args: { sessionId: string }): Promise<NativeRecorderState>
  pause(args: { sessionId: string }): Promise<NativeRecorderState>
  stop(args: { sessionId: string }): Promise<NativeRecorderState>
  read(args: { sessionId: string; cursor: number }): Promise<NativeRouteBatch>
  checkpoint(args: { sessionId: string; seed: string }): Promise<void>
  reset(): Promise<void>
  clear(args: { sessionId: string }): Promise<void>
}
export const nativeRecorder =
  registerPlugin<NativeRecorderPlugin>("EnduranceLocation")
export function hasNativeEndurance() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("EnduranceLocation")
  )
}
export function isNativeEnduranceShell() {
  return Capacitor.isNativePlatform()
}
export type ReplayableSession = {
  id: string
  sport: string
  status: "recording" | "paused"
  startedAt: number
  pausedAt?: number
  pausedDurationMs: number
  points: GpsPoint[]
  distanceMeters: number
  elevationGainMeters: number
  nativeCursor?: number
  nativeLastPoint?: GpsPoint | null
  nativeElevationAnchor?: number | null
}
export function replayNativeBatch<S extends ReplayableSession>(
  session: S,
  batch: NativeRouteBatch
): S {
  if (batch.sessionId !== session.id)
    throw new Error("The native route belongs to another workout.")
  if (!Number.isSafeInteger(batch.nextCursor) || batch.nextCursor < 0)
    throw new Error("Invalid native route cursor.")
  if (batch.nextCursor <= (session.nativeCursor ?? 0)) return session
  let previous = session.nativeLastPoint ?? null,
    anchor = session.nativeElevationAnchor ?? null
  let points = session.points,
    distance = session.distanceMeters,
    gain = session.elevationGainMeters
  const maximumSpeed =
    session.sport === "ride"
      ? 35
      : ["hike", "walk"].includes(session.sport)
        ? 5
        : 15
  for (const raw of batch.points) {
    if (raw.segmentStart) {
      previous = null
      anchor = null
    }
    const accepted = acceptGpsPoint(previous, raw, maximumSpeed)
    if (!accepted) continue
    const elevation = elevationStep(anchor, accepted.point)
    previous = accepted.point
    anchor = elevation.anchor
    points = appendRoutePoint(points, accepted.point)
    distance += accepted.distance
    gain += elevation.gain
  }
  return {
    ...session,
    points,
    distanceMeters: distance,
    elevationGainMeters: gain,
    nativeCursor: batch.nextCursor,
    nativeLastPoint: previous,
    nativeElevationAnchor: anchor,
  }
}
export function nativeClock<S extends ReplayableSession>(
  session: S,
  seed: S
): S {
  if (
    session.id !== seed.id ||
    !Number.isFinite(seed.pausedDurationMs) ||
    seed.pausedDurationMs < 0 ||
    !["paused", "recording"].includes(seed.status)
  )
    throw new Error("Invalid native workout clock.")
  if (seed.status === "paused" && !Number.isFinite(seed.pausedAt))
    throw new Error("Invalid native pause time.")
  return {
    ...session,
    status: seed.status,
    pausedAt: seed.pausedAt,
    pausedDurationMs: seed.pausedDurationMs,
  }
}
/** Checkpoint the replay cursor together with totals, so replay cannot double-count. */
let nativeOperations: Promise<unknown> = Promise.resolve()
let nativeGeneration = 0
export class NativeEnduranceRecorder<S extends ReplayableSession> {
  private disposed = false
  private generation = nativeGeneration
  private isDetached() {
    return this.disposed || this.generation !== nativeGeneration
  }
  constructor(
    private plugin: NativeRecorderPlugin,
    private get: () => S,
    private set: (session: S) => void,
    private decode: (raw: string) => S | null,
    private report: (message: string) => void
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = nativeOperations.then(work)
    nativeOperations = next.catch(() => {})
    return next
  }
  private seed(state: NativeRecorderState): S {
    const value = state.seed ? this.decode(state.seed) : null
    if (!value || value.id !== state.sessionId)
      throw new Error(
        "The native workout backup could not be recovered. Keep it on this device."
      )
    return value
  }
  attach() {
    return this.serial(async () => {
      let state = await this.plugin.getState()
      if (this.isDetached()) return
      if (state.active) {
        const stored = this.seed(state),
          current = this.get()
        this.set(
          stored.id !== current.id ||
            (stored.nativeCursor ?? 0) > (current.nativeCursor ?? 0)
            ? stored
            : nativeClock(current, stored)
        )
      } else {
        const current = this.get()
        state = await this.plugin.start({
          sessionId: current.id,
          seed: JSON.stringify(current),
        })
        if (this.isDetached()) return
        this.set(this.seed(state))
      }
      await this.drain()
    })
  }
  private async drain(): Promise<S> {
    let more = true
    while (more && !this.isDetached()) {
      const current = this.get()
      const batch = await this.plugin.read({
        sessionId: current.id,
        cursor: current.nativeCursor ?? 0,
      })
      if (this.isDetached()) break
      const clock = this.seed(batch)
      let base = this.get()
      if ((clock.nativeCursor ?? 0) > (base.nativeCursor ?? 0)) base = clock
      const next = nativeClock(replayNativeBatch(base, batch), clock)
      await this.plugin.checkpoint({
        sessionId: next.id,
        seed: JSON.stringify(next),
      })
      if (this.isDetached()) break
      this.set({
        ...this.get(),
        points: next.points,
        distanceMeters: next.distanceMeters,
        elevationGainMeters: next.elevationGainMeters,
        nativeCursor: next.nativeCursor,
        nativeLastPoint: next.nativeLastPoint,
        nativeElevationAnchor: next.nativeElevationAnchor,
        status: next.status,
        pausedAt: next.pausedAt,
        pausedDurationMs: next.pausedDurationMs,
      })
      this.report(batch.error ?? "")
      if (batch.hasMore && batch.nextCursor <= (current.nativeCursor ?? 0))
        throw new Error("The native route replay stopped making progress.")
      more = batch.hasMore
    }
    return this.get()
  }
  sync() {
    return this.serial(() => this.drain())
  }
  control(command: "pause" | "resume" | "stop") {
    return this.serial(async () => {
      if (this.isDetached()) throw new Error("The native recorder was closed.")
      const state = await this.plugin[command]({ sessionId: this.get().id })
      this.set(nativeClock(this.get(), this.seed(state)))
      return await this.drain()
    })
  }
  clear() {
    return this.serial(async () => {
      await this.plugin.clear({ sessionId: this.get().id })
      this.disposed = true
    })
  }
  detach() {
    this.disposed = true
  }
}
export async function resetNativeEndurance(plugin: NativeRecorderPlugin) {
  nativeGeneration++
  const reset = nativeOperations.then(() => plugin.reset())
  nativeOperations = reset.catch(() => {})
  await reset
}
export async function clearNativeEnduranceOnSignOut() {
  if (hasNativeEndurance()) await resetNativeEndurance(nativeRecorder)
}
