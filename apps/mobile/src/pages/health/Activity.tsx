import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import {
  HealthDetailShell,
  MetricTrend,
  ScoreDial,
  StatCell,
  StatGrid,
  formatCount,
  formatHours,
  toneVar,
} from "./shared"

/**
 * Movement: the minutes that count, and the ones that merely accumulate.
 *
 * Exercise minutes lead because that is the unit the guideline is written in.
 * Steps and active calories follow as the ambient background — useful, but
 * nobody ever got fit by optimising a step count.
 */
export default function HealthActivity() {
  const today = currentDateKey()
  const data = useQuery(api.logs.healthMetrics.dashboard, { today })
  const exercise = data?.pillars.find((item) => item.id === "exercise")
  const steps = data?.pillars.find((item) => item.id === "steps")
  const energy = data?.pillars.find((item) => item.id === "energy")
  const advice = data?.recommendations.filter(
    (item) =>
      item.pillar === "exercise" ||
      item.pillar === "steps" ||
      item.pillar === "energy"
  )

  return (
    <HealthDetailShell title="Activity" subtitle="Against public guidance">
      {data === undefined ? (
        <div
          className="mx-auto size-44 animate-pulse rounded-full bg-muted"
          data-route-loading="true"
        />
      ) : (
        <>
          <ScoreDial
            score={exercise?.score ?? null}
            caption={
              exercise?.value == null
                ? "no reading"
                : `${Math.round(exercise.value)} of ${exercise.target} min`
            }
            size={176}
            ticks={48}
          />

          <StatGrid>
            <StatCell
              label="Exercise"
              value={
                exercise?.value == null ? "—" : `${Math.round(exercise.value)}m`
              }
              caption={`of ${exercise?.target ?? 150}m weekly`}
              tone={toneVar(exercise?.score ?? null)}
            />
            <StatCell
              label="Steps"
              value={steps?.value == null ? "—" : formatCount(steps.value)}
              caption={`of ${formatCount(steps?.target ?? 8000)} daily`}
              tone={toneVar(steps?.score ?? null)}
            />
            <StatCell
              label="Active kcal"
              value={energy?.value == null ? "—" : formatCount(energy.value)}
              caption={`of ${formatCount(energy?.target ?? 400)} daily`}
              tone={toneVar(energy?.score ?? null)}
            />
          </StatGrid>

          {advice && advice.length > 0 && (
            <section className="grid gap-2.5" aria-label="How to move it">
              {advice.map((item, index) => (
                <div
                  key={item.title}
                  className="dashboard-record-in rounded-xl border border-border bg-card p-4"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <p className="text-[14px] leading-5 font-semibold">
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-[1.5] text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))}
            </section>
          )}

          <MetricTrend
            today={today}
            metric="exercise"
            title="Exercise minutes"
            format={formatHours}
            tone={toneVar(exercise?.score ?? null)}
          />
          <MetricTrend
            today={today}
            metric="steps"
            title="Steps"
            format={formatCount}
            tone="var(--accent-progress)"
          />
          <MetricTrend
            today={today}
            metric="energy"
            title="Active calories"
            format={(value) => `${formatCount(value)} kcal`}
            tone="var(--accent-food)"
          />
        </>
      )}
    </HealthDetailShell>
  )
}
