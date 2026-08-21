/**
 * One exercise, at length: what it has done for you, and how to do it.
 *
 * A page rather than a sheet, because it is a destination — deep-linkable, back
 * button included — and because two panes of dense reading trapped inside a
 * modal is how you make people close it without reading either.
 */

import { useMemo, useState, type ReactNode } from "react"
import { useWeightUnit } from "@/lib/use-weight-unit"
import { useQuery } from "convex/react"
import { useParams } from "react-router"
import { ArrowLeft, ChartLineUp, Trophy } from "@phosphor-icons/react"
import { NavigationBar, ToolbarButton } from "@repo/ui"

import { api } from "../../../../convex/_generated/api"
import type { ClientExercise } from "../../../../convex/lib/exerciseShape"
import { cn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"
import { useSmoothNavigate } from "@/lib/navigation"
import { ExerciseArt } from "@/components/exercise-art"
import { sparklinePoints } from "@/lib/progress-metrics"
import type { WeightUnit } from "@/lib/health-goals"
import {
  EXERCISE_CATEGORY_LABELS,
  formatSessionDate,
  formatWeight,
  formatWeightValue,
  muscleSummary,
  titleCase,
  toDisplayWeight,
} from "@/lib/exercise-display"
import {
  PROGRESS_METRIC_LABELS,
  metricSeries,
  personalRecords,
  summariseSessions,
  trendPercent,
  type HistorySession,
  type ProgressMetric,
  type SessionSummary,
} from "@/lib/exercise-stats"

type DetailPane = "progress" | "instructions"

export default function ExerciseDetail() {
  const { exerciseId = "" } = useParams()
  const navigate = useSmoothNavigate()
  const [pane, setPane] = useState<DetailPane>("progress")

  const preferences = useQuery(api.users.users.getPreferences)
  const unit = useWeightUnit()

  const resolved = useQuery(
    api.exercises.resolve,
    exerciseId ? { ids: [exerciseId] } : "skip"
  ) as Record<string, ClientExercise> | undefined
  const exercise = resolved?.[exerciseId]

  const history = useQuery(
    api.logs.workouts.historyForExercise,
    exerciseId ? { exerciseId } : "skip"
  ) as HistorySession[] | undefined
  const sessions = useMemo(() => summariseSessions(history), [history])

  function goBack() {
    hapticSelection()
    navigate("/progress?tab=exercises", { motion: "back" })
  }

  const notFound = resolved !== undefined && !exercise

  return (
    <div className="desktop-canvas min-h-svh bg-background text-foreground lg:pr-8 lg:pl-72">
      <main className="mx-auto min-h-svh w-full max-w-5xl pb-[calc(var(--app-safe-bottom-lg)+2rem)]">
        <NavigationBar
          title={exercise?.name ?? "Exercise"}
          leading={
            <ToolbarButton onClick={goBack} aria-label="Back to exercises">
              <ArrowLeft size={20} weight="bold" />
            </ToolbarButton>
          }
        />

        {notFound ? (
          <div className="px-[var(--app-page-x)] py-16 text-center">
            <p className="text-[15px] font-semibold">
              That exercise is not in the catalog
            </p>
            <p className="mt-1 text-[14px] text-muted-foreground">
              It was renamed, deleted, or the link was wrong to begin with.
            </p>
          </div>
        ) : !exercise ? (
          <div className="px-[var(--app-page-x)] py-16 text-center text-[14px] text-muted-foreground">
            Loading…
          </div>
        ) : (
          <div className="px-[var(--app-page-x)]">
            <p className="text-[15px] text-muted-foreground">
              {muscleSummary(exercise.primaryMuscles)}
            </p>

            <div
              role="tablist"
              aria-label="Exercise detail"
              className="mt-4 flex gap-1 lg:hidden"
            >
              {(
                [
                  ["progress", "Progress"],
                  ["instructions", "How to"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={pane === value}
                  onClick={() => {
                    hapticSelection()
                    setPane(value)
                  }}
                  className={cn(
                    "min-h-11 flex-1 rounded-lg text-[14px] font-semibold transition-colors",
                    pane === value
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground active:bg-muted/60"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-x-12">
              <section
                aria-label="Progress"
                className={cn("lg:block", pane === "progress" ? "" : "hidden")}
              >
                <ProgressPane
                  sessions={sessions}
                  loading={history === undefined}
                  unit={unit}
                />
              </section>
              <section
                aria-label="How to"
                className={cn(
                  "lg:block",
                  pane === "instructions" ? "" : "hidden"
                )}
              >
                <InstructionsPane exercise={exercise} />
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Progress pane ────────────────────────────────────────────────────────────

function PaneHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[12px] font-bold tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  )
}

function ProgressPane({
  sessions,
  loading,
  unit,
}: {
  sessions: SessionSummary[]
  loading: boolean
  unit: WeightUnit
}) {
  const [metric, setMetric] = useState<ProgressMetric>("e1rm")

  const series = useMemo(
    () =>
      metricSeries(sessions, metric).map((value) =>
        toDisplayWeight(value, unit)
      ),
    [metric, sessions, unit]
  )
  const records = useMemo(() => personalRecords(sessions), [sessions])
  const trend = trendPercent(series)
  const latest = sessions[sessions.length - 1]

  if (loading) {
    return (
      <p className="py-16 text-center text-[14px] text-muted-foreground">
        Loading…
      </p>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <ChartLineUp size={26} className="text-muted-foreground/40" />
        <p className="text-[15px] font-semibold">No history yet</p>
        <p className="max-w-xs text-[14px] text-muted-foreground">
          Log a set of this and the chart writes itself.
        </p>
      </div>
    )
  }

  const chartWidth = 320
  const chartHeight = 90
  const latestValue =
    metric === "volume"
      ? (latest?.volume ?? 0)
      : metric === "heaviest"
        ? (latest?.heaviestWeight ?? 0)
        : (latest?.bestE1rm ?? 0)

  return (
    <div>
      <PaneHeading>Records</PaneHeading>
      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border/50">
        <RecordCell
          label="Heaviest set"
          value={
            records.heaviestWeight
              ? formatWeight(records.heaviestWeight.value, unit)
              : "—"
          }
          hint={
            records.heaviestWeight &&
            formatSessionDate(records.heaviestWeight.date)
          }
        />
        <RecordCell
          label="Best est. 1RM"
          value={
            records.bestE1rm ? formatWeight(records.bestE1rm.value, unit) : "—"
          }
          hint={records.bestE1rm && formatSessionDate(records.bestE1rm.date)}
        />
        <RecordCell
          label="Best session volume"
          value={
            records.bestSessionVolume
              ? formatWeight(records.bestSessionVolume.value, unit)
              : "—"
          }
          hint={
            records.bestSessionVolume &&
            formatSessionDate(records.bestSessionVolume.date)
          }
        />
        <RecordCell
          label="Most reps in a set"
          value={records.mostReps ? `${records.mostReps.value}` : "—"}
          hint={records.mostReps && formatSessionDate(records.mostReps.date)}
        />
      </dl>

      <div className="mb-2 flex flex-wrap items-center gap-1">
        {(Object.keys(PROGRESS_METRIC_LABELS) as ProgressMetric[]).map(
          (value) => (
            <button
              key={value}
              type="button"
              aria-pressed={metric === value}
              onClick={() => {
                hapticSelection()
                setMetric(value)
              }}
              className={cn(
                "min-h-11 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                metric === value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground active:bg-muted/60"
              )}
            >
              {PROGRESS_METRIC_LABELS[value]}
            </button>
          )
        )}
      </div>

      {series.length >= 2 ? (
        <div className="mb-8 rounded-2xl bg-foreground/[0.04] px-4 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="text-[20px] leading-none font-bold">
              {formatWeight(latestValue, unit)}
            </p>
            {trend !== null && (
              <p
                className={cn(
                  "text-[13px] font-semibold",
                  trend > 0
                    ? "text-foreground"
                    : trend < 0
                      ? "text-destructive/80"
                      : "text-muted-foreground"
                )}
              >
                {trend > 0 ? "+" : ""}
                {trend}% all time
              </p>
            )}
          </div>
          <svg
            width={chartWidth}
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label={`${PROGRESS_METRIC_LABELS[metric]} across ${series.length} sessions, latest ${formatWeight(latestValue, unit)}`}
            className="w-full overflow-visible text-foreground/70"
          >
            <polyline
              points={sparklinePoints(series, chartWidth, chartHeight)}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : (
        <p className="mb-8 text-[14px] text-muted-foreground">
          One session logged. Come back after the next one and there will be a
          line.
        </p>
      )}

      <PaneHeading>History</PaneHeading>
      <ul className="divide-y divide-border/50 border-t border-border/50">
        {[...sessions].reverse().map((session) => (
          <li key={session.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-semibold">
                {formatSessionDate(session.date)}
              </p>
              <p className="shrink-0 text-[13px] text-muted-foreground">
                {formatWeight(session.volume, unit)} volume
              </p>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {session.sets
                .map(
                  (set) => `${formatWeightValue(set.weight, unit)}×${set.reps}`
                )
                .join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RecordCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string | null | false
}) {
  return (
    <div className="bg-background px-3 py-3">
      <dt className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Trophy size={11} className="shrink-0 opacity-60" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 text-[17px] leading-none font-bold">{value}</dd>
      {hint && (
        <p className="mt-1 text-[12px] text-muted-foreground/70">{hint}</p>
      )}
    </div>
  )
}

// ─── Instructions pane ────────────────────────────────────────────────────────

/**
 * Exported because the active workout shows the same content in a sheet —
 * mid-session, a modal beats losing your place to a page navigation.
 */
export function InstructionsPane({ exercise }: { exercise: ClientExercise }) {
  const facts = [
    ["Equipment", exercise.equipment && titleCase(exercise.equipment)],
    [
      "Type",
      EXERCISE_CATEGORY_LABELS[exercise.category] ??
        titleCase(exercise.category),
    ],
    ["Mechanic", exercise.mechanic && titleCase(exercise.mechanic)],
    ["Force", exercise.force && titleCase(exercise.force)],
    ["Level", exercise.level && titleCase(exercise.level)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))

  const instructions = exercise.instructions ?? []
  const secondaryMuscles = exercise.secondaryMuscles ?? []

  return (
    <div>
      <ExerciseArt
        exerciseId={exercise.id}
        exerciseName={exercise.name}
        className="mb-6"
      />

      <dl className="mb-8 flex flex-wrap gap-1.5">
        {facts.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[13px]"
          >
            <dt className="inline text-muted-foreground">{label}: </dt>
            <dd className="inline font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {secondaryMuscles.length > 0 && (
        <div className="mb-8">
          <PaneHeading>Also works</PaneHeading>
          <p className="text-[14px] text-muted-foreground">
            {secondaryMuscles.map(titleCase).join(" · ")}
          </p>
        </div>
      )}

      <PaneHeading>Instructions</PaneHeading>
      {instructions.length === 0 ? (
        <p className="text-[14px] text-muted-foreground">
          The dataset never wrote any down for this one. The pictures will have
          to carry it.
        </p>
      ) : (
        <ol className="space-y-3">
          {instructions.map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                {index + 1}
              </span>
              <p className="text-[14px] leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
