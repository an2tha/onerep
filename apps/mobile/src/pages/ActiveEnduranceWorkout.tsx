import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  CaretRight,
  Crosshair,
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
import { EnduranceHeartRateChart } from "@/components/endurance-heart-rate-chart"
import { MobileSheet } from "@/components/mobile-sheet"
import { saveWorkoutToHealth } from "@/lib/health-provider"
import { formatElapsed } from "@/lib/workout-logging"
import { hapticMedium, hapticSelection, hapticTap } from "@/lib/haptics"
import {
  ACTIVE_ENDURANCE_KEY,
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

type Sport = "run" | "ride" | "swim"
type SessionStatus = "recording" | "paused"
type GpsState =
  | "locating"
  | "locked"
  | "unavailable"
  | "denied"
  | "paused"
  | "indoor"

type RoutePoint = {
  latitude: number
  longitude: number
  altitude: number | null
  accuracy?: number
  timestamp: number
}

type EnduranceLap = {
  distanceMeters: number
  elapsedSeconds: number
}

type EnduranceSession = {
  version: 1
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
  return value === "run" || value === "ride" || value === "swim"
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
  if (!raw) return null
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

function radians(value: number) {
  return (value * Math.PI) / 180
}

function distanceBetween(a: RoutePoint, b: RoutePoint) {
  const earthRadius = 6_371_000
  const latitudeDelta = radians(b.latitude - a.latitude)
  const longitudeDelta = radians(b.longitude - a.longitude)
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function elapsedSeconds(session: EnduranceSession, now: number) {
  const end = session.status === "paused" ? (session.pausedAt ?? now) : now
  return Math.max(
    0,
    Math.floor((end - session.startedAt - session.pausedDurationMs) / 1_000)
  )
}

function formatDistance(meters: number) {
  if (meters < 1_000) return `${Math.round(meters)} m`
  return `${(meters / 1_000).toFixed(2)} km`
}

function formatPace(distanceMeters: number, durationSeconds: number) {
  if (distanceMeters < 10 || durationSeconds <= 0) return "—"
  const secondsPerKilometre = durationSeconds / (distanceMeters / 1_000)
  const minutes = Math.floor(secondsPerKilometre / 60)
  const seconds = Math.round(secondsPerKilometre % 60)
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`
}

function formatSpeed(distanceMeters: number, durationSeconds: number) {
  if (distanceMeters < 10 || durationSeconds <= 0) return "—"
  return `${((distanceMeters / durationSeconds) * 3.6).toFixed(1)} km/h`
}

function defaultTitle(sport: Sport) {
  const hour = new Date().getHours()
  const time = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
  return `${time} ${SPORT_META[sport].label.toLowerCase()}`
}

function projectRoute(points: RoutePoint[]) {
  if (points.length < 2) return ""
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.00001)
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.00001)
  return points
    .map((point, index) => {
      const x = 10 + ((point.longitude - minLongitude) / longitudeSpan) * 80
      const y = 90 - ((point.latitude - minLatitude) / latitudeSpan) * 80
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}

function RouteCanvas({
  points,
  gpsState,
}: {
  points: RoutePoint[]
  gpsState: GpsState
}) {
  const route = useMemo(() => projectRoute(points), [points])
  const locating = gpsState === "locating"
  const emptyCopy = {
    locating: {
      title: "Finding your position",
      body: "Keep OneRep open while GPS acquires a signal.",
    },
    locked: {
      title: "GPS locked",
      body: "Start moving and your route will appear here.",
    },
    unavailable: {
      title: "GPS unavailable",
      body: "Check your connection and try locating again.",
    },
    denied: {
      title: "Location access is off",
      body: "Allow location access to record distance and your route.",
    },
    paused: {
      title: "Workout paused",
      body: "Resume when you're ready to continue tracking.",
    },
    indoor: {
      title: "Indoor workout",
      body: "Timing and laps are active. GPS is off.",
    },
  }[gpsState]
  return (
    <div className="relative h-full min-h-[300px] overflow-hidden bg-[#dce4d9] text-[#18231b] dark:bg-[#17201a] dark:text-[#edf3eb]">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full opacity-45"
        aria-hidden="true"
      >
        <path
          d="M-8 20 C14 4 28 11 38 24 S61 47 110 17 M-12 36 C15 17 31 24 43 39 S72 57 108 35 M-9 83 C18 59 35 65 51 78 S78 92 112 66"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.32"
        />
        <path
          d="M8 0 C17 29 8 48 25 100 M73 -8 C61 20 75 39 64 61 S53 89 59 108 M91 -5 C78 18 91 40 83 58 S68 83 77 106"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.22"
          strokeDasharray="1.2 1.8"
        />
      </svg>

      {route ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full p-8"
          role="img"
          aria-label={`GPS route with ${points.length} recorded points`}
        >
          <path
            d={route}
            fill="none"
            stroke="rgba(255,255,255,.88)"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={route}
            fill="none"
            stroke="var(--accent-progress)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          {gpsState !== "indoor" && (
            <span className="relative flex size-20 items-center justify-center rounded-full border border-current/20 bg-background/70">
              <span
                className={cn(
                  "absolute size-12 rounded-full border border-current/25",
                  locating && "animate-ping"
                )}
              />
              <Crosshair size={26} weight="bold" />
            </span>
          )}
          <p
            className={cn(
              "text-[14px] font-bold",
              gpsState !== "indoor" && "mt-4"
            )}
          >
            {emptyCopy.title}
          </p>
          <p className="mt-1 max-w-[30ch] text-[12px] leading-5 opacity-65">
            {emptyCopy.body}
          </p>
        </div>
      )}
    </div>
  )
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
      className="flex shrink-0 items-center gap-2.5 rounded-[12px] border border-[#353a36] bg-[#111411] px-3.5 py-2 text-[13px] font-extrabold tracking-[-0.02em] text-[#f5f7f4] shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
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
  const [session, setSession] = useState<EnduranceSession>(
    () => loadSession() ?? createSession(initialSport, initialEnvironment)
  )
  const [now, setNow] = useState(Date.now)
  const [gpsState, setGpsState] = useState<
    Exclude<GpsState, "paused" | "indoor">
  >(
    "locating"
  )
  const [gpsAttempt, setGpsAttempt] = useState(0)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [heartRateOpen, setHeartRateOpen] = useState(false)
  const [watchState, setWatchState] = useState<
    "checking" | "connected" | "waiting" | "unavailable"
  >("checking")
  const [watchContributed, setWatchContributed] = useState(false)
  const [title, setTitle] = useState(() => defaultTitle(session.sport))
  const [saving, setSaving] = useState(false)
  const preferences = useQuery(api.users.users.getPreferences)
  const recordWorkout = useMutation(
    api.logs.healthWorkouts.recordEnduranceWorkout
  )
  const latestPointRef = useRef<RoutePoint | null>(
    session.points.at(-1) ?? null
  )

  const elapsed = elapsedSeconds(session, now)
  const meta = SPORT_META[session.sport]
  const averageMetric =
    session.sport === "ride"
      ? formatSpeed(session.distanceMeters, elapsed)
      : formatPace(session.distanceMeters, elapsed)
  const previousLapElapsed = session.laps.at(-1)?.elapsedSeconds ?? 0
  const currentLapElapsed = Math.max(0, elapsed - previousLapElapsed)

  useEffect(() => {
    let disposed = false
    let remove: (() => void) | undefined

    void watchAvailability()
      .then((availability) => {
        if (disposed) return
        if (!availability.supported || !availability.paired || !availability.installed) {
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
          if (!disposed) setWatchState(delivery.reachable ? "connected" : "waiting")
        })
      })
      .catch(() => {
        if (!disposed) setWatchState("unavailable")
      })

    void onWatchAction((event) => {
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
              ? { activeCalories: Math.max(0, Math.round(payload.activeCalories)) }
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
        if (event.action === "enduranceFinished") setFinishOpen(true)
        return
      }

      if (
        event.action === "enduranceControl" &&
        event.payload.sessionId === session.id
      ) {
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
  ])

  useEffect(() => {
    safeLocalStorageSet(ACTIVE_ENDURANCE_KEY, JSON.stringify(session))
  }, [session])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (session.status !== "recording") return
    if (session.environment === "indoor") return
    if (!("geolocation" in navigator)) {
      setGpsState("unavailable")
      return
    }
    setGpsState("locating")
    const maximumSpeed = session.sport === "ride" ? 35 : 15
    const watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
          return
        }
        // A coarse first fix is still a real lock. Dropping it before updating
        // the status left indoor and desktop sessions acquiring indefinitely.
        setGpsState("locked")
        if (coords.accuracy > 250) return
        const point: RoutePoint = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          altitude: coords.altitude,
          accuracy: coords.accuracy,
          timestamp,
        }
        setSession((current) => {
          const previous = latestPointRef.current
          if (previous) {
            const seconds = Math.max(0.1, (point.timestamp - previous.timestamp) / 1_000)
            const segment = distanceBetween(previous, point)
            if (segment / seconds > maximumSpeed) return current
            const noiseFloor = Math.max(
              2,
              Math.min(
                10,
                ((previous.accuracy ?? 20) + (point.accuracy ?? 20)) * 0.12
              )
            )
            if (segment < noiseFloor && seconds < 8) return current
          }
          const segment = previous ? distanceBetween(previous, point) : 0
          const elevationGain =
            previous?.altitude != null && point.altitude != null
              ? Math.max(0, point.altitude - previous.altitude)
              : 0
          latestPointRef.current = point
          return {
            ...current,
            points: [...current.points, point].slice(-MAX_ROUTE_POINTS),
            distanceMeters: current.distanceMeters + segment,
            elevationGainMeters: current.elevationGainMeters + elevationGain,
          }
        })
      },
      (error) => {
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
    return () => navigator.geolocation.clearWatch(watchId)
  }, [gpsAttempt, session.environment, session.sport, session.status])

  function pause() {
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
  }

  function resume() {
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
      safeLocalStorageRemove(ACTIVE_ENDURANCE_KEY)
      hapticSelection()
      toast.success(`${meta.label} saved.`)
      navigate("/endurance", { replace: true })
    } catch {
      toast.error("Couldn't save this workout. Your recording is still safe.")
      setSaving(false)
    }
  }

  function discard() {
    void commandEnduranceWatch({
      command: "end",
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
    <div className="min-h-svh bg-background text-foreground lg:grid lg:h-svh lg:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)] lg:overflow-hidden">
      <section className="relative h-[46svh] min-h-[330px] lg:h-full">
        <RouteCanvas
          points={session.points}
          gpsState={
            session.environment === "indoor"
              ? "indoor"
              : session.status === "paused"
                ? "paused"
                : gpsState
          }
        />
        <button
          type="button"
          onClick={() => setLeaveOpen(true)}
          aria-label="Leave active workout"
          className="motion-tactile absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex size-11 items-center justify-center rounded-full border border-black/10 bg-background/85 text-foreground backdrop-blur-md"
        >
          <ArrowLeft size={19} weight="bold" />
        </button>
      </section>

      <main className="relative z-10 -mt-4 min-h-[54svh] rounded-t-[16px] border-t border-border bg-background px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:mt-0 lg:flex lg:min-h-0 lg:flex-col lg:justify-center lg:rounded-none lg:border-t-0 lg:border-l lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[16px] font-bold tracking-tight">{meta.label}</h1>
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
            <WarningCircle size={18} className="mt-0.5 shrink-0" weight="bold" />
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
                : formatDistance(session.distanceMeters)}
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
                  {Math.round(session.elevationGainMeters)} m
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
            aria-label={session.status === "recording" ? "Pause workout" : "Resume workout"}
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
            disabled={session.status === "recording"}
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
          onClose={() => setFinishOpen(false)}
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
                  : `${formatDistance(session.distanceMeters)} · ${formatElapsed(elapsed)}`}
              </p>
            </div>

            <label className="mt-5 block">
              <span className="text-[12px] font-bold text-muted-foreground">
                Activity title
              </span>
              <input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 h-12 w-full rounded-[10px] border border-border bg-background px-3 text-[15px] font-semibold outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/15"
              />
            </label>

            <PrimaryButton
              onClick={() => void finish()}
              disabled={saving}
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
              onClick={() => navigate("/endurance")}
              className="motion-tactile mt-5 h-12 w-full rounded-[10px] bg-foreground text-[14px] font-bold text-background"
            >
              Save and leave
            </button>
            <button
              type="button"
              onClick={discard}
              className="motion-tactile mt-2 h-12 w-full rounded-[10px] text-[14px] font-bold text-destructive"
            >
              Discard workout
            </button>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
