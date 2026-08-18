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
  formatHours,
  toneVar,
} from "./shared"

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
    >
      {data === undefined ? (
        <div
          className="mx-auto size-44 animate-pulse rounded-full bg-muted"
          data-route-loading="true"
        />
      ) : (
        <>
          <ScoreDial
            score={data.recoveryScore}
            caption={STATUS_CAPTION[recovery?.status ?? "unknown"]}
            size={176}
            ticks={48}
          />

          {recovery && recovery.status !== "unknown" ? (
            <>
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

              {recovery.notes.length > 0 && (
                <section
                  className="rounded-xl border border-border bg-card p-4"
                  aria-label="What stands out"
                >
                  <p className="text-[14px] font-semibold">What stands out</p>
                  <ul className="mt-2.5 space-y-2">
                    {recovery.notes.map((note) => (
                      <li
                        key={note}
                        className="flex items-baseline gap-2 text-[13px] leading-5 text-muted-foreground"
                      >
                        <span
                          className="size-1.5 shrink-0 self-center rounded-full"
                          style={{
                            backgroundColor: toneVar(data.recoveryScore),
                          }}
                        />
                        {note}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <NoReadings detail="Recovery needs about a week of readings before it can compare you with yourself." />
          )}

          <MetricTrend
            today={today}
            metric="recovery"
            title="Recovery score"
            format={formatCount}
            tone={toneVar(data.recoveryScore)}
          />
        </>
      )}
    </HealthDetailShell>
  )
}
