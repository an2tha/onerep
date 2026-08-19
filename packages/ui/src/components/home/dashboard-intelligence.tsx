import { useEffect, useState, type ReactNode } from "react"
import {
  ArrowRight,
  ForkKnife,
  ShareNetwork,
  SlidersHorizontal,
} from "@phosphor-icons/react"
import { cn } from "../../lib/utils"

export type DashboardWeeklyStory = {
  workouts: number
  completedSets: number
  nutritionDays: number
  proteinAdherence: number
  weightChange?: number
  weightUnit: "kg" | "lbs"
  records?: Array<{ label: string; detail: string }>
}

export type DashboardReadinessComponent = {
  id: string
  label: string
  score: number | null
  weight: number
  detail: string
}

export type DashboardReadiness = {
  score: number
  label: "Ready" | "Steady" | "Recover"
  advice: string
  components: DashboardReadinessComponent[]
}

const READINESS_TONES: Record<DashboardReadiness["label"], string> = {
  Ready: "var(--status-success)",
  Steady: "var(--status-caution)",
  Recover: "var(--status-danger)",
}

function ScoreRing({
  score,
  tone,
  size = 76,
  stroke = 6,
  children,
}: {
  score: number
  tone: string
  size?: number
  stroke?: number
  /** What reads in the middle. Defaults to the score the arc is drawing. */
  children?: ReactNode
}) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const swept = circumference * (Math.max(0, Math.min(100, score)) / 100)

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="macro-dial-glass"
        style={{ inset: `${(stroke / 76) * 100}%` }}
      />
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-foreground/[0.08]"
        />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={drawn ? circumference - swept : circumference}
          style={{
            stroke: tone,
            transition:
              "stroke-dashoffset 700ms var(--motion-ease-out, ease-out)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {children ?? (
          <span className="text-[21px] font-bold tabular-nums">{score}</span>
        )}
      </div>
    </div>
  )
}

function WeekMetric({
  value,
  suffix,
  label,
  muted,
}: {
  value: string
  suffix?: string
  label: string
  muted?: boolean
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-[22px] leading-none font-bold tracking-tight tabular-nums",
          muted && "text-muted-foreground"
        )}
      >
        {value}
        {suffix && (
          <span className="ml-0.5 text-[13px] font-semibold text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
      <p className="mt-1.5 truncate text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  )
}

export function DashboardIntelligence({
  story,
  readiness,
  recentMeals,
  onOpenProgress,
  onOpenTraining,
  onRepeatMeal,
  onAskCoach,
  health,
  onOpenHealth,
  onCustomize,
  className,
}: {
  story: DashboardWeeklyStory
  readiness: DashboardReadiness
  recentMeals: string[]
  onOpenProgress: () => void
  onOpenTraining: () => void
  onRepeatMeal: (name: string) => void
  onAskCoach: () => void
  /** From the health dashboard; null until a week of readings exists. */
  health?: { score: number | null; band?: string } | null
  onOpenHealth?: () => void
  onCustomize?: () => void
  className?: string
}) {
  const weekPct = Math.round((story.nutritionDays / 7) * 100)
  const storyLine =
    story.workouts === 0
      ? "No sessions yet. One repeatable workout is enough to start the week."
      : story.nutritionDays < 3
        ? "Training is on the board. A few more logged days would make the next block easier to tune."
        : story.proteinAdherence < 80
          ? "Training is holding steady; protein is the piece lagging behind."
          : "Training and nutrition are both on pace this week."

  async function shareWeeklyStory() {
    const summary = `${story.workouts} workouts · ${story.completedSets} sets · ${story.nutritionDays}/7 nutrition days · ${Math.round(story.proteinAdherence)}% protein`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#111512"/><text x="80" y="120" fill="#9ca39d" font-family="sans-serif" font-size="32">MY ONEREP WEEK</text><text x="80" y="250" fill="#fff" font-family="sans-serif" font-size="72" font-weight="700">${story.workouts} workouts</text><text x="80" y="350" fill="#fff" font-family="sans-serif" font-size="52">${story.completedSets} completed sets</text><line x1="80" y1="430" x2="1000" y2="430" stroke="#394039"/><text x="80" y="550" fill="#d8ded9" font-family="sans-serif" font-size="46">Nutrition logged ${story.nutritionDays} of 7 days</text><text x="80" y="630" fill="#d8ded9" font-family="sans-serif" font-size="46">Protein adherence ${Math.round(story.proteinAdherence)}%</text><text x="80" y="950" fill="#78d69a" font-family="sans-serif" font-size="34">Built with OneRep</text></svg>`
    const file = new File(
      [new Blob([svg], { type: "image/svg+xml" })],
      "onerep-week.svg",
      { type: "image/svg+xml" }
    )
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: "My OneRep week",
        text: summary,
        files: [file],
      })
    } else {
      await navigator.share({ title: "My OneRep week", text: summary })
    }
  }

  return (
    <section
      className={cn(
        "dashboard-intelligence mx-[var(--app-page-x)] mt-5 md:mx-8",
        className
      )}
      aria-label="Your week"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="app-section-title">Your week</p>
        <div className="flex items-center gap-1">
          {onCustomize && (
            <button
              type="button"
              onClick={onCustomize}
              aria-label="Customize dashboard"
              className="app-translucent motion-tactile inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold"
            >
              <SlidersHorizontal size={14} weight="bold" />
              Customize
            </button>
          )}
          <button
            type="button"
            onClick={onAskCoach}
            className="motion-tactile min-h-11 px-2 text-[12px] font-semibold text-muted-foreground active:text-foreground"
          >
            Ask Coach
          </button>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
        <div className="px-4 pt-4 pb-4">
          <p className="text-[13px] leading-5">
            {storyLine}
            {story.weightChange != null && (
              <span className="text-muted-foreground">
                {" "}
                Weight moved {story.weightChange > 0 ? "+" : ""}
                {story.weightChange.toFixed(1)} {story.weightUnit}.
              </span>
            )}
          </p>

          <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-border/60 pt-3.5">
            <WeekMetric
              value={String(story.workouts)}
              label="Sessions"
              muted={story.workouts === 0}
            />
            <WeekMetric
              value={String(story.completedSets)}
              label="Sets"
              muted={story.completedSets === 0}
            />
            <WeekMetric
              value={String(Math.round(story.proteinAdherence))}
              suffix="%"
              label="Protein"
              muted={story.proteinAdherence === 0}
            />
          </div>

          {story.records && story.records.length > 0 && (
            <div className="mt-3.5 space-y-2 border-t border-border/60 pt-3.5">
              {story.records.map((record, index) => (
                <div
                  key={`${record.label}-${index}`}
                  className="dashboard-record-in flex items-baseline gap-2 text-[12px]"
                  style={{ animationDelay: `${index * 55}ms` }}
                >
                  <span className="size-1.5 shrink-0 self-center rounded-full bg-[var(--accent-progress)]" />
                  <span className="font-semibold">{record.label}</span>
                  <span className="truncate text-muted-foreground">
                    {record.detail}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenProgress}
              className="group inline-flex min-h-10 items-center gap-1.5 text-[12px] font-semibold"
            >
              See full progress{" "}
              <ArrowRight
                size={13}
                className="transition-transform group-active:translate-x-0.5"
              />
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                type="button"
                onClick={() => void shareWeeklyStory()}
                className="motion-tactile inline-flex min-h-10 items-center gap-1.5 text-[12px] font-medium text-muted-foreground active:text-foreground"
              >
                <ShareNetwork size={13} /> Share
              </button>
            )}
          </div>
        </div>

        {recentMeals.length > 0 && (
          <div
            className="flex items-center gap-2 overflow-x-auto border-t border-border px-4 py-3"
            aria-label="Smart repeat meals"
          >
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-muted-foreground">
              <ForkKnife size={14} /> Repeat
            </span>
            {recentMeals.slice(0, 3).map((meal) => (
              <button
                key={meal}
                type="button"
                onClick={() => onRepeatMeal(meal)}
                className="motion-tactile min-h-9 shrink-0 rounded-full border border-border px-3 text-[12px] font-medium active:bg-muted"
              >
                {meal}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * The week's three readings, compressed for the hero: a ring each, the number
 * inside it, and — the part that was missing — a line saying what the number
 * actually measures. A dial nobody can read is decoration.
 */
export function DashboardWeekRings({
  readiness,
  story,
  health,
  onOpenTraining,
  onOpenHealth,
  onOpenProgress,
  className,
}: {
  readiness: DashboardReadiness
  story: DashboardWeeklyStory
  health?: { score: number | null; band?: string } | null
  onOpenTraining: () => void
  onOpenHealth?: () => void
  onOpenProgress: () => void
  className?: string
}) {
  const rings = [
    {
      id: "readiness",
      value: String(readiness.score),
      label: readiness.label,
      hint: "to train today",
      tone: READINESS_TONES[readiness.label],
      score: readiness.score,
      onOpen: onOpenTraining,
      describe: `Readiness ${readiness.score} of 100, ${readiness.label}: how recovered you are for training today. ${readiness.advice}`,
    },
    {
      id: "health",
      value: health?.score == null ? "—" : String(health.score),
      label: health?.band ? titleCase(health.band) : "Health",
      hint: "7-day signals",
      tone: "var(--accent-progress)",
      score: health?.score ?? 0,
      onOpen: onOpenHealth,
      describe:
        health?.score == null
          ? "Health score: needs about a week of readings from Apple Health or Health Connect."
          : `Health ${health.score} of 100: sleep, activity, heart and recovery over the last week.`,
    },
    {
      id: "logged",
      value: `${story.nutritionDays}/7`,
      label: "Logged",
      hint: "days this week",
      tone: "var(--accent-food)",
      score: Math.round((story.nutritionDays / 7) * 100),
      onOpen: onOpenProgress,
      describe: `Logged ${story.nutritionDays} of 7 days: how many days this week you recorded food.`,
    },
  ]

  return (
    <div
      className={cn("flex items-start justify-between gap-2", className)}
      aria-label="Your week at a glance"
    >
      {rings.map((ring) => (
        <button
          key={ring.id}
          type="button"
          onClick={ring.onOpen}
          disabled={!ring.onOpen}
          aria-label={ring.describe}
          className="motion-tactile flex min-w-0 flex-1 flex-col items-center gap-1 disabled:opacity-100"
        >
          <ScoreRing score={ring.score} tone={ring.tone} size={46} stroke={4}>
            <span className="text-[13px] font-bold tabular-nums">
              {ring.value}
            </span>
          </ScoreRing>
          <span className="max-w-full truncate text-[11.5px] font-semibold">
            {ring.label}
          </span>
          <span className="max-w-full truncate text-[11px] text-muted-foreground">
            {ring.hint}
          </span>
        </button>
      ))}
    </div>
  )
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
