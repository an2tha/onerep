import { tr } from "@repo/ui/i18n"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import { useSmoothNavigate } from "@/lib/navigation"
import {
  AREA_TONES,
  HealthDetailShell,
  MetricAbout,
  MetricTrend,
  NoReadings,
  StatCell,
  StatGrid,
} from "./shared"
import { DialCustomMetrics } from "@/components/dial-custom-metrics"
import { TrackSomethingNew } from "@/components/track-something-new"
import { useWeightUnit } from "@/lib/use-weight-unit"
import { formatBodyWeight as formatDisplayWeight } from "@/lib/exercise-display"

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

/**
 * Weight and composition, read from the scale or typed at a check-in.
 *
 * No dial and no score. Every other area screen grades you against a target,
 * and there is no honest target here — a good weight depends on what someone
 * is training for, and inventing a number to colour a ring against would be
 * the app having an opinion it has not earned. The trend is the whole answer,
 * so the charts lead and the stats sit under them.
 */
export default function HealthBody() {
  const today = currentDateKey()
  const navigate = useSmoothNavigate()
  // Storage is kilograms everywhere; the display unit is the user's.
  const weightUnit = useWeightUnit()
  const formatWeight = (kg: number) => formatDisplayWeight(kg, weightUnit)
  const measurements = useQuery(api.bodyProgress.list) as
    | {
        loggedAt: string
        weightKg?: number
        bodyFatPct?: number
        leanBodyMassKg?: number
        source?: string
      }[]
    | undefined

  const chronological = (measurements ?? [])
    .slice()
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  const weighed = chronological.filter((row) => row.weightKg != null)
  const latest = weighed[weighed.length - 1]
  const first = weighed[0]
  // Against the first reading in the log rather than the previous one: a
  // day-to-day difference on a bathroom scale is mostly water, and showing it
  // as progress teaches people to read noise as a result.
  const change =
    latest && first && latest !== first
      ? (latest.weightKg as number) - (first.weightKg as number)
      : null
  // Off every reading, not off the weighed ones. A smart scale that reports
  // body fat on a morning it could not get a stable weight — or a caliper
  // entry typed on its own — used to land in the table and show up nowhere,
  // because this list was filtered down to days that had a weight first.
  const withFat = chronological.filter((row) => row.bodyFatPct != null)
  const latestFat = withFat[withFat.length - 1]

  return (
    <HealthDetailShell
      title={tr("Body")}
      subtitle={tr("Weight and composition over time")}
      charts={
        <>
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="weight"
            title={tr("Weight")}
            format={formatWeight}
            kind="line"
            tone={AREA_TONES.recovery}
          />
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="bodyFat"
            title={tr("Body fat")}
            format={formatPercent}
            kind="line"
            tone={AREA_TONES.activity}
          />
        </>
      }
      about={
        <MetricAbout
          items={[
            {
              term: "Where these come from",
              detail: tr(
                "Check-ins you type in Progress, and readings your scale writes to Apple Health or Health Connect if you have that switched on. A number you entered yourself always wins over a synced one for the same day."
              ),
            },
            {
              term: "Why the line has gaps",
              detail: tr(
                "A day nobody weighed in is drawn as a break rather than a drop to zero. Weekly weigh-ins make an honest sparse line; daily ones make a noisy dense one, and both are fine."
              ),
            },
            {
              term: "Reading the change",
              detail: tr(
                "Measured against your first reading here, not yesterday's. Day-to-day movement on a bathroom scale is mostly water and gut content — a fortnight is the shortest window that means anything."
              ),
            },
            {
              term: "Body fat percentages",
              detail: tr(
                "Smart scales estimate this from electrical impedance and are more useful for direction than for the absolute figure. Treat a move from 22 to 20 as real and the 20 itself as approximate."
              ),
            },
          ]}
        />
      }
    >
      {measurements === undefined ? (
        <div
          className="h-28 animate-pulse rounded-lg bg-muted"
          data-route-loading="true"
        />
      ) : weighed.length === 0 ? (
        <NoReadings
          detail={tr(
            "Log a check-in in Progress, or switch on health sync to pull your scale readings in."
          )}
        />
      ) : (
        <StatGrid>
          <StatCell
            label={tr("Latest")}
            value={formatWeight(latest?.weightKg as number)}
            caption={
              latest?.source === "health"
                ? tr("from your scale")
                : tr("you logged it")
            }
          />
          <StatCell
            label={tr("Since you started")}
            value={
              change == null
                ? "—"
                : `${change > 0 ? "+" : "−"}${formatWeight(Math.abs(change))}`
            }
            caption={tr("over {{value0}} check-ins", {
              value0: weighed.length,
            })}
          />
          {latestFat && (
            <StatCell
              label={tr("Body fat")}
              value={formatPercent(latestFat.bodyFatPct as number)}
              caption={
                latestFat.leanBodyMassKg
                  ? tr("{{value0}} lean", {
                      value0: formatWeight(latestFat.leanBodyMassKg),
                    })
                  : tr("latest reading")
              }
            />
          )}
        </StatGrid>
      )}

      <DialCustomMetrics dial="body" tone={AREA_TONES.body} />

      <TrackSomethingNew
        tab="body"
        detail={tr(
          "Measurements or habits the check-in form has no field for."
        )}
      />

      <button
        type="button"
        onClick={() => navigate("/progress", { motion: "switch" })}
        className="motion-tactile mt-4 min-h-11 px-1 text-[13px] font-semibold"
      >
        {tr("Log or correct a check-in")}
      </button>
    </HealthDetailShell>
  )
}
