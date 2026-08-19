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
  formatHours,
} from "./shared"

/**
 * Sleep, which is the pillar that moves everything else.
 *
 * Shows the baseline next to the recent average rather than a target alone:
 * seven hours is the guideline, but the number that predicts how someone feels
 * tomorrow is how far they are from their own normal.
 */
export default function HealthSleep() {
  const today = currentDateKey()
  const data = useQuery(api.logs.healthMetrics.dashboard, { today })
  const sleep = data?.recovery?.sleep
  const pillar = data?.pillars.find((item) => item.id === "sleep")
  const advice = data?.recommendations.find((item) => item.pillar === "sleep")

  return (
    <HealthDetailShell
      title="Sleep"
      subtitle="Asleep time, not time in bed"
      heroFill={pillar?.score ?? null}
      charts={
        <MetricTrend
          today={today}
          metric="sleep"
          title="Nightly sleep"
          format={formatHours}
          tone={AREA_TONES.sleep}
        />
      }
      about={
        <MetricAbout
          items={[
            {
              term: "Asleep, not in bed",
              detail:
                "This counts time the health store scored as actually asleep. Time in bed usually runs 30-60 minutes longer once you count falling asleep and waking in the night, which is why this reads worse than your bedtime suggests.",
            },
            {
              term: "The seven-hour target",
              detail:
                "The low end of the adult range rather than the middle, so a genuinely fine 7h 15m is not marked down. Consistently under six is where the evidence gets pointed.",
            },
            {
              term: "Your baseline",
              detail:
                "The median of your own last 28 nights. Median rather than mean, so one flu week or one holiday does not drag it.",
            },
            {
              term: "Why last night can change",
              detail:
                "A watch often writes sleep hours after you wake, so a figure read at breakfast can be revised by lunchtime. The most recent night is the least settled one here.",
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
            tone={AREA_TONES.sleep}
            score={pillar?.score ?? null}
            caption={pillar?.score == null ? "no reading" : "of target"}
          >
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
                />
              </StatGrid>
            ) : (
              <NoReadings detail="A week of nights is needed before a baseline means anything." />
            )}
          </DialHero>

          {advice && (
            <AdviceBlock title={advice.title} detail={advice.detail} />
          )}
        </>
      )}
    </HealthDetailShell>
  )
}
