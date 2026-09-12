import { EnduranceRouteMap } from "@/components/endurance-route-map"
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import {
  Bicycle,
  Mountains,
  PersonSimpleWalk,
  Boat,
  CaretRight,
  Clock,
  Fire,
  Heartbeat,
  MapPin,
  PencilSimple,
  PersonSimpleRun,
  PersonSimpleSwim,
  Play,
  Target,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { APP_ACCENT_COLORS, PrimaryButton, toast } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { MobileSheet } from "@/components/mobile-sheet"
import { EnduranceHeartRateChart } from "@/components/endurance-heart-rate-chart"
import { ReactiveOrbField } from "@/components/reactive-orb-field"
import {
  HoldToStartDial,
  TrainingStatDial,
} from "@/components/training-hero-dials"
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  distanceUnitForSystem,
  formatDistanceForUnit,
  METERS_PER_MILE,
  type DistanceUnit,
} from "@/lib/measurement-system"
import { useMeasurementSystem } from "@/lib/use-measurement-system"
import {
  getActiveEnduranceSport,
  type EnduranceEnvironment,
} from "@/lib/endurance-workout"

type Sport = "run" | "ride" | "swim" | "hike" | "walk" | "trail_run" | "row"
type EnduranceGoal = {
  distanceMeters?: number
  durationMinutes?: number
  sessions?: number
}

const HERO_ORBIT_RADIUS = 107
const HERO_SATELLITES = [
  { angle: 157.5, mirrored: true },
  { angle: 112.5, mirrored: true },
  { angle: 67.5, mirrored: false },
  { angle: 22.5, mirrored: false },
] as const

const SPORT_META = {
  hike: {
    label: "Hike",
    activityLabel: "Hiking",
    verb: "hike",
    Icon: Mountains,
  },
  walk: {
    label: "Walk",
    activityLabel: "Walking",
    verb: "walk",
    Icon: PersonSimpleWalk,
  },
  trail_run: {
    label: "Trail run",
    activityLabel: "Trail running",
    verb: "run trails",
    Icon: PersonSimpleRun,
  },
  row: { label: "Row", activityLabel: "Rowing", verb: "row", Icon: Boat },
  run: {
    label: "Run",
    activityLabel: "Running",
    verb: "run",
    Icon: PersonSimpleRun,
  },
  ride: {
    label: "Ride",
    activityLabel: "Cycling",
    verb: "ride",
    Icon: Bicycle,
  },
  swim: {
    label: "Swim",
    activityLabel: "Swimming",
    verb: "swim",
    Icon: PersonSimpleSwim,
  },
} satisfies Record<
  Sport,
  { label: string; activityLabel: string; verb: string; Icon: typeof Bicycle }
>

function sportForActivity(activityType: string): Sport | null {
  const normalized = activityType.toLowerCase()
  if (normalized.includes("trail")) return "trail_run"
  if (normalized.includes("hik")) return "hike"
  if (normalized.includes("walk")) return "walk"
  if (normalized.includes("row")) return "row"
  if (normalized.includes("run")) return "run"
  if (normalized.includes("cycl") || normalized.includes("bike")) return "ride"
  if (normalized.includes("swim")) return "swim"
  return null
}

function startOfWeek(now: Date) {
  const start = new Date(now)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
}

function formatDistance(meters: number, sport: Sport | undefined, unit: DistanceUnit) {
  if (sport === "swim" && unit === "km" && meters < 10_000) {
    return `${Math.round(meters).toLocaleString()} m`
  }
  return formatDistanceForUnit(meters, unit)
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return "Today"
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function daysSince(timestamp: number | undefined) {
  if (timestamp === undefined) return null
  const then = new Date(timestamp)
  then.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(
    0,
    Math.round((today.getTime() - then.getTime()) / 86_400_000)
  )
}

function numberOrUndefined(value: string) {
  if (value.trim() === "") return undefined
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

export default function Endurance() {
  const navigate = useSmoothNavigate()
  const activities = useQuery(api.logs.healthWorkouts.list, { limit: 50 })
  const preferences = useQuery(api.users.users.getPreferences)
  const saveGoals = useMutation(api.users.users.setEnduranceGoals)
  const [sport, setSport] = useState<Sport>("run")
  const [environment, setEnvironment] =
    useState<EnduranceEnvironment>("outdoor")
  const [goalsOpen, setGoalsOpen] = useState(false)

  const enduranceActivities = useMemo(
    () =>
      (activities ?? []).flatMap((activity) => {
        const activitySport = sportForActivity(activity.activityType)
        return activitySport ? [{ ...activity, sport: activitySport }] : []
      }),
    [activities]
  )
  const sportActivities = enduranceActivities.filter(
    (activity) => activity.sport === sport
  )
  const [selectedActivityId, setSelectedActivityId] = useState<
    (typeof sportActivities)[number]["_id"] | null
  >(null)
  const selectedActivity =
    sportActivities.find((activity) => activity._id === selectedActivityId) ??
    null
  const selectedHeartRateSeries = useQuery(
    api.logs.healthWorkouts.getHeartRateSeries,
    selectedActivityId ? { workoutId: selectedActivityId } : "skip"
  )
  const selectedRoute = useQuery(
    api.logs.healthWorkouts.getRoute,
    selectedActivityId ? { workoutId: selectedActivityId } : "skip"
  )
  const createTrail = useMutation(api.hikingTrails.create)
  const [savingTrail, setSavingTrail] = useState(false)
  const weekStart = startOfWeek(new Date())
  const weekActivities = sportActivities.filter(
    (activity) => activity.startedAt >= weekStart
  )
  const weekDurationMinutes = Math.round(
    weekActivities.reduce(
      (total, activity) => total + activity.durationSeconds,
      0
    ) / 60
  )
  const {
    system: measurementSystem,
  } = useMeasurementSystem()
  const distanceUnit = distanceUnitForSystem(measurementSystem)
  const weekDistance = Number(
    (
      weekActivities.reduce(
        (total, activity) => total + (activity.totalDistanceMeters ?? 0),
        0
      ) / (distanceUnit === "mi" ? METERS_PER_MILE : 1_000)
    ).toFixed(1)
  )
  const goals = preferences?.enduranceGoals?.[sport] as
    EnduranceGoal | undefined
  const configuredGoalCount = [
    goals?.distanceMeters,
    goals?.durationMinutes,
    goals?.sessions,
  ].filter((value) => value !== undefined).length
  const lastSessionDays = daysSince(sportActivities[0]?.startedAt)
  const SportIcon = SPORT_META[sport].Icon
  const activeSport = getActiveEnduranceSport()
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
  })
  const heroStats = [
    {
      name: "Distance",
      value: weekDistance,
      target: goals?.distanceMeters
        ? Number(
            (
              goals.distanceMeters / (distanceUnit === "mi" ? METERS_PER_MILE : 1_000)
            ).toFixed(1)
          )
        : undefined,
      suffix: distanceUnit,
      color: APP_ACCENT_COLORS.progress,
    },
    {
      name: "Minutes",
      value: weekDurationMinutes,
      target: goals?.durationMinutes,
      suffix: "m",
      color: APP_ACCENT_COLORS.water,
    },
    {
      name: "Sessions",
      value: weekActivities.length,
      target: goals?.sessions,
      suffix: "",
      color: APP_ACCENT_COLORS.complete,
    },
    {
      name: "Goals",
      value: configuredGoalCount,
      target: 3,
      suffix: "",
      color: APP_ACCENT_COLORS.food,
    },
  ]

  function chooseSport(nextSport: Sport) {
    hapticSelection()
    setSport(nextSport)
  }

  return (
    <div
      className="app-hero endurance-hero desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72"
      style={
        {
          "--hero-fill": goals?.sessions
            ? Math.min(1, weekActivities.length / goals.sessions)
            : 0.18,
          "--hero-accent": "var(--accent-progress)",
        } as CSSProperties
      }
    >
      <ReactiveOrbField className="endurance-hero-wash" />
      <main className="app-page pb-28">
        <header className="app-header flex items-center justify-between gap-3">
          <h1 className="app-title flex items-center gap-2">
            Endurance
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Beta
            </span>
          </h1>
          <button
            type="button"
            onClick={() => setGoalsOpen(true)}
            className="app-header-icon-action"
            aria-label={`Edit ${SPORT_META[sport].label.toLowerCase()} goals`}
          >
            <Target size={17} weight="bold" />
          </button>
        </header>

        <section
          className="app-hero-frame progress-tab-enter relative flex flex-col justify-center pt-3 pb-4 text-center"
          aria-labelledby="endurance-hero-title"
        >
          <div
            className="mx-auto flex min-h-11 max-w-full flex-wrap items-center justify-center gap-1 rounded-[12px] border border-border/70 bg-background/35 p-1"
            aria-label="Activity type"
          >
            {(Object.keys(SPORT_META) as Sport[]).map((option) => {
              const { Icon, label } = SPORT_META[option]
              const selected = option === sport
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseSport(option)}
                  className={cn(
                    "motion-tactile flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold transition-colors",
                    selected
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                  )}
                >
                  <Icon size={15} weight={selected ? "fill" : "regular"} />
                  {label}
                </button>
              )
            })}
          </div>

          {sport === "hike" && (
            <button
              type="button"
              onClick={() => navigate("/endurance/trails")}
              className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-[10px] border border-border px-4 font-semibold"
            >
              <Mountains size={20} /> Plan & explore your trails{" "}
              <CaretRight size={16} />
            </button>
          )}
          {!activeSport && (
            <div
              className="mx-auto mt-3 flex items-center rounded-[10px] bg-muted/55 p-1"
              aria-label="Workout setting"
            >
              {(["outdoor", "indoor"] as EnduranceEnvironment[]).map(
                (option) => {
                  const selected = environment === option
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        hapticSelection()
                        setEnvironment(option)
                      }}
                      className={cn(
                        "motion-tactile min-h-8 rounded-[8px] px-4 text-[12px] font-semibold transition-colors",
                        selected
                          ? "bg-background text-foreground shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {option === "outdoor" ? "Outdoor" : "Indoor"}
                    </button>
                  )
                }
              )}
            </div>
          )}

          <p className="mt-4 text-[13px] font-medium text-muted-foreground">
            Today · {todayLabel}
          </p>
          <h2
            id="endurance-hero-title"
            className="mt-1.5 text-[2.4rem] leading-none font-extrabold tracking-tight"
          >
            Ready to {SPORT_META[sport].verb}
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {activeSport
              ? "Hold to resume your workout."
              : environment === "outdoor"
                ? "Hold to start GPS tracking."
                : "Hold to start an indoor workout."}
          </p>

          <div
            className="relative mx-auto mt-7 mb-1"
            style={{ width: 280, height: 226 }}
          >
            {HERO_SATELLITES.map((satellite, index) => {
              const stat = heroStats[index]
              const radians = (satellite.angle * Math.PI) / 180
              return (
                <div
                  key={stat.name}
                  className="absolute z-0"
                  style={{
                    left: 140 + HERO_ORBIT_RADIUS * Math.cos(radians) - 39,
                    top: 84 + HERO_ORBIT_RADIUS * Math.sin(radians) - 39,
                  }}
                >
                  <TrainingStatDial
                    name={stat.name}
                    value={stat.value}
                    target={stat.target}
                    suffix={stat.suffix}
                    color={stat.color}
                    size={78}
                    stroke={6}
                    mirrored={satellite.mirrored}
                  />
                </div>
              )
            })}
            <div className="absolute z-10" style={{ left: 140 - 84, top: 0 }}>
              <HoldToStartDial
                label={
                  activeSport
                    ? `Resume ${SPORT_META[activeSport].label.toLowerCase()}`
                    : `Start ${SPORT_META[sport].label.toLowerCase()}`
                }
                primaryIcon={<Play size={36} weight="fill" />}
                icon={<SportIcon size={18} weight="bold" />}
                onComplete={() =>
                  navigate(
                    `/endurance/active?sport=${sport}&environment=${environment}`,
                    { motion: "forward" }
                  )
                }
                onShortPress={() =>
                  toast.info(
                    `Press and hold to ${activeSport ? "resume your active workout" : `start ${SPORT_META[sport].label.toLowerCase()}`}.`,
                    { id: "endurance-workout-hold-tip" }
                  )
                }
                size={168}
                stroke={9}
                color="var(--accent-progress)"
              />
            </div>
          </div>

          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
            {lastSessionDays === null
              ? `No ${SPORT_META[sport].activityLabel.toLowerCase()} in the last month`
              : lastSessionDays === 0
                ? "Last session today"
                : `Last session ${lastSessionDays} day${lastSessionDays === 1 ? "" : "s"} ago`}
          </p>
          <button
            type="button"
            onClick={() => setGoalsOpen(true)}
            className="motion-tactile mt-3 h-11 w-full rounded-[18px] text-[14px] font-semibold text-muted-foreground transition-colors active:bg-muted/35 active:text-foreground"
          >
            {configuredGoalCount === 0
              ? "Set weekly goals"
              : "Edit weekly goals"}
          </button>
        </section>

        <section className="mt-4" aria-labelledby="endurance-recent-heading">
          <h2 id="endurance-recent-heading" className="app-section-title">
            Recent {SPORT_META[sport].activityLabel.toLowerCase()}
          </h2>

          {activities === undefined ? (
            <div
              className="mt-2 divide-y divide-border border-y border-border"
              data-route-loading="true"
            >
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3 py-4">
                  <div className="size-10 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-44 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : sportActivities.length === 0 ? (
            <div className="mt-3 border-y border-border py-8 text-center">
              <MapPin size={26} className="mx-auto text-muted-foreground" />
              <p className="mt-3 text-[15px] font-semibold">
                No {SPORT_META[sport].activityLabel.toLowerCase()} yet
              </p>
              <p className="mx-auto mt-1 max-w-[30rem] text-[13px] leading-5 text-muted-foreground">
                Connected sessions will appear here automatically.
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {sportActivities.map((activity) => (
                <li key={activity._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedActivityId(activity._id)}
                    className="motion-tactile flex min-h-[4.75rem] w-full items-center gap-3 py-3 text-left"
                    aria-label={`Open ${activity.routeName || activity.activityName || SPORT_META[sport].activityLabel} details`}
                  >
                    <SportIcon
                      size={20}
                      weight="bold"
                      className="shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[15px] font-semibold">
                          {activity.routeName ||
                            activity.activityName ||
                            SPORT_META[sport].activityLabel}
                        </p>
                        <time className="shrink-0 text-[12px] text-muted-foreground">
                          {formatDate(activity.startedAt)}
                        </time>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={13} />{" "}
                          {formatDuration(activity.durationSeconds)}
                        </span>
                        {activity.totalDistanceMeters != null && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <MapPin size={13} />{" "}
                            {formatDistance(
                              activity.totalDistanceMeters,
                              sport,
                              distanceUnit
                            )}
                          </span>
                        )}
                        {activity.avgHeartRateBpm != null && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Heartbeat size={13} />{" "}
                            {Math.round(activity.avgHeartRateBpm)} bpm
                          </span>
                        )}
                      </div>
                    </div>
                    <CaretRight
                      size={15}
                      weight="bold"
                      className="shrink-0 text-muted-foreground/65"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {goalsOpen && (
        <EnduranceGoalsSheet
          sport={sport}
          goals={goals}
          onSportChange={chooseSport}
          onSave={async (nextGoals) => {
            await saveGoals({ sport, ...nextGoals })
          }}
          measurementSystem={measurementSystem}
          onClose={() => setGoalsOpen(false)}
        />
      )}

      {selectedActivity && (
        <MobileSheet
          ariaLabel="Endurance workout details"
          onClose={() => setSelectedActivityId(null)}
          overlayClassName="bg-black/45"
          panelClassName="mx-auto w-full max-w-md"
        >
          <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <p className="text-[12px] font-semibold text-muted-foreground">
              {formatDate(selectedActivity.startedAt)} ·{" "}
              {selectedActivity.sourceName ?? "OneRep"}
            </p>
            <h2 className="mt-1 text-[24px] font-extrabold tracking-tight">
              {selectedActivity.routeName ||
                selectedActivity.activityName ||
                SPORT_META[selectedActivity.sport].activityLabel}
            </h2>
            {selectedRoute && (
              <div className="mt-5">
                <div className="relative isolate h-80 overflow-hidden rounded-xl border border-border">
                  <EnduranceRouteMap
                    points={selectedRoute.points}
                    tracking={false}
                  />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {Math.round(selectedRoute.elevationGainMeters)} m elevation
                  gain
                </p>
                <button
                  type="button"
                  disabled={savingTrail}
                  className="mt-3 min-h-11 rounded-[10px] border border-border px-4 text-sm font-semibold disabled:opacity-40"
                  onClick={async () => {
                    setSavingTrail(true)
                    try {
                      await createTrail({
                        name:
                          selectedActivity.routeName ||
                          selectedActivity.activityName ||
                          "Recorded trail",
                        description: "",
                        points: selectedRoute.points,
                      })
                      toast.success("Route saved as a private hiking trail.")
                      setSelectedActivityId(null)
                      navigate("/endurance/trails")
                    } catch {
                      toast.error("Couldn't save this trail. Try again.")
                    } finally {
                      setSavingTrail(false)
                    }
                  }}
                >
                  {savingTrail
                    ? "Saving trail…"
                    : "Save route as a hiking trail"}
                </button>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 border-y border-border">
              <WorkoutMetric
                label="Time"
                value={formatDuration(selectedActivity.durationSeconds)}
              />
              <WorkoutMetric
                label="Distance"
                value={
                  selectedActivity.totalDistanceMeters == null
                    ? "—"
                    : formatDistance(
                        selectedActivity.totalDistanceMeters,
                        selectedActivity.sport,
                        distanceUnit
                      )
                }
              />
              <WorkoutMetric
                label="Average heart rate"
                value={
                  selectedActivity.avgHeartRateBpm == null
                    ? "—"
                    : `${Math.round(selectedActivity.avgHeartRateBpm)} bpm`
                }
                icon={<Heartbeat size={15} weight="bold" />}
              />
              <WorkoutMetric
                label="Active calories"
                value={
                  selectedActivity.activeEnergyKcal == null
                    ? "—"
                    : `${Math.round(selectedActivity.activeEnergyKcal)} kcal`
                }
                icon={<Fire size={15} weight="fill" />}
              />
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold text-muted-foreground">
                    Heart rate
                  </p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums">
                    {selectedActivity.avgHeartRateBpm == null
                      ? "No reading"
                      : `${Math.round(selectedActivity.avgHeartRateBpm)} bpm average`}
                  </p>
                </div>
                {selectedActivity.maxHeartRateBpm != null && (
                  <p className="text-[12px] font-semibold text-muted-foreground tabular-nums">
                    {Math.round(selectedActivity.maxHeartRateBpm)} bpm max
                  </p>
                )}
              </div>
              <EnduranceHeartRateChart
                samples={selectedHeartRateSeries ?? []}
                elapsedSeconds={selectedActivity.durationSeconds}
                emptyTitle={
                  selectedHeartRateSeries === undefined
                    ? "Loading heart rate"
                    : "No heart rate trace"
                }
                emptyBody={
                  selectedHeartRateSeries === undefined
                    ? "Retrieving the recorded samples."
                    : "This workout includes summary metrics only. Detailed samples were not provided by the source."
                }
              />
            </div>
          </div>
        </MobileSheet>
      )}
    </div>
  )
}

function WorkoutMetric({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: ReactNode
}) {
  return (
    <div className="border-b border-border py-4 odd:pr-4 even:border-l even:pl-5 [&:nth-last-child(-n+2)]:border-b-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-[17px] font-bold tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  )
}

function EnduranceGoalsSheet({
  sport,
  goals,
  onSportChange,
  onSave,
  measurementSystem,
  onClose,
}: {
  sport: Sport
  goals: EnduranceGoal | undefined
  onSportChange: (sport: Sport) => void
  onSave: (goals: EnduranceGoal) => Promise<void>
  measurementSystem: "metric" | "imperial"
  onClose: () => void
}) {
  const distanceUnit = distanceUnitForSystem(measurementSystem)
  const [distance, setDistance] = useState("")
  const [duration, setDuration] = useState("")

  const [sessions, setSessions] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDistance(
      goals?.distanceMeters
        ? String(
            goals.distanceMeters / (distanceUnit === "mi" ? METERS_PER_MILE : 1_000)
          )
        : ""
    )
    setDuration(goals?.durationMinutes ? String(goals.durationMinutes) : "")
    setSessions(goals?.sessions ? String(goals.sessions) : "")
  }, [goals, sport, distanceUnit])

  async function save() {
    const distanceValue = numberOrUndefined(distance)
    const durationMinutes = numberOrUndefined(duration)
    const sessionCount = numberOrUndefined(sessions)
    setSaving(true)
    try {
      await onSave({
        ...(distanceValue
          ? {
              distanceMeters:
                distanceValue * (distanceUnit === "mi" ? METERS_PER_MILE : 1_000),
            }
          : {}),
        ...(durationMinutes ? { durationMinutes } : {}),
        ...(sessionCount ? { sessions: Math.round(sessionCount) } : {}),
      })
      toast.success(`${SPORT_META[sport].label} goals saved.`)
      onClose()
    } catch {
      toast.error("Couldn't save those goals. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <MobileSheet
      ariaLabel="Weekly endurance goals"
      onClose={onClose}
      overlayClassName="bg-black/45"
      panelClassName="mx-auto w-full max-w-md"
    >
      <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight">
              Weekly goals
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
              Set only what matters. Blank targets stay out of your progress
              rings.
            </p>
          </div>
          <PencilSimple size={19} className="mt-1 text-muted-foreground" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-1 rounded-[12px] border border-border p-1">
          {(Object.keys(SPORT_META) as Sport[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sport === option}
              onClick={() => onSportChange(option)}
              className={cn(
                "min-h-10 rounded-[9px] text-[13px] font-semibold",
                sport === option
                  ? "bg-foreground text-background"
                  : "text-muted-foreground"
              )}
            >
              {SPORT_META[option].label}
            </button>
          ))}
        </div>

        <div className="mt-6 divide-y divide-border border-y border-border">
          <GoalField
            label="Distance"
            detail={`${distanceUnit === "mi" ? "Miles" : "Kilometres"} per week`}
            value={distance}
            suffix={distanceUnit}
            step="0.1"
            onChange={setDistance}
          />
          <GoalField
            label="Time"
            detail="Moving minutes per week"
            value={duration}
            suffix="min"
            step="1"
            onChange={setDuration}
          />
          <GoalField
            label="Sessions"
            detail="Completed activities per week"
            value={sessions}
            suffix="times"
            step="1"
            onChange={setSessions}
          />
        </div>

        <PrimaryButton
          onClick={() => void save()}
          disabled={saving}
          className="mt-6 h-[52px] w-full"
        >
          {saving
            ? "Saving…"
            : `Save ${SPORT_META[sport].label.toLowerCase()} goals`}
        </PrimaryButton>
      </div>
    </MobileSheet>
  )
}

function GoalField({
  label,
  detail,
  value,
  suffix,
  step,
  onChange,
}: {
  label: string
  detail: string
  value: string
  suffix: string
  step: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-h-[4.75rem] items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">
          {detail}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <input
          type="number"
          min="0"
          step={step}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="—"
          className="h-11 w-20 rounded-[10px] border border-border bg-background px-3 text-right text-[15px] font-semibold tabular-nums outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/15"
        />
        <span className="w-9 text-left text-[12px] text-muted-foreground">
          {suffix}
        </span>
      </span>
    </label>
  )
}
