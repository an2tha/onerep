import { ArrowRight, HeartbeatIcon } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { useSmoothNavigate } from "@/lib/navigation"
import { isHealthSyncSupportedPlatform } from "@/lib/health-provider"
import { hapticSelection } from "@/lib/haptics"
import { EmptyState, PrimaryButton } from "@repo/ui"
import {
  ScoreDial,
  ScoreRow,
  formatCount,
  formatHours,
} from "./health/shared"

/**
 * The health hub.
 *
 * One score, the sentence explaining it, and four doors. Everything that used
 * to be stacked on this page now lives behind one of them — the page's job is
 * to answer "how am I" in the first screenful and then get out of the way.
 *
 * All of it comes from `logs.healthMetrics.dashboard`, which is one query on
 * purpose: the scores are composites, and letting their inputs arrive on
 * separate subscriptions would let this render a number that was never true.
 */

type Dashboard = NonNullable<
  ReturnType<typeof useQuery<typeof api.logs.healthMetrics.dashboard>>
>

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

  return (
    <div className="desktop-canvas min-h-svh bg-background lg:pr-8 lg:pl-72">
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
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-[68px] animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  )
}

/** The one-line "why" under each door, phrased in that door's own unit. */
function rowDetail(value: string | null, fallback: string) {
  return value ?? fallback
}

function HealthHub({ data }: { data: Dashboard }) {
  const navigate = useSmoothNavigate()
  const recovery = data.recovery
  const sleep = data.pillars.find((pillar) => pillar.id === "sleep")
  const exercise = data.pillars.find((pillar) => pillar.id === "exercise")
  const cardio = data.pillars.find((pillar) => pillar.id === "cardio")

  return (
    <div className="grid gap-5">
      <section className="pt-1" aria-label="Health score">
        <ScoreDial
          score={data.score}
          caption={BAND_COPY[data.band] ?? "no reading"}
        />
      </section>

      {data.narrative && (
        <section
          className="rounded-xl border border-border bg-card p-4"
          aria-label="Summary"
        >
          <p className="text-[15px] leading-5 font-bold tracking-tight">
            {data.narrative.headline}
          </p>
          <p className="mt-2 text-[13px] leading-[1.55]">
            {data.narrative.body}
          </p>
        </section>
      )}

      <section className="grid gap-2.5" aria-label="Areas">
        <ScoreRow
          score={data.recoveryScore}
          label="Recovery"
          detail={rowDetail(
            recovery?.notes[0] ?? null,
            recovery?.status === "ready"
              ? "Nothing standing in your way today."
              : "Needs a week of readings to compare you with yourself."
          )}
          to="/health/recovery"
          index={0}
        />
        <ScoreRow
          score={sleep?.score ?? null}
          label="Sleep"
          detail={
            recovery?.sleep
              ? `${formatHours(recovery.sleep.recent)} a night against a ${formatHours(recovery.sleep.baseline)} baseline.`
              : "No sleep recorded yet."
          }
          to="/health/sleep"
          index={1}
        />
        <ScoreRow
          score={exercise?.score ?? null}
          label="Activity"
          detail={
            exercise?.value == null
              ? "No sessions recorded yet."
              : `${Math.round(exercise.value)} of ${exercise.target} minutes this week.`
          }
          to="/health/activity"
          index={2}
        />
        <ScoreRow
          score={cardio?.score ?? null}
          label="Heart"
          detail={
            recovery?.restingHeartRate
              ? `Resting ${Math.round(recovery.restingHeartRate.recent)}bpm, HRV ${recovery.hrv ? `${Math.round(recovery.hrv.recent)}ms` : "unmeasured"}.`
              : "Needs about a week of heart-rate readings."
          }
          to="/health/heart"
          index={3}
        />
      </section>

      {data.recommendations.length > 0 && (
        <section aria-label="How to move it">
          <p className="app-section-title mb-2">How to move it</p>
          <ol className="grid gap-2.5">
            {data.recommendations.map((recommendation, index) => (
              <li
                key={`${recommendation.pillar}-${recommendation.title}`}
                className="dashboard-record-in rounded-xl border border-border bg-card p-4"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] leading-5 font-semibold">
                    {recommendation.title}
                  </p>
                  {recommendation.potentialPoints > 0 && (
                    <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-1 text-[11px] font-bold text-muted-foreground tabular-nums">
                      +{recommendation.potentialPoints}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12px] leading-[1.5] text-muted-foreground">
                  {recommendation.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          hapticSelection()
          navigate("/health/trends", { motion: "forward" })
        }}
        className="motion-tactile flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">
            Trends and history
          </span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {data.measuredDays} of {data.windowDays} days measured this week ·{" "}
            {formatCount(data.pillars.filter((p) => p.score !== null).length)}{" "}
            signals tracked
          </span>
        </span>
        <ArrowRight
          size={15}
          weight="bold"
          className="shrink-0 text-muted-foreground/70"
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
