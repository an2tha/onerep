import { App as CapacitorApp } from "@capacitor/app"
import {
  hasNativeEndurance,
  isNativeEnduranceShell,
  nativeRecorder,
  resetNativeEndurance,
  NativeEnduranceRecorder,
} from "@/lib/native-endurance"
import {
  acceptGpsPoint,
  distanceToTrail,
  appendRoutePoint,
  elevationStep,
} from "@/lib/hiking-tracking"
import {
  validateTrailPoints,
  type TrailPoint,
} from "../../../../convex/lib/trailGeometry"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  CaretRight,
  Flag,
  Fire,
  Heart,
  MapPin,
  Pause,
  Play,
  Stop,
  WarningCircle,
} from "@phosphor-icons/react"
import { PrimaryButton, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { EnduranceRouteMap } from "@/components/endurance-route-map"
import { ReactiveOrbField } from "@/components/reactive-orb-field"
import "@/styles/endurance-workout.css"
import { EnduranceHeartRateChart } from "@/components/endurance-heart-rate-chart"
import { MobileSheet } from "@/components/mobile-sheet"
import { saveWorkoutToHealth } from "@/lib/health-provider"
import { formatElapsed } from "@/lib/workout-logging"
import {
  distanceUnitForSystem,
  formatDistanceForUnit,
  formatElevationForSystem,
  formatPaceForUnit,
  formatSpeedForUnit,
} from "@/lib/measurement-system"
import { useMeasurementSystem } from "@/lib/use-measurement-system"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import {
  ACTIVE_ENDURANCE_KEY,
  SELECTED_TRAIL_KEY,
  type EnduranceEnvironment,
  type EnduranceHeartRateSample,
} from "@/lib/endurance-workout"
import {
  commandEnduranceWatch,
  onWatchAction,
  watchAvailability,
} from "@/lib/watch-sync"
import {
  cn,
  createClientId,
  localDateKey,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/utils"

type Sport = "run" | "ride" | "swim" | "hike" | "walk" | "trail_run" | "row"
type SessionStatus = "recording" | "paused"
type GpsState =
  "locating" | "locked" | "unavailable" | "denied" | "paused" | "indoor"

type RoutePoint = {
  latitude: number
  longitude: number
  altitude: number | null
  accuracy?: number
  altitudeAccuracy?: number | null
  segmentStart?: boolean
  timestamp: number
}

type EnduranceLap = {
  distanceMeters: number
  elapsedSeconds: number
}

type EnduranceSession = {
  version: 1
  title?: string
  nativeCursor?: number
  nativeLastPoint?: RoutePoint | null
  nativeElevationAnchor?: number | null
  plannedTrail?: { name: string; points: TrailPoint[] }
  id: string
  sport: Sport
  environment: EnduranceEnvironment
  startedAt: number
  pausedAt?: number
  pausedDurationMs: number
  status: SessionStatus
  points: RoutePoint[]
  distanceMeters: number
  elevationGainMeters: number
  laps: EnduranceLap[]
  heartRateSamples: EnduranceHeartRateSample[]
  currentHeartRateBpm?: number
  averageHeartRateBpm?: number
  maxHeartRateBpm?: number
  activeCalories?: number
}

const MAX_ROUTE_POINTS = 4_000
const MAX_HEART_RATE_SAMPLES = 900

const SPORT_META = {
  hike: { label: "Hike", metric: "Avg pace" },
  walk: { label: "Walk", metric: "Avg pace" },
  trail_run: { label: "Trail run", metric: "Avg pace" },
  row: { label: "Row", metric: "Avg pace" },
  run: {
    label: "Run",
    metric: "Avg pace",
  },
  ride: {
    label: "Ride",
    metric: "Avg speed",
  },
  swim: {
    label: "Swim",
    metric: "Avg pace",
  },
} as const

function isSport(value: string | null): value is Sport {
  return ["run", "ride", "swim", "hike", "walk", "trail_run", "row"].includes(
    value ?? ""
  )
}

function isEnvironment(value: string | null): value is EnduranceEnvironment {
  return value === "outdoor" || value === "indoor"
}

function createSession(
  sport: Sport,
  environment: EnduranceEnvironment
): EnduranceSession {
  return {
    version: 1,
    id: createClientId(),
    sport,
    environment,
    startedAt: Date.now(),
    pausedDurationMs: 0,
    status: "recording",
    points: [],
    distanceMeters: 0,
    elevationGainMeters: 0,
    laps: [],
    heartRateSamples: [],
  }
}

function loadSession(): EnduranceSession | null {
  const raw = safeLocalStorageGet(ACTIVE_ENDURANCE_KEY)
  return raw ? decodeSession(raw) : null
}

function decodeSession(raw: string): EnduranceSession | null {
  try {
    const value = JSON.parse(raw) as Partial<EnduranceSession>
    if (
      value.version !== 1 ||
      !isSport(value.sport ?? null) ||
      typeof value.id !== "string" ||
      typeof value.startedAt !== "number" ||
      (value.status !== "recording" && value.status !== "paused")
    ) {
      return null
    }
    return {
      ...createSession(
        value.sport,
        isEnvironment(value.environment ?? null) ? value.environment : "outdoor"
      ),
      ...value,
      points: Array.isArray(value.points) ? value.points : [],
      laps: Array.isArray(value.laps) ? value.laps : [],
      heartRateSamples: Array.isArray(value.heartRateSamples)
        ? value.heartRateSamples.slice(-MAX_HEART_RATE_SAMPLES)
        : [],
      pausedDurationMs: value.pausedDurationMs ?? 0,
      distanceMeters: value.distanceMeters ?? 0,
      elevationGainMeters: value.elevationGainMeters ?? 0,
    }
  } catch {
    return null
  }
}

function elapsedSeconds(session: EnduranceSession, now: number) {
  const end = session.status === "paused" ? (session.pausedAt ?? now) : now
  return Math.max(
    0,
    Math.floor((end - session.startedAt - session.pausedDurationMs) / 1_000)
  )
}

function formatDistance(meters: number, unit: "km" | "mi") {
  return formatDistanceForUnit(meters, unit)
}

function formatPace(
  distanceMeters: number,
  durationSeconds: number,
  unit: "km" | "mi"
) {
  if (distanceMeters < 10 || durationSeconds <= 0) return "—"
  return formatPaceForUnit(durationSeconds / (distanceMeters / 1_000), unit)
}

function formatSpeed(
  distanceMeters: number,
  durationSeconds: number,
  unit: "km" | "mi"
) {
  if (distanceMeters < 10 || durationSeconds <= 0) return "—"
  return formatSpeedForUnit(distanceMeters, durationSeconds, unit)
}

function defaultTitle(sport: Sport) {
  const hour = new Date().getHours()
  const time = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
  return `${time} ${SPORT_META[sport].label.toLowerCase()}`
}

function GpsStatus({ state }: { state: GpsState }) {
  const label = {
    locating: "Acquiring GPS",
    locked: "GPS locked",
    unavailable: "GPS unavailable",
    denied: "Location off",
    paused: "GPS paused",
    indoor: "Indoor",
  }[state]

  return (
    <p
      className="endurance-glass flex shrink-0 items-center gap-2.5 rounded-[12px] border px-3.5 py-2 text-[13px] font-extrabold tracking-[-0.02em] text-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "size-2.5 rounded-full",
          state === "locked"
            ? "bg-emerald-500"
            : state === "indoor"
              ? "bg-[#f5f7f4]"
              : state === "locating"
                ? "animate-pulse bg-amber-400"
                : state === "paused"
                  ? "bg-zinc-500"
                  : "bg-red-500"
        )}
      />
      {label}
    </p>
  )
}

export default function ActiveEnduranceWorkout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedSport = searchParams.get("sport")
  const requestedEnvironment = searchParams.get("environment")
  const initialSport = isSport(requestedSport) ? requestedSport : "run"
  const initialEnvironment = isEnvironment(requestedEnvironment)
    ? requestedEnvironment
    : "outdoor"
  const [session, renderSession] = useState<EnduranceSession>(() => {
    const saved = loadSession()
    if (saved) return saved
    const fresh = createSession(initialSport, initialEnvironment)
    if (searchParams.get("trail") === "selected" && initialSport === "hike") {
      try {
        const trail = JSON.parse(
          safeLocalStorageGet(SELECTED_TRAIL_KEY) ?? "null"
        )
        if (trail && typeof trail.name === "string") {
          validateTrailPoints(trail.points)
          fresh.plannedTrail = {
            name: trail.name.slice(0, 120),
            points: trail.points,
          }
        }
      } catch {
        /* A stale trail draft must not prevent recording. */
      }
    }
    return fresh
  })
  const sessionRef = useRef(session)
  const setSession = useCallback((update: SetStateAction<EnduranceSession>) => {
    const next =
      typeof update === "function" ? update(sessionRef.current) : update
    sessionRef.current = next
    renderSession(next)
  }, [])
  const nativeAvailable = hasNativeEndurance()
  const usesNativeGps = nativeAvailable && session.environment === "outdoor"
  const nativeRef = useRef<NativeEnduranceRecorder<EnduranceSession> | null>(
    null
  )
  const [nativeReady, setNativeReady] = useState(!nativeAvailable)
  const [nativeBusy, setNativeBusy] = useState(false)
  const [nativeError, setNativeError] = useState("")
  const [now, setNow] = useState(Date.now)
  const [gpsState, setGpsState] =
    useState<Exclude<GpsState, "paused" | "indoor">>("locating")
  const [gpsAttempt, setGpsAttempt] = useState(0)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [heartRateOpen, setHeartRateOpen] = useState(false)
  const [watchState, setWatchState] = useState<
    "checking" | "connected" | "waiting" | "unavailable"
  >("checking")
  const [watchContributed, setWatchContributed] = useState(false)
  const [title, setTitle] = useState(
    () =>
      session.title ?? session.plannedTrail?.name ?? defaultTitle(session.sport)
  )
  const [saving, setSaving] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const endedRef = useRef(false)
  const preferences = useQuery(api.users.users.getPreferences)
  const { system: measurementSystem } = useMeasurementSystem()
  const distanceUnit = distanceUnitForSystem(measurementSystem)
  const recordWorkout = useMutation(
    api.logs.healthWorkouts.recordEnduranceWorkout
  )
  const latestPointRef = useRef<RoutePoint | null>(null)
  const elevationAnchor = useRef<number | null>(null)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)

  const trailOffset = useMemo(() => {
    const last = session.points.at(-1)
    return last && session.plannedTrail
      ? distanceToTrail(last, session.plannedTrail.points)
      : null
  }, [session.points, session.plannedTrail])
  const elapsed = elapsedSeconds(session, now)
  const meta = SPORT_META[session.sport]
  const averageMetric =
    session.sport === "ride"
      ? formatSpeed(session.distanceMeters, elapsed, distanceUnit)
      : formatPace(session.distanceMeters, elapsed, distanceUnit)
  const previousLapElapsed = session.laps.at(-1)?.elapsedSeconds ?? 0
  const currentLapElapsed = Math.max(0, elapsed - previousLapElapsed)

  useEffect(() => {
    if (!nativeAvailable) return
    let disposed = false
    let recorder: NativeEnduranceRecorder<EnduranceSession> | null = null
    let attached = false
    let listener: { remove(): Promise<void> } | undefined
    const reportError = (error: unknown) => {
      if (!disposed)
        setNativeError(
          error instanceof Error
            ? error.message
            : "Native route recording failed. Retry to recover your route."
        )
    }
    setNativeReady(false)
    setNativeBusy(true)
    const sync = () => {
      if (attached && document.visibilityState === "visible" && recorder)
        void recorder
          .sync()
          .then(() => {
            if (disposed) return
            const last = sessionRef.current.nativeLastPoint
            if (last) {
              setGpsAccuracy(last.accuracy ?? null)
              setGpsState(
                Date.now() - last.timestamp < 30000 ? "locked" : "locating"
              )
            }
          })
          .catch(reportError)
    }
    void (async () => {
      const stored = await nativeRecorder.getState()
      if (disposed) return
      if (!stored.active && sessionRef.current.environment === "indoor") {
        setNativeReady(true)
        return
      }
      recorder = new NativeEnduranceRecorder<EnduranceSession>(
        nativeRecorder,
        () => sessionRef.current,
        setSession,
        decodeSession,
        (message) => {
          if (!disposed) setNativeError(message)
        }
      )
      nativeRef.current = recorder
      await recorder.attach()
      if (disposed) return
      attached = true
      const recovered = sessionRef.current
      setTitle(
        recovered.title ??
          recovered.plannedTrail?.name ??
          defaultTitle(recovered.sport)
      )
      setNativeReady(true)
      sync()
    })()
      .catch((error) => {
        if (!disposed) {
          setSession((current) => ({
            ...current,
            status: "paused",
            pausedAt: current.pausedAt ?? Date.now(),
          }))
          reportError(error)
        }
      })
      .finally(() => {
        if (!disposed) setNativeBusy(false)
      })
    const timer = window.setInterval(sync, 5000)
    document.addEventListener("visibilitychange", sync)
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) sync()
    }).then((handle) => {
      if (disposed) void handle.remove()
      else listener = handle
    })
    return () => {
      disposed = true
      recorder?.detach()
      if (nativeRef.current === recorder) nativeRef.current = null
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", sync)
      void listener?.remove()
    }
  }, [nativeAvailable, gpsAttempt, setSession])

  // Browsers cannot collect GPS while suspended. Pause honestly instead of inflating elapsed time.
  useEffect(() => {
    if (usesNativeGps || session.environment === "indoor") return
    const onVisibility = () => {
      if (
        document.visibilityState === "hidden" &&
        sessionRef.current.status === "recording"
      ) {
        const next: EnduranceSession = {
          ...sessionRef.current,
          status: "paused",
          pausedAt: Date.now(),
        }
        safeLocalStorageSet(ACTIVE_ENDURANCE_KEY, JSON.stringify(next))
        setSession(next)
        latestPointRef.current = null
        void commandEnduranceWatch({
          command: "pause",
          sessionId: next.id,
          sport: next.sport,
          environment: next.environment,
          startedAt: next.startedAt,
        })
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [usesNativeGps, session.environment, setSession])

  useEffect(() => {
    if (nativeAvailable && !nativeReady) return
    let disposed = false
    let remove: (() => void) | undefined

    void watchAvailability()
      .then((availability) => {
        if (disposed || endedRef.current) return
        if (
          !availability.supported ||
          !availability.paired ||
          !availability.installed
        ) {
          setWatchState("unavailable")
          return
        }
        setWatchState(availability.reachable ? "connected" : "waiting")
        return commandEnduranceWatch({
          command: session.status === "paused" ? "pause" : "start",
          sessionId: session.id,
          sport: session.sport,
          environment: session.environment,
          startedAt: session.startedAt,
        }).then((delivery) => {
          if (!disposed)
            setWatchState(delivery.reachable ? "connected" : "waiting")
        })
      })
      .catch(() => {
        if (!disposed) setWatchState("unavailable")
      })

    void onWatchAction((event) => {
      if (disposed || endedRef.current) return
      if (
        (event.action === "enduranceMetrics" ||
          event.action === "enduranceFinished") &&
        event.payload.sessionId === session.id
      ) {
        const payload = event.payload
        setWatchState("connected")
        setWatchContributed(true)
        setSession((current) => {
          const bpm = payload.heartRateBpm
          const elapsedAtSample = Math.max(
            0,
            Math.round(
              payload.elapsedSeconds ?? elapsedSeconds(current, Date.now())
            )
          )
          const previousSample = current.heartRateSamples.at(-1)
          const shouldAppend =
            typeof bpm === "number" &&
            bpm >= 30 &&
            bpm <= 240 &&
            (!previousSample || elapsedAtSample > previousSample.elapsedSeconds)
          const recoveredSamples =
            event.action === "enduranceFinished" &&
            Array.isArray(payload.heartRateSamples)
              ? payload.heartRateSamples
                  .filter(
                    (sample) =>
                      Number.isFinite(sample.elapsedSeconds) &&
                      sample.elapsedSeconds >= 0 &&
                      Number.isFinite(sample.bpm) &&
                      sample.bpm >= 30 &&
                      sample.bpm <= 240
                  )
                  .slice(-MAX_HEART_RATE_SAMPLES)
              : []
          return {
            ...current,
            ...(typeof bpm === "number" && bpm > 0
              ? { currentHeartRateBpm: Math.round(bpm) }
              : {}),
            ...(typeof payload.averageHeartRateBpm === "number" &&
            payload.averageHeartRateBpm > 0
              ? { averageHeartRateBpm: Math.round(payload.averageHeartRateBpm) }
              : {}),
            ...(typeof payload.maxHeartRateBpm === "number" &&
            payload.maxHeartRateBpm > 0
              ? { maxHeartRateBpm: Math.round(payload.maxHeartRateBpm) }
              : {}),
            ...(typeof payload.activeCalories === "number"
              ? {
                  activeCalories: Math.max(
                    0,
                    Math.round(payload.activeCalories)
                  ),
                }
              : {}),
            heartRateSamples:
              recoveredSamples.length > 0
                ? recoveredSamples
                : shouldAppend
                  ? [
                      ...current.heartRateSamples,
                      { elapsedSeconds: elapsedAtSample, bpm: Math.round(bpm) },
                    ].slice(-MAX_HEART_RATE_SAMPLES)
                  : current.heartRateSamples,
            ...(event.action === "enduranceFinished"
              ? { status: "paused" as const, pausedAt: Date.now() }
              : {}),
          }
        })
        if (event.action === "enduranceFinished") {
          void nativeRef.current
            ?.control("stop")
            .catch((error) => setNativeError(String(error)))
          setFinishOpen(true)
        }
        return
      }

      if (
        event.action === "enduranceControl" &&
        event.payload.sessionId === session.id
      ) {
        if (nativeRef.current) {
          const command = event.payload.command
          void nativeRef.current
            .control(command === "end" ? "stop" : command)
            .catch((error) => setNativeError(String(error)))
          if (command === "end") setFinishOpen(true)
          return
        }
        if (event.payload.command === "end") {
          setSession((current) => ({
            ...current,
            status: "paused",
            pausedAt: Date.now(),
          }))
          setFinishOpen(true)
        } else if (event.payload.command === "pause") {
          setSession((current) =>
            current.status === "paused"
              ? current
              : { ...current, status: "paused", pausedAt: Date.now() }
          )
        } else {
          setSession((current) =>
            current.status === "recording"
              ? current
              : {
                  ...current,
                  status: "recording",
                  pausedDurationMs:
                    current.pausedDurationMs +
                    (current.pausedAt ? Date.now() - current.pausedAt : 0),
                  pausedAt: undefined,
                }
          )
        }
      }
    })
      .then((dispose) => {
        if (disposed) dispose()
        else remove = dispose
      })
      .catch(() => {})

    return () => {
      disposed = true
      remove?.()
    }
  }, [
    session.environment,
    session.id,
    session.sport,
    session.startedAt,
    session.status,
    nativeAvailable,
    nativeReady,
  ])

  useEffect(() => {
    if (!endedRef.current)
      setStorageError(
        !safeLocalStorageSet(ACTIVE_ENDURANCE_KEY, JSON.stringify(session))
      )
  }, [session])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (usesNativeGps || (nativeAvailable && !nativeReady)) return
    if (session.status !== "recording") return
    if (session.environment === "indoor") return
    if (!("geolocation" in navigator)) {
      setGpsState("unavailable")
      return
    }
    setGpsState("locating")
    let cancelled = false
    latestPointRef.current = null
    elevationAnchor.current = null
    const maximumSpeed =
      session.sport === "ride"
        ? 35
        : session.sport === "hike" || session.sport === "walk"
          ? 5
          : 15
    const watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (endedRef.current || cancelled) return
        if (
          !Number.isFinite(coords.latitude) ||
          !Number.isFinite(coords.longitude)
        )
          return
        setGpsAccuracy(coords.accuracy)
        // Coarse fixes can locate the user, but do not count toward the route.
        if (coords.accuracy > 250) {
          setGpsState("locating")
          return
        }
        setGpsState(coords.accuracy <= 50 ? "locked" : "locating")
        const accepted = acceptGpsPoint(
          latestPointRef.current,
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: coords.altitude,
            altitudeAccuracy: coords.altitudeAccuracy,
            accuracy: coords.accuracy,
            timestamp,
          },
          maximumSpeed
        )
        if (!accepted) return
        const elevation = elevationStep(elevationAnchor.current, accepted.point)
        elevationAnchor.current = elevation.anchor
        latestPointRef.current = accepted.point
        setSession((current) =>
          current.status !== "recording"
            ? current
            : {
                ...current,
                points: appendRoutePoint(
                  current.points,
                  accepted.point,
                  MAX_ROUTE_POINTS
                ),
                distanceMeters: current.distanceMeters + accepted.distance,
                elevationGainMeters:
                  current.elevationGainMeters + elevation.gain,
              }
        )
      },
      (error) => {
        if (cancelled) return
        if (error.code === error.PERMISSION_DENIED) {
          setGpsState("denied")
        } else if (error.code === error.TIMEOUT) {
          setGpsState("locating")
        } else {
          setGpsState("unavailable")
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 }
    )
    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [
    gpsAttempt,
    session.environment,
    session.sport,
    session.status,
    usesNativeGps,
    nativeAvailable,
    nativeReady,
  ])

  async function pause() {
    if (usesNativeGps && nativeRef.current) {
      setNativeBusy(true)
      try {
        await nativeRef.current.control("pause")
      } catch (error) {
        setNativeError(
          error instanceof Error
            ? error.message
            : "Couldn't pause native tracking."
        )
        return false
      } finally {
        setNativeBusy(false)
      }
    }
    hapticMedium()
    latestPointRef.current = null
    void commandEnduranceWatch({
      command: "pause",
      sessionId: session.id,
      sport: session.sport,
      environment: session.environment,
      startedAt: session.startedAt,
    })
    setSession((current) => ({
      ...current,
      status: "paused",
      pausedAt: Date.now(),
    }))
    return true
  }

  async function resume() {
    if (usesNativeGps && nativeRef.current) {
      setNativeBusy(true)
      try {
        await nativeRef.current.control("resume")
      } catch (error) {
        setNativeError(
          error instanceof Error
            ? error.message
            : "Couldn't resume native tracking."
        )
        return
      } finally {
        setNativeBusy(false)
      }
    }
    hapticMedium()
    latestPointRef.current = null
    void commandEnduranceWatch({
      command: "resume",
      sessionId: session.id,
      sport: session.sport,
      environment: session.environment,
      startedAt: session.startedAt,
    })
    setSession((current) => ({
      ...current,
      status: "recording",
      pausedDurationMs:
        current.pausedDurationMs +
        (current.pausedAt ? Date.now() - current.pausedAt : 0),
      pausedAt: undefined,
    }))
  }

  function addLap() {
    hapticTap()
    setSession((current) => ({
      ...current,
      laps: [
        ...current.laps,
        {
          distanceMeters: current.distanceMeters,
          elapsedSeconds: elapsedSeconds(current, Date.now()),
        },
      ],
    }))
    toast.success(`Lap ${session.laps.length + 1} marked.`)
  }

  async function finish() {
    if (saving) return
    setSaving(true)
    try {
      const session =
        usesNativeGps && nativeRef.current
          ? await nativeRef.current.control("stop")
          : sessionRef.current
      const endedAt = Date.now()
      void commandEnduranceWatch({
        command: "end",
        sessionId: session.id,
        sport: session.sport,
        environment: session.environment,
        startedAt: session.startedAt,
      })
      await recordWorkout({
        externalId: session.id,
        sport: session.sport,
        environment: session.environment,
        date: localDateKey(new Date(session.startedAt)),
        startedAt: session.startedAt,
        endedAt,
        durationSeconds: elapsedSeconds(session, endedAt),
        totalDistanceMeters: session.distanceMeters,
        hasRoute: session.points.length > 1,
        ...(session.points.length > 1
          ? {
              routePoints: session.points.map(
                ({ latitude, longitude, altitude, segmentStart }) => ({
                  latitude,
                  longitude,
                  altitude,
                  ...(segmentStart ? { segmentStart } : {}),
                })
              ),
            }
          : {}),
        elevationGainMeters: session.elevationGainMeters,
        routeName: title,
        ...(session.averageHeartRateBpm
          ? { avgHeartRateBpm: session.averageHeartRateBpm }
          : {}),
        ...(session.maxHeartRateBpm
          ? { maxHeartRateBpm: session.maxHeartRateBpm }
          : {}),
        ...(session.activeCalories !== undefined
          ? { activeEnergyKcal: session.activeCalories }
          : {}),
        heartRateSamples: session.heartRateSamples,
      })
      if (preferences?.healthSync?.writeEnabled && !watchContributed) {
        await saveWorkoutToHealth({
          startedAt: session.startedAt,
          endedAt,
          title,
          sport: session.sport,
          environment: session.environment,
          distanceMeters: session.distanceMeters,
          activeEnergyKcal: session.activeCalories,
          heartRateSamples: session.heartRateSamples.map((sample) => ({
            timestamp: session.startedAt + sample.elapsedSeconds * 1_000,
            bpm: sample.bpm,
          })),
        })
      }
      if (usesNativeGps && nativeRef.current) await nativeRef.current.clear()
      endedRef.current = true
      safeLocalStorageRemove(ACTIVE_ENDURANCE_KEY)
      hapticSelection()
      toast.success(`${meta.label} saved.`)
      navigate("/endurance", { replace: true })
    } catch {
      toast.error("Couldn't save this workout. Your recording is still safe.")
      setSaving(false)
    }
  }

  async function discard() {
    if (endedRef.current) return
    if (nativeAvailable) {
      setNativeBusy(true)
      try {
        await resetNativeEndurance(nativeRecorder)
      } catch (error) {
        setNativeError(
          error instanceof Error
            ? error.message
            : "Couldn't stop recording. Retry before discarding."
        )
        return
      } finally {
        setNativeBusy(false)
      }
    }
    endedRef.current = true
    void commandEnduranceWatch({
      command: "discard",
      sessionId: session.id,
      sport: session.sport,
      environment: session.environment,
      startedAt: session.startedAt,
    })
    safeLocalStorageRemove(ACTIVE_ENDURANCE_KEY)
    hapticSelection()
    navigate("/endurance", { replace: true })
  }

  return (
    <div className="active-workout-atmosphere endurance-workout min-h-svh bg-background text-foreground lg:grid lg:h-svh lg:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)] lg:overflow-hidden">
      <ReactiveOrbField className="active-workout-wash" />
      <section className="relative z-[1] h-[46svh] min-h-[330px] lg:h-full">
        {session.environment === "outdoor" ? (
          <EnduranceRouteMap
            points={session.points}
            plannedPoints={session.plannedTrail?.points}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <p className="text-xl font-bold">
              Indoor {meta.label.toLowerCase()}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Timing and laps are active. GPS is off.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setLeaveOpen(true)}
          aria-label="Leave active workout"
          className="motion-tactile endurance-glass absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex size-11 items-center justify-center rounded-full text-foreground"
        >
          <ArrowLeft size={19} weight="bold" />
        </button>
      </section>

      <main className="endurance-glass relative z-10 mt-0 min-h-[54svh] rounded-t-[16px] border-t border-border px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:mt-0 lg:flex lg:min-h-0 lg:flex-col lg:justify-center lg:overflow-y-auto lg:rounded-none lg:border-t-0 lg:border-l lg:px-10">
        {session.environment === "outdoor" && session.sport === "hike" && (
          <div className="mb-4 rounded-xl border border-border bg-background p-4 text-sm">
            {session.plannedTrail && (
              <p className="mb-2 font-semibold">
                Following {session.plannedTrail.name} · purple dashed route
              </p>
            )}
            {trailOffset != null && trailOffset > 50 && (
              <p role="status" className="mb-2 font-semibold">
                About {Math.round(trailOffset)} m from the planned trail. Check
                the map to rejoin it.
              </p>
            )}

            <p className="text-muted-foreground">
              {gpsAccuracy == null
                ? "Waiting for a precise location…"
                : `GPS accuracy ±${Math.round(gpsAccuracy)} m${gpsAccuracy > 50 ? " · Waiting for a better signal before recording points" : ""}`}
            </p>
          </div>
        )}

        {session.environment === "outdoor" && (
          <div className="mb-4 rounded-xl border border-border p-4 text-sm">
            <p className="font-semibold">
              {usesNativeGps
                ? nativeReady
                  ? "Native background GPS"
                  : "Preparing native GPS…"
                : "Foreground GPS"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {usesNativeGps
                ? "Your route is recorded on this device with the screen locked or another app open. Pause or finish to stop location tracking."
                : isNativeEnduranceShell()
                  ? "Update the native app for background tracking. This version pauses outdoor workouts when the app is hidden."
                  : "Keep this page visible while recording. Outdoor workouts pause automatically when you switch away."}
            </p>
            {nativeError && (
              <p role="alert" className="mt-2">
                {nativeError}
              </p>
            )}
            {nativeAvailable && !nativeReady && !nativeBusy && (
              <button
                type="button"
                onClick={() => setGpsAttempt((attempt) => attempt + 1)}
                className="mt-3 min-h-11 rounded-lg border border-border px-4 font-semibold"
              >
                Retry native tracking
              </button>
            )}
          </div>
        )}
        {storageError && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-border p-4 text-sm"
          >
            Device backup is unavailable. Keep this screen open and finish the
            workout to save it to your account.
          </p>
        )}
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[16px] font-bold tracking-tight">
              {meta.label}
            </h1>
            {session.laps.length > 0 && (
              <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                Lap {session.laps.length + 1}
              </p>
            )}
          </div>
          <GpsStatus
            state={
              session.environment === "indoor"
                ? "indoor"
                : session.status === "paused"
                  ? "paused"
                  : gpsState
            }
          />
        </header>

        {session.environment === "outdoor" &&
          (gpsState === "denied" || gpsState === "unavailable") && (
            <div className="mt-4 flex items-center gap-3 border-y border-border py-3 text-[12px] leading-5 text-muted-foreground">
              <WarningCircle
                size={18}
                className="mt-0.5 shrink-0"
                weight="bold"
              />
              <p className="min-w-0 flex-1">
                {gpsState === "denied"
                  ? "Allow location access in your browser settings, then try again. Timing continues."
                  : "GPS cannot get a position right now. Check your connection and try again."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setGpsState("locating")
                  setGpsAttempt((attempt) => attempt + 1)
                }}
                className="motion-tactile shrink-0 rounded-[10px] border border-border px-3 py-2 font-bold text-foreground"
              >
                Try again
              </button>
            </div>
          )}

        <section className="mt-8 lg:mt-12" aria-label="Live workout statistics">
          <p
            className="text-[clamp(4rem,8vw,6rem)] leading-[0.82] font-bold tracking-[-0.04em] tabular-nums"
            aria-label={`Elapsed time ${formatElapsed(elapsed)}`}
          >
            {formatElapsed(elapsed)}
          </p>
          <p className="mt-3 text-[12px] font-semibold text-muted-foreground">
            Moving time
          </p>

          <div className="mt-8">
            <p className="text-[12px] font-semibold text-muted-foreground">
              {session.environment === "indoor" ? "Current lap" : "Distance"}
            </p>
            <p className="mt-1 text-[clamp(3rem,6vw,5rem)] leading-none font-bold tracking-[-0.04em] tabular-nums">
              {session.environment === "indoor"
                ? session.laps.length + 1
                : formatDistance(session.distanceMeters, distanceUnit)}
            </p>
          </div>

          {session.environment === "indoor" ? (
            <div className="mt-8 border-t border-border py-4">
              <p className="text-[12px] font-semibold text-muted-foreground">
                Lap time
              </p>
              <p className="mt-1 text-[20px] font-bold tracking-tight tabular-nums">
                {formatElapsed(currentLapElapsed)}
              </p>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-2 border-t border-border">
              <div className="py-4 pr-4">
                <p className="text-[12px] font-semibold text-muted-foreground">
                  {meta.metric}
                </p>
                <p className="mt-1 text-[20px] font-bold tracking-tight tabular-nums">
                  {averageMetric}
                </p>
              </div>
              <div className="border-l border-border py-4 pl-5">
                <p className="text-[12px] font-semibold text-muted-foreground">
                  Elevation
                </p>
                <p className="mt-1 text-[20px] font-bold tracking-tight tabular-nums">
                  {formatElevationForSystem(
                    session.elevationGainMeters,
                    measurementSystem
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 border-t border-border">
            <button
              type="button"
              onClick={() => setHeartRateOpen(true)}
              className="motion-tactile flex min-h-[68px] items-center gap-3 py-3 pr-4 text-left"
              aria-label="Open heart rate graph"
            >
              <Heart size={18} weight="fill" className="text-red-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-muted-foreground">
                  Heart rate
                </span>
                <span className="mt-0.5 block text-[18px] font-bold tabular-nums">
                  {session.currentHeartRateBpm
                    ? `${session.currentHeartRateBpm} bpm`
                    : "—"}
                </span>
              </span>
              <CaretRight size={14} className="text-muted-foreground" />
            </button>
            <div className="flex min-h-[68px] items-center gap-3 border-l border-border py-3 pl-5">
              <Fire size={18} weight="fill" className="text-orange-500" />
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Active calories
                </p>
                <p className="mt-0.5 text-[18px] font-bold tabular-nums">
                  {session.activeCalories !== undefined
                    ? `${session.activeCalories} kcal`
                    : "—"}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {watchState === "connected"
              ? "Apple Watch live"
              : watchState === "waiting"
                ? "Open OneRep on Apple Watch for live heart rate and calories."
                : watchState === "checking"
                  ? "Checking Apple Watch…"
                  : "No live heart-rate sensor connected."}
          </p>
        </section>

        <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4 lg:mt-10">
          <button
            type="button"
            onClick={addLap}
            className="motion-tactile flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-border text-[13px] font-bold"
          >
            <Flag size={17} weight="bold" />
            Lap
          </button>

          <button
            type="button"
            onClick={session.status === "recording" ? pause : resume}
            aria-label={
              session.status === "recording"
                ? "Pause workout"
                : "Resume workout"
            }
            className="motion-tactile flex size-[78px] items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          >
            {session.status === "recording" ? (
              <Pause size={30} weight="fill" />
            ) : (
              <Play size={30} weight="fill" />
            )}
          </button>

          <button
            type="button"
            disabled={
              session.status === "recording" ||
              nativeBusy ||
              (usesNativeGps && !nativeReady)
            }
            onClick={() => setFinishOpen(true)}
            className="motion-tactile flex min-h-12 items-center justify-center gap-2 rounded-[12px] border border-border text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Stop size={17} weight="fill" />
            Finish
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {session.status === "recording"
            ? "Pause the workout before finishing."
            : "Ready to save, or resume to keep moving."}
        </p>
      </main>

      {heartRateOpen && (
        <MobileSheet
          ariaLabel="Heart rate graph"
          onClose={() => setHeartRateOpen(false)}
          panelClassName="mx-auto w-full sm:max-w-[520px]"
          overlayClassName="bg-black/65"
        >
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
            <div className="flex items-start justify-between gap-5">
              <div>
                <h2 className="text-[22px] font-bold tracking-tight">
                  Heart rate
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Live from Apple Watch
                </p>
              </div>
              <p className="text-[28px] font-bold tabular-nums">
                {session.currentHeartRateBpm
                  ? `${session.currentHeartRateBpm} bpm`
                  : "—"}
              </p>
            </div>

            <div className="mt-6">
              <EnduranceHeartRateChart
                samples={session.heartRateSamples}
                elapsedSeconds={elapsed}
              />
            </div>

            <dl className="mt-5 grid grid-cols-2 divide-x divide-border border-y border-border">
              <div className="py-3 pr-4">
                <dt className="text-[11px] font-semibold text-muted-foreground">
                  Average
                </dt>
                <dd className="mt-0.5 text-[18px] font-bold tabular-nums">
                  {session.averageHeartRateBpm
                    ? `${session.averageHeartRateBpm} bpm`
                    : "—"}
                </dd>
              </div>
              <div className="py-3 pl-5">
                <dt className="text-[11px] font-semibold text-muted-foreground">
                  Maximum
                </dt>
                <dd className="mt-0.5 text-[18px] font-bold tabular-nums">
                  {session.maxHeartRateBpm
                    ? `${session.maxHeartRateBpm} bpm`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </MobileSheet>
      )}

      {finishOpen && (
        <MobileSheet
          ariaLabel="Finish endurance workout"
          onClose={() => {
            if (!saving) setFinishOpen(false)
          }}
          closeOnBackdrop={!saving}
          panelClassName="mx-auto w-full sm:max-w-[400px]"
          overlayClassName="bg-black/65"
        >
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
            <div>
              <h2 className="text-[22px] font-bold tracking-tight">
                Finish {meta.label.toLowerCase()}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {session.environment === "indoor"
                  ? formatElapsed(elapsed)
                : `${formatDistance(session.distanceMeters, distanceUnit)} · ${formatElapsed(elapsed)}`}
              </p>
            </div>

            <label className="mt-5 block">
              <span className="text-[12px] font-bold text-muted-foreground">
                Activity title
              </span>
              <input
                value={title}
                maxLength={120}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setSession((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }}
                className="mt-2 h-12 w-full rounded-[10px] border border-border bg-background px-3 text-[15px] font-semibold outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/15"
              />
            </label>

            <PrimaryButton
              onClick={() => void finish()}
              disabled={saving || nativeBusy}
              className="mt-5 h-12 w-full"
            >
              {saving ? "Saving activity…" : "Save activity"}
            </PrimaryButton>
          </div>
        </MobileSheet>
      )}

      {leaveOpen && (
        <MobileSheet
          ariaLabel="Leave active workout"
          onClose={() => setLeaveOpen(false)}
          panelClassName="mx-auto w-full sm:max-w-[400px]"
          overlayClassName="bg-black/65"
        >
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
            <div className="flex items-start gap-3">
              <MapPin size={22} className="mt-0.5 shrink-0" weight="bold" />
              <div>
                <h2 className="text-[20px] font-bold tracking-tight">
                  Leave this workout?
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  Your recording is saved on this device. You can return and
                  continue from the Endurance tab.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={nativeBusy}
              onClick={async () => {
                if (
                  sessionRef.current.status === "recording" &&
                  !(await pause())
                )
                  return
                navigate("/endurance")
              }}
              className="motion-tactile mt-5 h-12 w-full rounded-[10px] bg-foreground text-[14px] font-bold text-background"
            >
              Save and leave
            </button>
            <button
              type="button"
              disabled={nativeBusy}
              onClick={discard}
              className="motion-tactile mt-2 h-12 w-full rounded-[10px] text-[14px] font-bold text-destructive"
            >
              Abort workout
            </button>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
