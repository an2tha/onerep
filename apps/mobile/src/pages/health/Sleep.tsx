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
  formatHours,
  toneVar,
} from "./shared"

/**
 * Sleep, which is the pillar that moves everything else.
 *
 * Deliberately shows the baseline next to the recent average rather than a
 * target alone: seven hours is the guideline, but the number that predicts
 * how someone feels tomorrow is how far they are from their own normal.
 */
export default function HealthSleep() {
  const today = currentDateKey()
  const data = useQuery(api.logs.healthMetrics.dashboard, { today })
  const sleep = data?.recovery?.sleep
  const pillar = data?.pillars.find((item) => item.id === "sleep")
  const advice = data?.recommendations.find((item) => item.pillar === "sleep")

  return (
    <HealthDetailShell title="Sleep" subtitle="Asleep time, not time in bed">
      {data === undefined ? (
        <div
          className="mx-auto size-44 animate-pulse rounded-full bg-muted"
          data-route-loading="true"
        />
      ) : (
        <>
          <ScoreDial
            score={pillar?.score ?? null}
            caption={pillar?.score == null ? "no reading" : "of target"}
            size={176}
            ticks={48}
          />

          {sleep ? (
            <StatGrid>
              <StatCell
                label="Recent nights"
                value={formatHours(sleep.recent)}
                caption={`over ${Math.min(3, sleep.readings)} nights`}
              />
              <StatCell
                label="Your baseline"
                value={formatHours(sleep.baseline)}
                caption={`${sleep.readings} nights measured`}
              />
              <StatCell
                label="Against baseline"
                value={`${sleep.delta > 0 ? "+" : "−"}${formatHours(Math.abs(sleep.delta))}`}
                caption={sleep.delta >= 0 ? "ahead" : "behind"}
                tone={
                  sleep.delta >= -30
                    ? "var(--status-success)"
                    : "var(--status-caution)"
                }
              />
            </StatGrid>
          ) : (
            <NoReadings detail="A week of nights is needed before a baseline means anything." />
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
            metric="sleep"
            title="Nightly sleep"
            format={formatHours}
            tone={toneVar(pillar?.score ?? null)}
          />
        </>
      )}
    </HealthDetailShell>
  )
}
