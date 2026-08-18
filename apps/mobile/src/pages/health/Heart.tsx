import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import {
  HealthDetailShell,
  MetricTrend,
  NoReadings,
  ScoreDial,
  StatCell,
  StatGrid,
  formatCount,
  toneVar,
} from "./shared"

/**
 * The cardiovascular pillar, which is the only one graded on a curve.
 *
 * There are no absolute targets here on purpose. A fit 25-year-old and a fit
 * 60-year-old differ by more than any threshold could survive, so both charts
 * are drawn as levels against the person's own baseline rather than against a
 * line labelled "good".
 */
export default function HealthHeart() {
  const today = currentDateKey()
  const data = useQuery(api.logs.healthMetrics.dashboard, { today })
  const cardio = data?.pillars.find((item) => item.id === "cardio")
  const recovery = data?.recovery
  const advice = data?.recommendations.find((item) => item.pillar === "cardio")

  return (
    <HealthDetailShell title="Heart" subtitle="Relative to your own normal">
      {data === undefined ? (
        <div
          className="mx-auto size-44 animate-pulse rounded-full bg-muted"
          data-route-loading="true"
        />
      ) : (
        <>
          <ScoreDial
            score={cardio?.score ?? null}
            caption={cardio?.score == null ? "no baseline" : "stability"}
            size={176}
            ticks={48}
          />

          {recovery?.hrv || recovery?.restingHeartRate ? (
            <StatGrid columns={2}>
              <StatCell
                label="Heart rate variability"
                value={
                  recovery.hrv ? `${Math.round(recovery.hrv.recent)}ms` : "—"
                }
                caption={
                  recovery.hrv
                    ? `${recovery.hrv.delta >= 0 ? "+" : "−"}${Math.abs(Math.round(recovery.hrv.delta))}ms on baseline`
                    : "no readings"
                }
                tone={
                  recovery.hrv && recovery.hrv.delta < 0
                    ? "var(--status-caution)"
                    : "var(--status-success)"
                }
              />
              <StatCell
                label="Resting heart rate"
                value={
                  recovery.restingHeartRate
                    ? `${Math.round(recovery.restingHeartRate.recent)}bpm`
                    : "—"
                }
                caption={
                  recovery.restingHeartRate
                    ? `${recovery.restingHeartRate.delta >= 0 ? "+" : "−"}${Math.abs(Math.round(recovery.restingHeartRate.delta))}bpm on baseline`
                    : "no readings"
                }
                // Up is the wrong direction for a resting rate.
                tone={
                  recovery.restingHeartRate &&
                  recovery.restingHeartRate.delta > 0
                    ? "var(--status-caution)"
                    : "var(--status-success)"
                }
              />
            </StatGrid>
          ) : (
            <NoReadings detail="Needs about a week of heart-rate readings before there is a baseline to compare against." />
          )}

          {advice && (
            <section className="rounded-xl border border-border bg-card p-4">
              <p className="text-[14px] leading-5 font-semibold">
                {advice.title}
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.55] text-muted-foreground">
                {advice.detail}
              </p>
            </section>
          )}

          <MetricTrend
            today={today}
            metric="hrv"
            kind="line"
            title="Heart rate variability"
            format={(value) => `${formatCount(value)}ms`}
            tone="var(--accent-water)"
          />
          <MetricTrend
            today={today}
            metric="restingHeartRate"
            kind="line"
            title="Resting heart rate"
            format={(value) => `${formatCount(value)}bpm`}
            tone={toneVar(cardio?.score ?? null)}
          />
        </>
      )}
    </HealthDetailShell>
  )
}
