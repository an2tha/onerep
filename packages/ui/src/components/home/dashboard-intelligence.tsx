import { useEffect, useState } from "react"
import {
  ArrowRight,
  ForkKnife,
  ShareNetwork,
  TrendUp,
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

function ReadinessGauge({ score, tone }: { score: number; tone: string }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const swept = circumference * (Math.max(0, Math.min(100, score)) / 100)

  return (
    <div className="relative size-[76px] shrink-0" aria-hidden="true">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-foreground/[0.08]"
        />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          strokeWidth="6"
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
        <span className="text-[21px] font-bold tabular-nums">{score}</span>
      </div>
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
  className,
}: {
  story: DashboardWeeklyStory
  readiness: DashboardReadiness
  recentMeals: string[]
  onOpenProgress: () => void
  onOpenTraining: () => void
  onRepeatMeal: (name: string) => void
  onAskCoach: () => void
  className?: string
}) {
  const [active, setActive] = useState<"week" | "readiness">("week")
  const storyLine =
    story.workouts > 0
      ? `${story.workouts} session${story.workouts === 1 ? "" : "s"} and ${story.completedSets} completed sets.`
      : "No completed sessions yet. One repeatable workout is enough to start the week."

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
      aria-label="Weekly intelligence"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="app-section-title">Your week</p>
          <p className="native-row-detail mt-0.5">
            A useful signal, not another scorecard
          </p>
        </div>
        <button
          type="button"
          onClick={onAskCoach}
          className="motion-tactile min-h-11 text-[12px] font-semibold text-muted-foreground active:text-foreground"
        >
          Ask Coach
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
        <div
          className="grid grid-cols-2 border-b border-border"
          role="tablist"
          aria-label="Weekly insight"
        >
          {(["week", "readiness"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={active === item}
              onClick={() => setActive(item)}
              className={cn(
                "dashboard-intelligence-tab relative min-h-11 text-[11px] font-semibold text-muted-foreground capitalize",
                active === item && "text-foreground"
              )}
            >
              {item === "week" ? "Weekly story" : "Readiness"}
            </button>
          ))}
        </div>

        <div key={active} className="dashboard-intelligence-panel p-4">
          {active === "week" ? (
            <>
              <div className="flex items-start gap-3">
                <TrendUp
                  size={19}
                  weight="bold"
                  className="mt-0.5 shrink-0 text-[var(--accent-progress)]"
                />
                <div>
                  <p className="text-[15px] font-semibold">{storyLine}</p>
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                    Nutrition was logged on {story.nutritionDays} day
                    {story.nutritionDays === 1 ? "" : "s"}; protein averaged{" "}
                    {Math.round(story.proteinAdherence)}% of target.
                    {story.weightChange == null
                      ? ""
                      : ` Weight moved ${story.weightChange > 0 ? "+" : ""}${story.weightChange.toFixed(1)} ${story.weightUnit}.`}
                  </p>
                </div>
              </div>
              {story.records && story.records.length > 0 && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="text-[9px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                    Recent records
                  </p>
                  <div className="mt-2 space-y-2">
                    {story.records.map((record, index) => (
                      <div
                        key={`${record.label}-${index}`}
                        className="dashboard-record-in flex items-center gap-2 text-[11px]"
                        style={{ animationDelay: `${index * 55}ms` }}
                      >
                        <span className="size-1.5 rounded-full bg-[var(--accent-progress)]" />
                        <span className="font-semibold">{record.label}</span>
                        <span className="text-muted-foreground">
                          {record.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={onOpenProgress}
                  className="group inline-flex min-h-10 items-center gap-1.5 text-[11px] font-semibold"
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
                    className="motion-tactile inline-flex min-h-10 items-center gap-1.5 text-[11px] font-medium text-muted-foreground active:text-foreground"
                  >
                    <ShareNetwork size={13} /> Share
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <ReadinessGauge
                  score={readiness.score}
                  tone={READINESS_TONES[readiness.label]}
                />
                <div className="min-w-0">
                  <p
                    className="text-[17px] font-bold tracking-tight"
                    style={{ color: READINESS_TONES[readiness.label] }}
                  >
                    {readiness.label}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                    {readiness.advice}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3.5 border-t border-border/60 pt-4">
                {readiness.components.map((component, index) => (
                  <div
                    key={component.id}
                    className="dashboard-record-in"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold">
                        {component.label}
                        {component.score !== null && component.weight > 0 && (
                          <span className="ml-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                            {Math.round(component.weight * 100)}% of score
                          </span>
                        )}
                      </p>
                      <p className="shrink-0 text-[13px] font-semibold tabular-nums">
                        {component.score === null
                          ? "—"
                          : Math.round(component.score)}
                      </p>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{
                          width: `${component.score ?? 0}%`,
                          backgroundColor: READINESS_TONES[readiness.label],
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
                      {component.detail}
                    </p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={onOpenTraining}
                className="group mt-4 inline-flex min-h-10 items-center gap-1.5 text-[11px] font-semibold"
              >
                Adjust today’s training{" "}
                <ArrowRight
                  size={13}
                  className="transition-transform group-active:translate-x-0.5"
                />
              </button>
            </>
          )}
        </div>

        {recentMeals.length > 0 && (
          <div
            className="flex items-center gap-2 overflow-x-auto border-t border-border px-4 py-3"
            aria-label="Smart repeat meals"
          >
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <ForkKnife size={13} /> Repeat
            </span>
            {recentMeals.slice(0, 3).map((meal) => (
              <button
                key={meal}
                type="button"
                onClick={() => onRepeatMeal(meal)}
                className="motion-tactile min-h-9 shrink-0 rounded-full border border-border px-3 text-[11px] font-medium active:bg-muted"
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
