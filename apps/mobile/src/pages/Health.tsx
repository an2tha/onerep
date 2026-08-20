import { type CSSProperties, useState } from "react"
import {
  CaretRight,
  HeartbeatIcon,
  PencilSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { useSmoothNavigate } from "@/lib/navigation"
import { isHealthSyncSupportedPlatform } from "@/lib/health-provider"
import { hapticSelection } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { MobileSheet } from "@/components/mobile-sheet"
import { HealthReadingsSheet } from "@/components/health-readings-sheet"
import { EmptyState, MetricToggleList, PrimaryButton } from "@repo/ui"
import {
  HEALTH_DIALS,
  resolveHealthDialSelection,
} from "../../../../convex/lib/healthMetricCatalog"
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
  const [dialsOpen, setDialsOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const preferences = useQuery(api.users.users.getPreferences)
  const setHealthSync = useMutation(api.users.users.setHealthSync)
  const dialSelection = resolveHealthDialSelection(
    (preferences as { healthSync?: { dials?: Record<string, boolean> } } | null)
      ?.healthSync?.dials
  )

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
        <header className="app-header flex items-center justify-between gap-3">
          <h1 className="app-title">Health</h1>
          {/* The pair sits tight enough to read as one control cluster; two
              free-floating circles at the usual header gap looked like the
              second one had wandered in from another screen. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              aria-label="Correct a reading"
              className="app-translucent motion-tactile inline-flex size-10 shrink-0 items-center justify-center rounded-full"
            >
              <PencilSimple size={17} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => setDialsOpen(true)}
              aria-label="Choose which dials to show"
              className="app-translucent motion-tactile inline-flex size-10 shrink-0 items-center justify-center rounded-full"
            >
              <SlidersHorizontal size={17} weight="bold" />
            </button>
          </div>
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

      {editorOpen && (
        <HealthReadingsSheet
          today={today}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {dialsOpen && (
        <MobileSheet
          ariaLabel="Choose which dials to show"
          onClose={() => setDialsOpen(false)}
          overlayClassName="bg-black/45"
          panelClassName="mx-auto w-full max-w-md"
        >
          <div className="px-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="px-4 pb-1">
              <h2 className="text-[19px] font-bold tracking-tight">Dials</h2>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                Which areas sit at the top of this page. Switching one off hides
                the dial; its charts stay in Trends.
              </p>
            </div>
            <MetricToggleList
              onInteract={hapticSelection}
              onToggle={(key, enabled) => {
                void setHealthSync({ dials: { [key]: enabled } })
              }}
              groups={[
                {
                  key: "dials",
                  label: "Show on Health",
                  items: HEALTH_DIALS.map((dial) => ({
                    key: dial.key,
                    label: dial.label,
                    detail: dial.detail,
                    enabled: dialSelection[dial.key] === true,
                  })),
                },
              ]}
            />
          </div>
        </MobileSheet>
      )}
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
  const preferences = useQuery(api.users.users.getPreferences)
  const measurements = useQuery(api.bodyProgress.list) as
    { loggedAt: string; weightKg?: number }[] | undefined
  const weighed = (measurements ?? []).filter((row) => row.weightKg != null)
  const latestWeightKg = weighed.length
    ? weighed[weighed.length - 1].weightKg
    : undefined
  const weightUnit =
    (preferences as { weightUnit?: string } | null)?.weightUnit === "lbs"
      ? "lbs"
      : "kg"
  const weightCaption =
    latestWeightKg == null
      ? "nothing recorded"
      : weightUnit === "lbs"
        ? `${(latestWeightKg * 2.20462).toFixed(1)}lbs`
        : `${latestWeightKg.toFixed(1)}kg`
  const selection = resolveHealthDialSelection(
    (preferences as { healthSync?: { dials?: Record<string, boolean> } } | null)
      ?.healthSync?.dials
  )

  // Body carries no score: there is no honest target to grade a weight
  // against, so its ring stays empty and the label does the work.
  const detailFor: Record<string, { score: number | null; detail: string }> = {
    recovery: {
      score: data.recoveryScore,
      detail:
        recovery?.status === "ready"
          ? "nothing in your way"
          : recovery?.status === "steady"
            ? "hold something back"
            : recovery?.status === "compromised"
              ? "back off today"
              : "needs a week of data",
    },
    sleep: {
      score: sleep?.score ?? null,
      detail: recovery?.sleep
        ? `${formatHours(recovery.sleep.recent)} a night`
        : "nothing recorded",
    },
    activity: {
      score: exercise?.score ?? null,
      detail:
        exercise?.value == null
          ? "nothing recorded"
          : `${Math.round(exercise.value)} of ${exercise.target} minutes`,
    },
    heart: {
      score: cardio?.score ?? null,
      detail: recovery?.restingHeartRate
        ? `${Math.round(recovery.restingHeartRate.recent)}bpm resting`
        : "needs a week of data",
    },
    body: {
      score: null,
      detail: latestWeightKg == null ? "nothing recorded" : weightCaption,
    },
  }

  const visibleDials = HEALTH_DIALS.filter((dial) => selection[dial.key]).map(
    (dial) => ({
      ...dial,
      score: detailFor[dial.key]?.score ?? null,
      detail: detailFor[dial.key]?.detail ?? dial.detail,
    })
  )
  const dialSize = visibleDials.length >= 5 ? 84 : 104

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

        {/*
          Five dials do not fit at the four-dial size on a 360px phone, so the
          size falls out of how many are actually shown rather than being fixed:
          somebody who switches two off gets the bigger, more readable ring back.
        */}
        <div
          className="relative mt-9 flex items-end justify-center gap-1.5 pb-1 sm:mt-12 sm:gap-4"
          style={{ "--dial-arc": "clamp(8px, 3.2vw, 38px)" } as CSSProperties}
        >
          {visibleDials.map((dial, index) => (
            <DialButton
              key={dial.key}
              score={dial.score}
              label={dial.label}
              detail={dial.detail}
              to={dial.route}
              size={dialSize}
              index={index}
              // The ends of the arc sit highest, the middle lowest, whatever
              // the count: a fixed table of lifts only ever looked right for
              // exactly four.
              lift={
                index === 0 || index === visibleDials.length - 1 ? 1 : 1 / 9
              }
              tone={AREA_TONES[dial.key] ?? AREA_TONES.recovery}
            />
          ))}
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
          <p className="app-section-title mb-3">How to move it</p>
          {/* Centred and wrapping rather than a grid: there are two to four of
              these depending on what is measured, and a four-column grid
              holding three cards leaves a hole on the right. The cards keep
              their own width instead of stretching, so the row centres. */}
          <ul className="flex flex-wrap justify-center gap-3 sm:gap-4">
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
