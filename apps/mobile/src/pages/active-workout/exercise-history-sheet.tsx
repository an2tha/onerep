/**
 * Strength history for one exercise, as a bottom sheet: max-weight trend,
 * estimated 1RM table, and the raw session list.
 */

import { useMemo } from "react"
import { MobileSheet } from "@/components/mobile-sheet"
import { useQuery } from "convex/react"
import { ArrowLeft, ChartLine } from "@phosphor-icons/react"
import { api } from "../../../../../convex/_generated/api"
import { sparklinePoints } from "@/lib/progress-metrics"
import { estimate1RM } from "@/lib/one-rm"
import type { WeightUnit } from "@/lib/workout-logging"

function formatSessionDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

type HistorySession = {
  id?: string
  date: string
  sets: Array<{
    weight: number
    reps: number
    completed: boolean
    type: string
  }>
}

export function ExerciseHistorySheet({
  exerciseId,
  exerciseName,
  unit,
  onClose,
}: {
  exerciseId: string
  exerciseName: string
  unit: WeightUnit
  onClose: () => void
}) {
  const history = useQuery(api.logs.workouts.historyForExercise, {
    exerciseId,
  }) as HistorySession[] | undefined

  const completedSessions = useMemo(() => {
    if (!history) return []
    return history
      .map((session) => ({
        ...session,
        sets: session.sets.filter((s) => s.completed !== false),
      }))
      .filter((s) => s.sets.length > 0)
  }, [history])

  const maxWeights = completedSessions.map((s) =>
    Math.max(...s.sets.map((set) => set.weight || 0))
  )

  const chartW = 280
  const chartH = 60
  const points = sparklinePoints(maxWeights, chartW, chartH)

  function fmtWeight(kg: number) {
    if (unit === "lbs") return `${+(kg * 2.20462).toFixed(1)}`
    return `${kg}`
  }

  function fmtSets(sets: HistorySession["sets"]) {
    return sets.map((s) => `${fmtWeight(s.weight)}×${s.reps}`).join(", ")
  }

  return (
    <MobileSheet
      onClose={onClose}
      ariaLabel="Exercise history"
      overlayClassName="sheet-overlay bg-black/50 backdrop-blur-[8px]"
      panelClassName="w-full max-w-sm overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_60px_rgba(0,0,0,0.22)]"
      panelStyle={{
        paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
      }}
      closeOnBackdrop
    >
      <>
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <button
            onClick={onClose}
            aria-label="Close history"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-muted/60"
            style={{
              color: "color-mix(in srgb, var(--foreground) 40%, transparent)",
            }}
          >
            <ArrowLeft size={14} weight="bold" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold tracking-tight">
              {exerciseName}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Strength history
            </p>
          </div>
        </div>

        {history === undefined ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-[13px] text-muted-foreground">Loading…</span>
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <ChartLine
              size={28}
              style={{
                color: "color-mix(in srgb, var(--foreground) 18%, transparent)",
              }}
            />
            <p className="text-[13px] font-semibold text-muted-foreground">
              No history yet
            </p>
            <p className="text-[13px] text-muted-foreground">
              Complete this exercise to start tracking
            </p>
          </div>
        ) : (
          <>
            {completedSessions.length >= 2 && (
              <div className="mx-5 mb-4 overflow-hidden rounded-2xl bg-foreground/[0.04] px-4 py-4">
                <p className="mb-3 text-[13px] font-bold text-muted-foreground">
                  Max weight · {unit}
                </p>
                <svg
                  width={chartW}
                  height={chartH}
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="w-full overflow-visible text-foreground/60"
                >
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.45"
                      />
                      <stop offset="100%" stopColor="currentColor" />
                    </linearGradient>
                  </defs>
                  <polyline
                    points={points}
                    fill="none"
                    stroke="url(#chartGrad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {maxWeights.map((w, i) => {
                    const x =
                      maxWeights.length === 1
                        ? chartW / 2
                        : (i / (maxWeights.length - 1)) * chartW
                    const min = Math.min(...maxWeights)
                    const max = Math.max(...maxWeights)
                    const range = max - min || 1
                    const y = chartH - ((w - min) / range) * (chartH * 0.85)
                    return (
                      <circle key={i} cx={x} cy={y} r="3" fill="currentColor" />
                    )
                  })}
                </svg>
                <div className="mt-2 flex justify-between">
                  <span className="text-[13px] text-muted-foreground">
                    {formatSessionDate(completedSessions[0].date)}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {formatSessionDate(
                      completedSessions[completedSessions.length - 1].date
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* ── Estimated 1RM ── */}
            {(() => {
              // Find the best working set across all sessions (highest estimated 1RM)
              const bestSet = completedSessions
                .flatMap((s) =>
                  s.sets.filter((set) => set.weight > 0 && set.reps > 0)
                )
                .reduce<{ weight: number; reps: number; est: number } | null>(
                  (best, set) => {
                    const est = estimate1RM(set.weight, set.reps)
                    return !best || est > best.est
                      ? { weight: set.weight, reps: set.reps, est }
                      : best
                  },
                  null
                )
              if (!bestSet) return null
              const orm = bestSet.est
              const fmtW = (kg: number) =>
                unit === "lbs"
                  ? `${+(kg * 2.20462).toFixed(1)}`
                  : `${+kg.toFixed(1)}`
              const pcts = [
                {
                  pct: 100,
                  label: "1RM (est.)",
                  color:
                    "color-mix(in srgb, var(--foreground) 78%, transparent)",
                },
                {
                  pct: 90,
                  label: "Training max",
                  color:
                    "color-mix(in srgb, var(--foreground) 55%, transparent)",
                },
                {
                  pct: 80,
                  label: "Heavy work",
                  color:
                    "color-mix(in srgb, var(--foreground) 45%, transparent)",
                },
                {
                  pct: 70,
                  label: "Moderate",
                  color:
                    "color-mix(in srgb, var(--foreground) 35%, transparent)",
                },
              ]
              return (
                <div
                  className="mx-5 mb-4 overflow-hidden rounded-2xl"
                  style={{
                    border:
                      "1px solid color-mix(in srgb, var(--foreground) 8%, transparent)",
                    background:
                      "color-mix(in srgb, var(--foreground) 3%, var(--card))",
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 pt-3 pb-2"
                    style={{
                      borderBottom:
                        "1px solid color-mix(in srgb, var(--foreground) 6%, transparent)",
                    }}
                  >
                    <p className="text-[13px] font-bold text-muted-foreground">
                      Estimated 1RM
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      from {fmtW(bestSet.weight)} {unit} × {bestSet.reps} reps
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-0">
                    {pcts.map(({ pct, label, color }) => {
                      const val = (orm * pct) / 100
                      return (
                        <div
                          key={pct}
                          className="flex flex-col items-center gap-0.5 px-2 py-3"
                        >
                          <span
                            className="text-[16px] leading-none font-semibold tracking-tight tabular-nums"
                            style={{ color }}
                          >
                            {fmtW(val)}
                          </span>
                          <span className="mt-0.5 text-[13px] font-medium text-muted-foreground">
                            {unit}
                          </span>
                          <span
                            className="mt-1 text-[13px] font-semibold"
                            style={{ color }}
                          >
                            {pct}%
                          </span>
                          <span className="text-center text-[13px] leading-tight text-muted-foreground">
                            {label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <div
              className="mx-5 overflow-hidden rounded-2xl"
              style={{
                border:
                  "1px solid color-mix(in srgb, var(--foreground) 7%, transparent)",
              }}
            >
              <p className="px-4 pt-3 pb-2 text-[13px] font-bold text-muted-foreground">
                Sessions
              </p>
              <div className="max-h-[240px] overflow-y-auto">
                {[...completedSessions].reverse().map((session, i) => (
                  <div
                    key={session.id ?? `${session.date}-${i}`}
                    className="flex items-start gap-3 px-4 py-2.5"
                    style={
                      i > 0
                        ? {
                            borderTop:
                              "1px solid color-mix(in srgb, var(--foreground) 5%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <span className="w-[52px] shrink-0 text-[13px] font-semibold text-muted-foreground">
                      {formatSessionDate(session.date)}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/70">
                      {fmtSets(session.sets)}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold text-muted-foreground tabular-nums">
                      {fmtWeight(
                        Math.max(...session.sets.map((s) => s.weight || 0))
                      )}{" "}
                      {unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </>
    </MobileSheet>
  )
}
