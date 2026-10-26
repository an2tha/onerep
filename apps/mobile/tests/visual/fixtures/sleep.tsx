import { useState } from "react"
import { createRoot } from "react-dom/client"
import { Link, MemoryRouter, useLocation } from "react-router"
import {
  scoreSleep,
  sleepGoalOn,
  type SleepDay,
} from "../../../../../convex/lib/sleepStrain"
import { buildConnectedReview } from "../../../../../convex/lib/connectedReview"
import { shiftDate } from "../../../../../convex/lib/healthSeries"
import {
  SleepAnalysis,
  SleepPreferencesForm,
  type SleepPreferencesValue,
} from "@repo/ui/sleep"
import { ConnectedReview } from "@repo/ui/sleep"
import {
  TodayInsightsView,
  DEFAULT_INSIGHTS,
} from "@repo/ui/sleep"
import { DetailAtmosphere } from "../../../src/components/detail-atmosphere"
import "../../../src/styles/index.css"
import "../../../src/components/sleep-sky.css"

document.documentElement.classList.toggle(
  "dark",
  matchMedia("(prefers-color-scheme: dark)").matches
)
const anchor = "2026-10-26"
function Fixture() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get("mode")
  const [date, setDate] = useState(anchor)
  const [prefs, setPrefs] = useState<SleepPreferencesValue>({
    automaticReview: false,
    targetMinutes: 480,
    bedtimeMinutes: 1380,
    wakeMinutes: 450,
  })
  const [settings, setSettings] = useState(DEFAULT_INSIGHTS)
  const [fail, setFail] = useState(params.get("fail") === "1")
  const route = useLocation()
  const goals = [{ date: "2026-10-20", targetMinutes: 480 }]
  const days: SleepDay[] =
    mode === "empty"
      ? []
      : Array.from({ length: 56 }, (_, index) => {
          const date = shiftDate(anchor, index - 55)
          const minutes = index >= 54 ? 390 : 440 + (index % 5) * 13
          return {
            date,
            sleepMinutes: minutes + 25,
            mainSleepMinutes: minutes,
            napMinutes: 25,
            sleepAwakeMinutes: 22,
            sleepDeepMinutes: 65,
            sleepRemMinutes: 80,
            sleepLightMinutes: minutes - 145,
            sleepStartMinutes: 1400 + (index % 3) * 8,
            sleepEndMinutes: (1400 + (index % 3) * 8 + minutes + 22) % 1440,
            provider:
              mode === "source" && index === 55
                ? "health_connect"
                : "apple_health",
            updatedAt: new Date(`${date}T07:42:00Z`).getTime(),
          }
        }).filter(
          (d) =>
            ![
              shiftDate(anchor, -4),
              ...(mode === "missing" ? [anchor] : []),
            ].includes(d.date)
        )
  const history = Array.from({ length: 28 }, (_, index) =>
    shiftDate(anchor, index - 27)
  ).map((date) => {
    const day = days.find((d) => d.date === date),
      target = sleepGoalOn(date, goals, 450)
    return {
      date,
      target,
      sleep: day ? scoreSleep(day, days, target, goals, 450) : null,
    }
  })
  const review = buildConnectedReview({
    date,
    nights: history.flatMap((d) => (d.sleep ? [d.sleep] : [])),
    sessions:
      mode === "empty"
        ? []
        : [
            {
              id: "1",
              date: "2026-10-25",
              name: "Squat · Romanian deadlift",
              minutes: 45,
              hardSets: 12,
            },
          ],
    checkIns: [],
    foodDays: mode === "empty" ? [] : [{ date: anchor, entries: [{}] }],
  })
  const controls = (
    <div style={{ padding: "12px 16px", fontSize: 12 }}>
      <p>Illustrative data for interface verification</p>
      <label>
        <input
          type="checkbox"
          checked={fail}
          onChange={(event) => setFail(event.target.checked)}
        />{" "}
        Simulate saving failure
      </label>
      <p data-testid="route">
        {route.pathname}
        {route.search}
      </p>
    </div>
  )
  if (params.get("surface") === "today")
    return (
      <main style={{ maxWidth: 480, margin: "auto", padding: 20 }}>
        {controls}
        <TodayInsightsView
          linkComponent={Link}
          date={anchor}
          history={history}
          review={review}
          settings={settings}
          save={async (value) => {
            if (fail) throw new Error("Offline")
            setSettings(value)
          }}
        />
      </main>
    )
  return (
    <DetailAtmosphere tone="sleep" sidebar={false}>
      <main className="sleep-detail">
        {controls}
        <SleepAnalysis
          today={anchor} linkComponent={Link}
          night={history.find((d) => d.date === date)?.sleep ?? null}
          history={history}
          date={date}
          onSelect={setDate}
          bedtimeMinutes={prefs.bedtimeMinutes}
          wakeMinutes={prefs.wakeMinutes}
        />
        <ConnectedReview review={review} linkComponent={Link} today={anchor} />
        <SleepPreferencesForm
          value={prefs}
          save={async (value) => {
            if (fail) throw new Error("Offline")
            setPrefs(value)
          }}
        />
      </main>
    </DetailAtmosphere>
  )
}
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <Fixture />
  </MemoryRouter>
)
