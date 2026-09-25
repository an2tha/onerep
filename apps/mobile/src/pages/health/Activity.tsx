import { tr } from "@repo/ui/i18n"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"
import {
  AREA_TONES,
  DialHero,
  MetricAbout,
  HealthDetailShell,
  MetricTrend,
  StatCell,
  StatGrid,
  formatCount,
  formatHours,
} from "./shared"
import { DialCustomMetrics } from "@/components/dial-custom-metrics"
import { TrackSomethingNew } from "@/components/track-something-new"

/**
 * Movement: the minutes that count, and the ones that merely accumulate.
 *
 * Exercise minutes lead because that is the unit the guideline is written in.
 * Steps and active calories follow as the ambient background — useful, but
 * nobody ever got fit by optimising a step count.
 */
export default function HealthActivity() {
  const today = currentDateKey()
  const energyUnit = useEnergyUnit()
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
    <HealthDetailShell
      title={tr("Activity")}
      subtitle={tr("Against public guidance")}
      heroFill={exercise?.score ?? null}
      charts={
        <>
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="exercise"
            title={tr("Exercise minutes")}
            format={formatHours}
            tone={AREA_TONES.activity}
          />
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="steps"
            title={tr("Steps")}
            format={formatCount}
            tone="var(--accent-health)"
          />
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="energy"
            title={tr("Active calories")}
            format={(value) =>
              `${formatCount(energyDisplay(value, energyUnit))} ${energyUnit}`
            }
            tone="var(--accent-food)"
          />
        </>
      }
      about={
        <MetricAbout
          items={[
            {
              term: "150 minutes a week",
              detail: tr(
                "The World Health Organization guideline for moderate aerobic activity in adults. Read from the health store, so runs, classes and rides count even when OneRep never saw them."
              ),
            },
            {
              term: "Why 8,000 steps, not 10,000",
              detail: tr(
                "The 10,000 figure came from the brand name of a 1960s Japanese pedometer, not from research. Cohort studies since put most of the mortality benefit between 7,000 and 8,000, with returns flattening after."
              ),
            },
            {
              term: "Active calories",
              detail: tr(
                "Energy burned above what you would have spent lying still. Device estimates vary a lot between makes, so the trend is worth more than any single day."
              ),
            },
            {
              term: "Minutes beat steps",
              detail: tr(
                "Exercise minutes carry more of this score than steps do, because sustained effort and ambient walking are not interchangeable however similar the totals look."
              ),
            },
          ]}
        />
      }
    >
      {data === undefined ? (
        <div
          className="mx-auto size-44 animate-pulse rounded-full bg-muted"
          data-route-loading="true"
        />
      ) : (
        <>
          <DialHero
            tone={AREA_TONES.activity}
            score={exercise?.score ?? null}
            caption={
              exercise?.value == null
                ? tr("no reading")
                : tr("{{value0}} of {{value1}} min", {
                    value0: Math.round(exercise.value),
                    value1: exercise.target,
                  })
            }
          >
            <StatGrid>
              <StatCell
                label={tr("Exercise")}
                value={
                  exercise?.value == null
                    ? "—"
                    : `${Math.round(exercise.value)}m`
                }
                caption={tr("of {{value0}}m weekly", {
                  value0: exercise?.target ?? 150,
                })}
              />
              <StatCell
                label={tr("Steps")}
                value={steps?.value == null ? "—" : formatCount(steps.value)}
                caption={tr("of {{value0}} daily", {
                  value0: formatCount(steps?.target ?? 8000),
                })}
              />
              <StatCell
                label={tr("Active {{value0}}", { value0: energyUnit })}
                value={energy?.value == null ? "—" : formatCount(energy.value)}
                caption={tr("of {{value0}} daily", {
                  value0: formatCount(energy?.target ?? 400),
                })}
              />
            </StatGrid>
          </DialHero>

          {advice && advice.length > 0 && (
            <section aria-label={tr("How to move it")}>
              <p className="app-section-title mb-2">{tr("How to move it")}</p>
              <ul className="divide-y divide-border border-t border-border">
                {advice.map((item, index) => (
                  <li
                    key={item.title}
                    className="progress-tab-enter px-1 py-3"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <p className="text-[15px] leading-5 font-semibold">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-[1.45] text-muted-foreground">
                      {item.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <DialCustomMetrics dial="activity" tone={AREA_TONES.activity} />

          <TrackSomethingNew
            tab="training"
            detail={tr(
              "A session, a distance, a habit OneRep does not count yet."
            )}
          />
        </>
      )}
    </HealthDetailShell>
  )
}
