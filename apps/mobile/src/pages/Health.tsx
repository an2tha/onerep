import { type CSSProperties } from "react"
import { CaretRight, HeartbeatIcon } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { useSmoothNavigate } from "@/lib/navigation"
import { isHealthSyncSupportedPlatform } from "@/lib/health-provider"
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { EmptyState, PrimaryButton } from "@repo/ui"
import {
  AREA_TONES,
  ActionMotif,
  DialButton,
  formatHours,
} from "./health/shared"

/**
 * The health hub.
 *
 * One score, the sentence explaining it, and four doors. Everything that used
 * to be stacked here now lives behind one of them — the page's job is to
 * answer "how am I" in the first screenful and then get out of the way.
 *
 * All of it comes from `logs.healthMetrics.dashboard`, which is one query on
 * purpose: the scores are composites, and letting their inputs arrive on
 * separate subscriptions would let this render a number that was never true.
 */

type Dashboard = NonNullable<
  ReturnType<typeof useQuery<typeof api.logs.healthMetrics.dashboard>>
>

/** One accent per pillar, so the cards read as a set without any of them shouting. */
const ACTION_TONES: Record<string, string> = {
  sleep: "var(--accent-water)",
  exercise: "var(--accent-workout)",
  steps: "var(--accent-progress)",
  energy: "var(--accent-food)",
  cardio: "var(--accent-health)",
}

const BAND_COPY: Record<string, string> = {
  excellent: "excellent",
  solid: "solid",
  fair: "fair",
  poor: "needs work",
  unknown: "no reading",
}

export default function Health() {
  const navigate = useSmoothNavigate()
  const today = currentDateKey()
  const data = useQuery(api.logs.healthMetrics.dashboard, { today })
  const scored = data?.score ?? null

  return (
    <div
      className={cn(
        "desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72",
        // The wash starts at the very top so the title sits inside it rather
        // than on the far side of a seam, and it deepens with the score.
        scored !== null && "app-hero"
      )}
      style={
        scored !== null
          ? ({
              "--hero-fill": scored,
              "--hero-accent": "var(--accent-health)",
            } as CSSProperties)
          : undefined
      }
    >
      {scored !== null && <span className="app-hero-wash" aria-hidden="true" />}
      <main className="app-page pb-28">
        <header className="app-header">
          <h1 className="app-title">Health</h1>
        </header>

        {data === undefined ? (
          <HealthLoading />
        ) : !data || data.score === null ? (
          <EmptyState
            icon={HeartbeatIcon}
            title="Nothing to read yet"
            detail={
              isHealthSyncSupportedPlatform()
                ? "Connect Apple Health or Health Connect and give it a few days. The scores need about a week of readings before they mean anything."
                : "This page reads the health store on your phone. Open OneRep on iOS or Android with health sync on and the numbers will follow."
            }
            action={
              <PrimaryButton
                onClick={() => navigate("/settings", { motion: "forward" })}
              >
                Open health settings
              </PrimaryButton>
            }
          />
        ) : (
          <HealthHub data={data} />
        )}
      </main>
    </div>
  )
}

function HealthLoading() {
  return (
    <div className="grid gap-4" data-route-loading="true">
      <div className="mx-auto size-52 animate-pulse rounded-full bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

function HealthHub({ data }: { data: Dashboard }) {
  const navigate = useSmoothNavigate()
  const recovery = data.recovery
  const sleep = data.pillars.find((pillar) => pillar.id === "sleep")
  const exercise = data.pillars.find((pillar) => pillar.id === "exercise")
  const cardio = data.pillars.find((pillar) => pillar.id === "cardio")

  return (
    <>
      {/*
        The same hero as Nutrition, to the class: the one number the page
        exists to answer, a line of context under it, then a row of overlapping
        dials. Only the dials differ — four areas instead of three macros — and
        the score is stated once, up top, rather than again inside a ring.
      */}
      <section className="progress-tab-enter relative pt-3 pb-7 text-center sm:pt-5 sm:pb-10">
        <p className="flex items-baseline justify-center gap-1.5">
          <span
            key={data.score}
            className="motion-number-refresh text-[3.25rem] leading-none font-extrabold tracking-tight tabular-nums"
          >
            {data.score}
          </span>
          <span className="text-[1.05rem] font-semibold text-muted-foreground">
            {BAND_COPY[data.band] ?? "no reading"}
          </span>
        </p>
        <p className="mt-2.5 text-[13px] text-muted-foreground tabular-nums">
          {data.measuredDays} of {data.windowDays} days measured ·{" "}
          {data.pillars.filter((pillar) => pillar.score !== null).length}{" "}
          signals
        </p>

        <div
          className="relative mt-9 flex items-end justify-center gap-2 pb-1 sm:mt-12 sm:gap-4"
          style={{ "--dial-arc": "clamp(10px, 3.6vw, 38px)" } as CSSProperties}
        >
          <DialButton
            score={data.recoveryScore}
            label="Recovery"
            detail={
              recovery?.status === "ready"
                ? "nothing in your way"
                : recovery?.status === "steady"
                  ? "hold something back"
                  : recovery?.status === "compromised"
                    ? "back off today"
                    : "needs a week of data"
            }
            to="/health/recovery"
            index={0}
            lift={1}
            tone={AREA_TONES.recovery}
          />
          <DialButton
            score={sleep?.score ?? null}
            label="Sleep"
            detail={
              recovery?.sleep
                ? `${formatHours(recovery.sleep.recent)} a night`
                : "nothing recorded"
            }
            to="/health/sleep"
            index={1}
            lift={1 / 9}
            tone={AREA_TONES.sleep}
          />
          <DialButton
            score={exercise?.score ?? null}
            label="Activity"
            detail={
              exercise?.value == null
                ? "nothing recorded"
                : `${Math.round(exercise.value)} of ${exercise.target} minutes`
            }
            to="/health/activity"
            index={2}
            lift={1 / 9}
            tone={AREA_TONES.activity}
          />
          <DialButton
            score={cardio?.score ?? null}
            label="Heart"
            detail={
              recovery?.restingHeartRate
                ? `${Math.round(recovery.restingHeartRate.recent)}bpm resting`
                : "needs a week of data"
            }
            to="/health/heart"
            index={3}
            lift={1}
            tone={AREA_TONES.heart}
          />
        </div>
      </section>

      {data.narrative && (
        <section
          className="progress-tab-enter border-t border-border px-1 py-4"
          style={{ animationDelay: "80ms" }}
          aria-label="Summary"
        >
          <p className="text-[15px] leading-5 font-semibold">
            {data.narrative.headline}
          </p>
          <p className="mt-2 max-w-[68ch] text-[13px] leading-[1.55] text-muted-foreground">
            {data.narrative.body}
          </p>
        </section>
      )}

      {data.recommendations.length > 0 && (
        <section className="mt-5" aria-label="How to move it">
          <p className="app-section-title mb-2.5">How to move it</p>
          {/* Centred and wrapping rather than a grid: there are two to four of
              these depending on what is measured, and a four-column grid
              holding three cards leaves a hole on the right. The cards keep
              their own width instead of stretching, so the row centres. */}
          <ul className="flex flex-wrap justify-center gap-3">
            {data.recommendations.map((recommendation, index) => (
              <li
                key={`${recommendation.pillar}-${recommendation.title}`}
                className="health-action-card progress-tab-enter w-full p-4 sm:w-[16.5rem]"
                style={
                  {
                    animationDelay: `${index * 70}ms`,
                    "--action-tone": ACTION_TONES[recommendation.pillar],
                  } as CSSProperties
                }
              >
                <ActionMotif variant={index} />
                <p className="flex items-baseline gap-1 text-[2rem] leading-none font-extrabold tracking-tight tabular-nums">
                  {recommendation.amount > 0 && "+"}
                  {recommendation.amount.toLocaleString()}
                  <span className="text-[0.95rem] font-bold text-muted-foreground">
                    {recommendation.unit}
                  </span>
                </p>
                <p className="mt-2 text-[13px] leading-[1.35] font-semibold">
                  {recommendation.action}
                </p>
                {recommendation.potentialPoints > 0 && (
                  <p className="mt-3 text-[11px] font-semibold text-muted-foreground tabular-nums">
                    +{recommendation.potentialPoints} to score
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          hapticSelection()
          navigate("/health/trends", { motion: "forward" })
        }}
        className="mt-5 flex min-h-14 w-full items-center justify-between gap-3 border-y border-border px-1 py-3.5 text-left transition-colors active:bg-muted/45"
        aria-label="Open trends and history"
      >
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">Trends and history</p>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            Every signal by week, month or year
          </p>
        </div>
        <CaretRight
          size={14}
          weight="bold"
          className="shrink-0 text-muted-foreground"
        />
      </button>
    </>
  )
}
