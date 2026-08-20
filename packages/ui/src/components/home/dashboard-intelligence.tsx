import { useEffect, useState, type ReactNode } from "react"
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
      className={cn(
        // Centred and close together: the three readings are one instrument,
        // and spread across the full width they read as three unrelated
        // tiles that happen to share a row.
        "flex items-start justify-center gap-5 pb-[26px] sm:gap-8",
        className
      )}
      aria-label="Your week at a glance"
    >
      {rings.map((ring, index) => (
        <button
          key={ring.id}
          type="button"
          onClick={ring.onOpen}
          disabled={!ring.onOpen}
          aria-label={ring.describe}
          className="motion-tactile flex w-[86px] shrink-0 flex-col items-center gap-1.5 disabled:opacity-100"
          // The three sit on an arc — the middle ring at its crown, the outer
          // two settled lower — so the row reads as one gauge rather than
          // three tiles that happen to share a baseline.
          style={{ transform: `translateY(${index === 1 ? 0 : 26}px)` }}
        >
          <ScoreRing score={ring.score} tone={ring.tone} size={68} stroke={5}>
            <span className="text-[19px] font-bold tabular-nums">
              {ring.value}
            </span>
          </ScoreRing>
          <span className="max-w-full truncate text-[13px] font-semibold">
            {ring.label}
          </span>
          <span className="max-w-full truncate text-[11.5px] text-muted-foreground">
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
