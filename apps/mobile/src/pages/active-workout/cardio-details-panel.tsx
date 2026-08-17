/**
 * The cardio flavor of an exercise card: distance, duration, pace, heart
 * rate, zones, and where the numbers came from — with an Apple Health /
 * Health Connect import path on supported platforms.
 */

import { useRef, useState } from "react"
import { AppleLogo, X } from "@phosphor-icons/react"
import { toast } from "@repo/ui"
import { cn } from "@/lib/utils"
import {
  calcPaceSecondsPerKm,
  cardioDistanceToMeters,
  cardioMetersToDistance,
  compactCardioSummary,
  formatCardioDistance,
  formatCardioDuration,
  formatCardioPace,
  type CardioDistanceUnit,
  type CardioSourceProvider,
} from "@/lib/workout-sync"
import {
  getRecentHealthWorkouts,
  healthProviderLabel,
  isHealthSyncSupportedPlatform,
  requestHealthAuthorization,
  type HealthWorkout,
} from "@/lib/health-provider"
import {
  CARDIO_SOURCE_OPTIONS,
  HEART_RATE_ZONES,
  cardioDetailsFromState,
  durationFromCardioState,
  formatCardioNumber,
  formatHealthWorkoutDate,
  healthWorkoutToCardioPatch,
  parsePositiveFloat,
} from "@/lib/workout-logging"
import type {
  CardioExerciseState,
  HeartRateZoneKey,
} from "@/lib/workout-logging"

export function CardioDetailsPanel({
  cardio,
  onUpdate,
  isNext,
}: {
  cardio: CardioExerciseState
  onUpdate: (cardio: CardioExerciseState) => void
  isNext?: boolean
}) {
  const details = cardioDetailsFromState(cardio)
  const distance = parsePositiveFloat(cardio.distance)
  const durationSeconds = durationFromCardioState(cardio)
  const calculatedPace = calcPaceSecondsPerKm(
    distance
      ? cardioDistanceToMeters(distance, cardio.distanceUnit)
      : undefined,
    durationSeconds ?? undefined
  )
  const paceLabel =
    formatCardioPace(
      calculatedPace ?? details?.paceSecondsPerKm,
      cardio.distanceUnit
    ) ?? "–"
  const durationLabel = formatCardioDuration(durationSeconds) ?? "–"
  const sourceLabel =
    CARDIO_SOURCE_OPTIONS.find(
      (option) => option.provider === cardio.sourceProvider
    )?.label ?? "Manual"
  const healthSupported = isHealthSyncSupportedPlatform()
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [healthWorkoutsList, setHealthWorkoutsList] = useState<
    HealthWorkout[]
  >([])
  const [showHealthWorkouts, setShowHealthWorkouts] = useState(false)
  const healthLoadingRef = useRef(false)

  function update(patch: Partial<CardioExerciseState>) {
    onUpdate({ ...cardio, ...patch })
  }

  function updateZone(key: HeartRateZoneKey, value: string) {
    onUpdate({
      ...cardio,
      zones: {
        ...cardio.zones,
        [key]: value,
      },
    })
  }

  function setDistanceUnit(unit: CardioDistanceUnit) {
    if (unit === cardio.distanceUnit) return
    const currentDistance = parsePositiveFloat(cardio.distance)
    if (!currentDistance) {
      update({ distanceUnit: unit })
      return
    }
    const meters = cardioDistanceToMeters(currentDistance, cardio.distanceUnit)
    update({
      distanceUnit: unit,
      distance: formatCardioNumber(cardioMetersToDistance(meters, unit)),
    })
  }

  async function loadHealthWorkouts() {
    if (healthLoadingRef.current || healthLoading) return
    healthLoadingRef.current = true
    setHealthLoading(true)
    setHealthError(null)
    try {
      const authorization = await requestHealthAuthorization()
      if (!authorization.available) {
        setHealthError(`${healthProviderLabel()} is not available on this device.`)
        setHealthWorkoutsList([])
        setShowHealthWorkouts(true)
        return
      }
      if (!authorization.granted) {
        setHealthError(`${healthProviderLabel()} permission was not granted.`)
        setHealthWorkoutsList([])
        setShowHealthWorkouts(true)
        return
      }

      const workouts = await getRecentHealthWorkouts({
        daysBack: 30,
        limit: 12,
      })
      setHealthWorkoutsList(workouts)
      setShowHealthWorkouts(true)
      if (workouts.length === 0) {
        setHealthError(
          `No recent cardio workouts found in ${healthProviderLabel()}.`
        )
      }
    } catch (error) {
      setHealthWorkoutsList([])
      setShowHealthWorkouts(true)
      setHealthError(
        error instanceof Error
          ? error.message
          : `Could not read ${healthProviderLabel()} workouts.`
      )
    } finally {
      healthLoadingRef.current = false
      setHealthLoading(false)
    }
  }

  function importHealthWorkout(workout: HealthWorkout) {
    onUpdate({
      ...cardio,
      ...healthWorkoutToCardioPatch(workout, cardio.distanceUnit),
      zones: cardio.zones,
      notes: cardio.notes,
    })
    setShowHealthWorkouts(false)
    toast.success(`Imported ${healthProviderLabel()} workout`)
  }

  const fieldCls =
    "h-12 w-full [appearance:textfield] rounded-[20px] border border-border/45 bg-muted/20 px-3 text-center text-[16px] font-semibold tabular-nums outline-none transition-all placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-card/80 focus:ring-2 focus:ring-foreground/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
  const labelCls =
    "px-1 text-[13px] leading-none font-bold text-muted-foreground"

  return (
    <div
      className={cn(
        "border-t border-border/45 px-3 py-3 sm:px-4",
        isNext && "bg-primary/[0.028]"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted-foreground">
            Cardio
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-foreground/70">
            {compactCardioSummary(details, cardio.distanceUnit)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {healthSupported && (
            <button
              type="button"
              onClick={loadHealthWorkouts}
              disabled={healthLoading}
              aria-busy={healthLoading}
              className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-2.5 text-[13px] font-semibold text-background transition-opacity active:opacity-80 disabled:opacity-55"
            >
              <AppleLogo size={13} weight="fill" />
              {healthLoading ? "Syncing" : "Health"}
            </button>
          )}
          <span className="rounded-full bg-muted/50 px-2.5 py-1 text-[13px] font-semibold text-muted-foreground/60 tabular-nums">
            {paceLabel}
          </span>
        </div>
      </div>

      {healthSupported && showHealthWorkouts && (
        <div className="mb-3 rounded-[22px] border border-border/45 bg-background p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-muted-foreground">
                {healthProviderLabel()}
              </p>
              <p className="truncate text-[13px] font-semibold text-muted-foreground/60">
                Recent cardio workouts
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                healthLoading
                  ? undefined
                  : setShowHealthWorkouts(false)
              }
              disabled={healthLoading}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/45 text-muted-foreground/60 active:bg-muted disabled:opacity-40"
              aria-label={`Close ${healthProviderLabel()} workouts`}
            >
              <X size={12} weight="bold" />
            </button>
          </div>
          {healthError && (
            <p className="rounded-[16px] bg-muted/35 px-3 py-2 text-[13px] font-semibold text-muted-foreground/75">
              {healthError}
            </p>
          )}
          {healthWorkoutsList.length > 0 && (
            <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {healthWorkoutsList.map((workout) => (
                <button
                  key={workout.uuid}
                  type="button"
                  onClick={() => importHealthWorkout(workout)}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[17px] bg-muted/25 px-3 py-2 text-left transition-colors active:bg-muted/55"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-foreground/85">
                      {workout.activityName}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] font-semibold text-muted-foreground/60">
                      {[
                        formatCardioDistance(
                          workout.totalDistanceMeters,
                          cardio.distanceUnit
                        ),
                        formatCardioDuration(workout.durationSeconds),
                        workout.avgHeartRateBpm
                          ? `${Math.round(workout.avgHeartRateBpm)} bpm`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                    {formatHealthWorkoutDate(workout.startedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Distance</span>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              value={cardio.distance}
              onChange={(event) => update({ distance: event.target.value })}
              placeholder="0"
              className={fieldCls}
            />
            <div className="flex h-12 overflow-hidden rounded-[20px] border border-border/45 bg-muted/25 text-[13px] font-semibold">
              {(["km", "mi"] as CardioDistanceUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setDistanceUnit(unit)}
                  className={cn(
                    "min-w-10 px-2 transition-colors",
                    cardio.distanceUnit === unit
                      ? "bg-foreground text-background"
                      : "text-muted-foreground/65 active:bg-muted/60"
                  )}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
        </label>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Duration</span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              ["durationHours", "h"],
              ["durationMinutes", "m"],
              ["durationSeconds", "s"],
            ].map(([key, label]) => (
              <label key={key} className="relative min-w-0">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={cardio[key as keyof CardioExerciseState] as string}
                  onChange={(event) =>
                    update({
                      [key]: event.target.value,
                    } as Partial<CardioExerciseState>)
                  }
                  placeholder="0"
                  className={cn(fieldCls, "pr-7")}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
          <span className={labelCls}>Pace</span>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
            <label className="relative min-w-0">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={cardio.paceMinutes}
                onChange={(event) =>
                  update({ paceMinutes: event.target.value })
                }
                placeholder="0"
                className={cn(fieldCls, "pr-9")}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground">
                min
              </span>
            </label>
            <label className="relative min-w-0">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={cardio.paceSeconds}
                onChange={(event) =>
                  update({ paceSeconds: event.target.value })
                }
                placeholder="0"
                className={cn(fieldCls, "pr-9")}
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] font-semibold text-muted-foreground">
                sec
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Avg HR</span>
          <input
            type="number"
            inputMode="numeric"
            value={cardio.avgHeartRate}
            onChange={(event) => update({ avgHeartRate: event.target.value })}
            placeholder="bpm"
            className={fieldCls}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Max HR</span>
          <input
            type="number"
            inputMode="numeric"
            value={cardio.maxHeartRate}
            onChange={(event) => update({ maxHeartRate: event.target.value })}
            placeholder="bpm"
            className={fieldCls}
          />
        </label>
      </div>

      <div className="mt-3">
        <p className={labelCls}>Heart-rate zones</p>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {HEART_RATE_ZONES.map(({ key, label }) => (
            <label key={key} className="min-w-0">
              <span className="mb-1 block text-center text-[13px] font-semibold text-muted-foreground">
                {label}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={cardio.zones[key]}
                onChange={(event) => updateZone(key, event.target.value)}
                placeholder="m"
                className="h-10 w-full [appearance:textfield] rounded-[16px] border border-border/40 bg-muted/20 px-1.5 text-center text-[13px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-card/80 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Source</span>
          <select
            value={cardio.sourceProvider}
            onChange={(event) =>
              update({
                sourceProvider: event.target.value as CardioSourceProvider,
              })
            }
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none focus:border-foreground/30 focus:bg-card/80"
          >
            {CARDIO_SOURCE_OPTIONS.map((option) => (
              <option key={option.provider} value={option.provider}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Source name</span>
          <input
            value={cardio.sourceName}
            onChange={(event) => update({ sourceName: event.target.value })}
            placeholder="Morning run"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-card/80"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Activity ID</span>
          <input
            value={cardio.sourceExternalId}
            onChange={(event) =>
              update({ sourceExternalId: event.target.value })
            }
            placeholder="Import ID"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-card/80"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Route</span>
          <input
            value={cardio.routeName}
            onChange={(event) => update({ routeName: event.target.value })}
            placeholder="Route name"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-card/80"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelCls}>Route URL</span>
          <input
            type="url"
            value={cardio.routeUrl}
            onChange={(event) => update({ routeUrl: event.target.value })}
            placeholder="https://"
            className="h-12 rounded-[20px] border border-border/45 bg-muted/20 px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-card/80"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between text-[13px] font-semibold text-muted-foreground">
        <span>{durationLabel}</span>
        <span>{sourceLabel}</span>
      </div>
    </div>
  )
}
