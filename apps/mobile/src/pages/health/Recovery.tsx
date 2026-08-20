import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { currentDateKey } from "@/lib/food-log"
import {
  AREA_TONES,
  DialHero,
  MetricAbout,
  HealthDetailShell,
  MetricTrend,
  NoReadings,
  StatCell,
  StatGrid,
  formatCount,
  formatHours,
} from "./shared"
import { DialCustomMetrics } from "@/components/dial-custom-metrics"
import { TrackSomethingNew } from "@/components/track-something-new"

const STATUS_CAPTION: Record<string, string> = {
  ready: "recovered",
  steady: "steady",
  compromised: "compromised",
  unknown: "no baseline",
}

/**
 * Recovery: today against your own last month, not against anybody else.
 *
 * The three signals are shown as deviations rather than as raw numbers,
 * because a resting heart rate of 58 is meaningless without knowing whether
 * yours is normally 52 or 64.
 */
export default function HealthRecovery() {
  const today = currentDateKey()
  const data = useQuery(api.logs.healthMetrics.dashboard, { today })
  const recovery = data?.recovery

  return (
    <HealthDetailShell
      title="Recovery"
      subtitle="Measured against your own baseline"
      heroFill={data?.recoveryScore ?? null}
      charts={
        <>
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="recovery"
            title="Recovery score"
            format={formatCount}
            tone={AREA_TONES.recovery}
          />
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="sleep"
            title="Sleep"
            format={formatHours}
            tone="var(--accent-health)"
          />
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="hrv"
            kind="line"
            title="Heart rate variability"
            format={(value) => `${formatCount(value)}ms`}
            tone="var(--accent-water)"
          />
          <MetricTrend
            hideWhenEmpty
            today={today}
            metric="restingHeartRate"
            kind="line"
            title="Resting heart rate"
            format={(value) => `${formatCount(value)}bpm`}
            tone="var(--accent-progress)"
          />
        </>
      }
      about={
        <MetricAbout
          items={[
            {
              term: "How the score is built",
              detail:
                "The mean of your last three days for each signal, against the median of your own last 28. Median, so one bad week does not move the baseline.",
            },
            {
              term: "Why there are no target numbers",
              detail:
                "Resting heart rate and HRV vary enormously between healthy people. The signal is movement against your own normal, not a threshold you can pass or fail.",
            },
            {
              term: "Ready, steady, compromised",
              detail:
                "Two independent signals have to agree before this says compromised. One signal moving is a bad night, and calling that under-recovery is how an app gets ignored.",
            },
            {
              term: "When it stays quiet",
              detail:
                "A signal needs seven readings in the window before it gets a baseline. Below that it is left out rather than guessed at.",
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
            tone={AREA_TONES.recovery}
            score={data.recoveryScore}
            caption={STATUS_CAPTION[recovery?.status ?? "unknown"]}
          >
            {recovery && recovery.status !== "unknown" ? (
              <StatGrid>
                <StatCell
                  label="HRV"
                  value={
                    recovery.hrv ? `${Math.round(recovery.hrv.recent)}ms` : "—"
                  }
                  caption={
                    recovery.hrv
                      ? `baseline ${Math.round(recovery.hrv.baseline)}ms`
                      : "no readings"
                  }
                />
                <StatCell
                  label="Resting HR"
                  value={
                    recovery.restingHeartRate
                      ? `${Math.round(recovery.restingHeartRate.recent)}bpm`
                      : "—"
                  }
                  caption={
                    recovery.restingHeartRate
                      ? `baseline ${Math.round(recovery.restingHeartRate.baseline)}bpm`
                      : "no readings"
                  }
                />
                <StatCell
                  label="Sleep"
                  value={
                    recovery.sleep ? formatHours(recovery.sleep.recent) : "—"
                  }
                  caption={
                    recovery.sleep
                      ? `baseline ${formatHours(recovery.sleep.baseline)}`
                      : "no readings"
                  }
                />
              </StatGrid>
            ) : (
              <NoReadings detail="Recovery needs about a week of readings before it can compare you with yourself." />
            )}
          </DialHero>

          {recovery &&
            recovery.status !== "unknown" &&
            recovery.notes.length > 0 && (
              <section
                className="progress-tab-enter border-t border-border px-1 py-4"
                aria-label="What stands out"
              >
                <p className="app-section-title">What stands out</p>
                <ul className="mt-2.5 space-y-2">
                  {recovery.notes.map((note) => (
                    <li
                      key={note}
                      className="flex items-baseline gap-2 text-[13px] leading-5 text-muted-foreground"
                    >
                      <span
                        className="size-1.5 shrink-0 self-center rounded-full"
                        style={{ backgroundColor: AREA_TONES.recovery }}
                      />
                      {note}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          <DialCustomMetrics dial="recovery" tone={AREA_TONES.recovery} />

          <TrackSomethingNew
            tab="body"
            detail="Soreness, mood, whatever you judge a day by."
          />
        </>
      )}
    </HealthDetailShell>
  )
}
