import { choice, tr } from "@repo/ui/i18n"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import {
  AdviceBlock,
  AREA_TONES,
  DialHero,
  MetricAbout,
  HealthDetailShell,
  MetricTrend,
  NoReadings,
  StatCell,
  StatGrid,
  formatCount,
} from "./shared"
import { DialCustomMetrics } from "@/components/dial-custom-metrics"
import { TrackSomethingNew } from "@/components/track-something-new"

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
    <HealthDetailShell
      title={tr("Heart")}
      subtitle={tr("Relative to your own normal")}
      heroFill={cardio?.score ?? null}
      charts={
        <>
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="hrv"
            kind="line"
            title={tr("Heart rate variability")}
            format={(value) => `${formatCount(value)}ms`}
            tone="var(--accent-water)"
          />
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="restingHeartRate"
            kind="line"
            title={tr("Resting heart rate")}
            format={(value) => `${formatCount(value)}bpm`}
            tone={AREA_TONES.heart}
          />
        </>
      }
      about={
        <MetricAbout
          items={[
            {
              term: "What HRV means here",
              detail: tr(
                "Apple Health reports SDNN and Health Connect reports RMSSD. They are different statistics and are never comparable between platforms, so everything on this page is measured against your own history on one device."
              ),
            },
            {
              term: "Resting heart rate",
              detail: tr(
                "The lowest rate your device saw across long stretches of inactivity, often but not only while asleep. Within one person, a drift downward over months tends to track improving aerobic fitness."
              ),
            },
            {
              term: "No good and bad numbers",
              detail: tr(
                "A fit 25-year-old and a fit 60-year-old differ by more than any threshold could survive, and so do two people the same age. Only the movement is informative."
              ),
            },
            {
              term: "What moves them",
              detail: tr(
                "Training load, alcohol, illness and short sleep all raise resting heart rate and suppress HRV, usually together and usually within a day. None of that is a diagnosis."
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
            tone={AREA_TONES.heart}
            score={cardio?.score ?? null}
            caption={
              cardio?.score == null ? tr("no baseline") : tr("stability")
            }
          >
            {recovery?.hrv || recovery?.restingHeartRate ? (
              <StatGrid columns={2}>
                <StatCell
                  label={tr("Heart rate variability")}
                  value={
                    recovery.hrv ? `${Math.round(recovery.hrv.recent)}ms` : "—"
                  }
                  caption={
                    recovery.hrv
                      ? tr("{{value0}}{{value1}}ms on baseline", {
                          value0: choice(recovery.hrv.delta >= 0 ? "+" : "−"),
                          value1: Math.abs(Math.round(recovery.hrv.delta)),
                        })
                      : tr("no readings")
                  }
                />
                <StatCell
                  label={tr("Resting heart rate")}
                  value={
                    recovery.restingHeartRate
                      ? `${Math.round(recovery.restingHeartRate.recent)}bpm`
                      : "—"
                  }
                  caption={
                    recovery.restingHeartRate
                      ? tr("{{value0}}{{value1}}bpm on baseline", {
                          value0: choice(
                            recovery.restingHeartRate.delta >= 0 ? "+" : "−"
                          ),
                          value1: Math.abs(
                            Math.round(recovery.restingHeartRate.delta)
                          ),
                        })
                      : tr("no readings")
                  }
                />
              </StatGrid>
            ) : (
              <NoReadings
                detail={tr(
                  "Needs about a week of heart-rate readings before there is a baseline to compare against."
                )}
              />
            )}
          </DialHero>

          {advice && (
            <AdviceBlock title={advice.title} detail={advice.detail} />
          )}
          <DialCustomMetrics dial="heart" tone={AREA_TONES.heart} />

          <TrackSomethingNew
            tab="body"
            detail={tr("Anything else you want counted against your heart.")}
          />
        </>
      )}
    </HealthDetailShell>
  )
}
