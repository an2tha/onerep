import { useEffect, useId, useRef, useState } from "react"
import type { ComponentType, ReactNode } from "react"
import { tr, uiLocale } from "../../i18n"
import type {
  SleepNight,
  SleepHistory,
} from "../../../../models/src/sleep-insights"
export type {
  SleepNight,
  SleepHistory,
} from "../../../../models/src/sleep-insights"
import "./sleep-analysis.css"
export type InsightLinkComponent = ComponentType<{
  to: string
  className?: string
  children?: ReactNode
}>
export function InsightLink({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children?: ReactNode
}) {
  return (
    <a href={to} className={className}>
      {children}
    </a>
  )
}
export function formatHours(minutes: number) {
  const hours = Math.floor(Math.abs(minutes) / 60)
  const rest = Math.round(Math.abs(minutes) % 60)
  return hours === 0
    ? tr("{{value0}}m", { value0: rest })
    : rest === 0
      ? tr("{{value0}}h", { value0: hours })
      : tr("{{value0}}h {{value1}}m", { value0: hours, value1: rest })
}

export const sleepDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(uiLocale(), {
    day: "numeric",
    month: "short",
  })
export function sleepClock(minutes: number) {
  const date = new Date(
    2000,
    0,
    1,
    Math.floor(minutes / 60),
    Math.round(minutes % 60)
  )
  return date.toLocaleTimeString(uiLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  })
}
const sourceLabel = (provider: string) =>
  provider === "apple_health"
    ? "Apple Health"
    : provider === "health_connect"
      ? "Health Connect"
      : provider === "manual"
        ? tr("Manual entry")
        : tr("Recorded sleep")

export function SleepDurationChart({
  history,
  selectedDate,
  onSelect,
  compact = false,
}: {
  history: SleepHistory
  selectedDate?: string
  onSelect?: (date: string) => void
  compact?: boolean
}) {
  const id = useId()
  const chartRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(300)
  useEffect(() => {
    const element = chartRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(Math.max(240, entry!.contentRect.width))
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const [range, setRange] = useState<7 | 28>(7)
  const days = history.slice(-(compact ? 7 : range))
  const maxMinutes = Math.max(
    600,
    ...days.map((d) => Math.max(d.target, d.sleep?.minutes ?? 0))
  )
  const top = Math.ceil(maxMinutes / 60) * 60
  const chartHeight = compact ? 64 : 156
  const width = Math.max(
    availableWidth,
    !compact && range === 28 ? days.length * 36 : 0
  )
  const gutter = compact ? 0 : 28
  const step = (width - gutter) / Math.max(1, days.length)
  const y = (minutes: number) => chartHeight - (minutes / top) * chartHeight
  return (
    <div className={`sleep-duration-chart ${compact ? "is-compact" : ""}`}>
      {!compact && (
        <div className="sleep-chart-heading">
          <h2 id={id}>{tr("Sleep against your goal")}</h2>
          <div className="sleep-range" aria-label={tr("Sleep history period")}>
            {([7, 28] as const).map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={range === n}
                onClick={() => setRange(n)}
              >
                {tr("{{count}} days", { count: n })}
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        ref={chartRef}
        className="sleep-chart-scroll"
        tabIndex={days.length > 7 ? 0 : undefined}
        role="region"
        aria-label={tr("Sleep duration chart")}
      >
        <svg
          viewBox={`0 0 ${width} ${chartHeight + (compact ? 10 : 36)}`}
          style={{ width, height: chartHeight + (compact ? 10 : 36) }}
          role="img"
          aria-label={tr(
            "Main sleep duration and the goal for each waking day. Missing nights are shown as gaps."
          )}
        >
          {!compact &&
            [0, top / 2, top].map((tick) => (
              <g key={tick}>
                <line
                  x1={gutter}
                  x2={width}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="sleep-chart-grid"
                />
                <text
                  x="3"
                  y={Math.max(12, y(tick) - 4)}
                  className="sleep-chart-axis"
                >
                  {formatHours(tick)}
                </text>
              </g>
            ))}
          {days.map((d, i) => {
            const x = gutter + step * i
            const label = d.sleep
              ? tr("{{date}}: {{duration}} main sleep, goal {{goal}}", {
                  date: sleepDate(d.date),
                  duration: formatHours(d.sleep.minutes),
                  goal: formatHours(d.target),
                })
              : tr("{{date}}: no sleep recorded", { date: sleepDate(d.date) })
            return (
              <g key={d.date}>
                <title>{label}</title>
                {d.sleep ? (
                  <rect
                    x={x + step * 0.28}
                    width={step * 0.44}
                    y={y(d.sleep.minutes)}
                    height={chartHeight - y(d.sleep.minutes)}
                    rx="3"
                    className="sleep-chart-bar"
                    data-selected={d.date === selectedDate}
                  />
                ) : (
                  <text
                    x={x + step / 2}
                    y={chartHeight - 5}
                    textAnchor="middle"
                    className="sleep-chart-axis"
                  >
                    ·
                  </text>
                )}
                <line
                  x1={x + 1}
                  x2={x + step - 1}
                  y1={y(d.target)}
                  y2={y(d.target)}
                  className="sleep-chart-goal"
                />
                {!compact && (
                  <text
                    x={x + step / 2}
                    y={chartHeight + 23}
                    textAnchor="middle"
                    className="sleep-chart-axis"
                  >
                    {new Date(`${d.date}T12:00:00`).getDate()}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {!compact && (
        <>
          <p className="sleep-chart-caption">
            {tr(
              "Solid bars: main sleep. Dashed line: dated goal. Extra sleep stays visible in night details."
            )}
          </p>
          <p className="sleep-chart-caption">
            {tr(
              "{{recorded}} of {{total}} nights recorded · {{start}} to {{end}}",
              {
                recorded: days.filter((d) => d.sleep).length,
                total: days.length,
                start: days[0] ? sleepDate(days[0].date) : "",
                end: days.at(-1) ? sleepDate(days.at(-1)!.date) : "",
              }
            )}
          </p>
          <details className="sleep-disclosure">
            <summary>{tr("Explore individual nights")}</summary>
            <ul className="sleep-night-list">
              {[...days].reverse().map((d) => (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(d.date)}
                    aria-current={d.date === selectedDate ? "date" : undefined}
                  >
                    <span>{sleepDate(d.date)}</span>
                    <span>
                      {d.sleep
                        ? formatHours(d.sleep.minutes)
                        : tr("No reading")}
                    </span>
                    <span>
                      {tr("Goal {{goal}}", { goal: formatHours(d.target) })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  )
}

export function SleepTimingChart({
  history,
  bedtimeMinutes,
  wakeMinutes,
}: {
  history: SleepHistory
  bedtimeMinutes: number | null
  wakeMinutes: number | null
}) {
  const days = history.slice(-7)
  // Noon-to-noon keeps ordinary overnight periods continuous across midnight.
  const offset = (minute: number) =>
    (((minute - 720 + 1440) % 1440) / 1440) * 100
  return (
    <section className="sleep-section">
      <h2>{tr("Sleep and wake times")}</h2>
      <p className="sleep-chart-caption">
        {tr(
          "Recorded main sleep periods, shown from noon to noon. Your planned times are guides, not readings."
        )}
      </p>
      <div className="sleep-timing-axis">
        <span>{sleepClock(720)}</span>
        <span>{sleepClock(0)}</span>
        <span>{sleepClock(720)}</span>
      </div>
      <ul className="sleep-timing-list">
        {days.map(({ date, sleep: night }) => {
          const start = night?.startMinutes,
            end = night?.endMinutes
          const timed = start != null && end != null
          const left = timed ? offset(start) : 0,
            right = timed ? offset(end) : 0
          return (
            <li key={date}>
              <span className="sleep-timing-date">{sleepDate(date)}</span>
              <div className="sleep-timing-track" aria-hidden="true">
                {timed &&
                  (right >= left ? (
                    <span
                      className="sleep-timing-period"
                      style={{ left: `${left}%`, width: `${right - left}%` }}
                    />
                  ) : (
                    <>
                      <span
                        className="sleep-timing-period"
                        style={{ left: `${left}%`, width: `${100 - left}%` }}
                      />
                      <span
                        className="sleep-timing-period"
                        style={{ left: 0, width: `${right}%` }}
                      />
                    </>
                  ))}
                {bedtimeMinutes !== null && (
                  <i style={{ left: `${offset(bedtimeMinutes)}%` }} />
                )}
                {wakeMinutes !== null && (
                  <i style={{ left: `${offset(wakeMinutes)}%` }} />
                )}
              </div>
              <span className="sleep-timing-value">
                {timed
                  ? `${sleepClock(start)} – ${sleepClock(end)}`
                  : tr("Times unavailable")}
              </span>
            </li>
          )
        })}
      </ul>
      {(bedtimeMinutes !== null || wakeMinutes !== null) && (
        <p className="sleep-chart-caption">
          {tr(
            "Dashed guides show your current plan, including when viewing older nights."
          )}
        </p>
      )}
    </section>
  )
}

export function SleepAnalysis({
  linkComponent: Link = InsightLink,
  today,
  night,
  history,
  date,
  onSelect,
  bedtimeMinutes,
  wakeMinutes,
}: {
  linkComponent?: InsightLinkComponent
  today: string
  night: SleepNight | null
  history: SleepHistory
  date: string
  onSelect: (date: string) => void
  bedtimeMinutes: number | null
  wakeMinutes: number | null
}) {
  const coverage: Record<string, string> = {
    duration: tr("Duration"),
    awake: tr("Awake time"),
    stages: tr("Stage estimates"),
    timing: tr("Sleep and wake times"),
  }
  return (
    <>
      <section className="sleep-summary">
        <h1>{tr("Your sleep")}</h1>
        {night ? (
          <>
            <p className="sleep-duration-lead">
              {tr("{{duration}} of your {{goal}} goal", {
                duration: formatHours(night.minutes),
                goal: formatHours(night.target),
              })}
            </p>
            <p>
              {night.minutes < night.target
                ? tr(
                    "Your main sleep was {{duration}} below the goal for this night.",
                    { duration: formatHours(night.target - night.minutes) }
                  )
                : tr("Your main sleep met the duration goal for this night.")}
            </p>
            {night.usualRange && (
              <p>
                {tr(
                  "Your usual range: {{low}} to {{high}}, from {{count}} nights in the previous 28 days. Usual does not mean enough.",
                  {
                    low: formatHours(night.usualRange.low),
                    high: formatHours(night.usualRange.high),
                    count: night.baselineNights,
                  }
                )}
              </p>
            )}
            <p className="sleep-chart-caption">
              {tr("{{source}} · Waking {{date}}", {
                source: sourceLabel(night.provider),
                date: sleepDate(date),
              })}
              {night.updatedAt
                ? ` · ${tr("Updated {{time}}", { time: new Date(night.updatedAt).toLocaleString(uiLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })}`
                : ""}
            </p>
            {night.providerChanged && (
              <p className="sleep-data-note">
                {tr(
                  "Your sleep source changed. Your usual range uses readings from this source only."
                )}
              </p>
            )}
            {night.coverageChanged && (
              <p className="sleep-data-note">
                {tr(
                  "Different readings are available for this night. They do not change duration goal progress."
                )}
              </p>
            )}
          </>
        ) : (
          <>
            <p>{tr("No sleep recorded for this night.")}</p>
            <p>
              {tr(
                "Missing sleep stays unknown. Sync your wearable or add a reading in Health."
              )}
            </p>
            <Link className="sleep-text-action" to="/health">
              {tr("Open Health")}
            </Link>
          </>
        )}
      </section>
      <section className="sleep-section">
        <SleepDurationChart
          history={history}
          selectedDate={date}
          onSelect={onSelect}
        />
      </section>
      {night && (
        <section className="sleep-section sleep-focus">
          <h2>
            {date === today
              ? tr("Tonight’s focus")
              : tr("What this night suggests")}
          </h2>
          <p>
            {date !== today
              ? night.focus === "duration"
                ? tr(
                    "This night was below its duration goal. Review whether the sleep opportunity matched your plan at the time."
                  )
                : night.focus === "timing"
                  ? tr(
                      "Sleep and wake times differed from the preceding nights. Consider the schedule you had then."
                    )
                  : night.focus === "interruptions"
                    ? tr(
                        "Awake time was elevated during this recorded period. The readings do not establish the cause."
                      )
                    : tr(
                        "Review this night alongside how rested you felt and the routine you had at the time."
                      )
              : night.focus === "duration"
                ? tr(
                    "Make room for 20–30 extra minutes of sleep tonight, if your schedule allows."
                  )
                : night.focus === "timing"
                  ? tr(
                      "Consider a familiar sleep and wake window tonight, if it fits your schedule."
                    )
                  : night.focus === "interruptions"
                    ? tr(
                        "Notice whether noise, light, or temperature interrupted you; change one thing tonight."
                      )
                    : tr(
                        "Keep your usual routine and notice how rested you feel tomorrow."
                      )}
          </p>
          <p className="sleep-chart-caption">
            {tr("Seven-day period: {{start}} to {{end}}.", {
              start: sleepDate(night.shortfallStart),
              end: sleepDate(date),
            })}{" "}
            {tr(
              "{{shortfall}} below dated goals across {{count}} recorded nights in this period. Missing nights are unknown. This is a main-sleep goal comparison, not a repayment target.",
              {
                shortfall: formatHours(night.shortfall),
                count: night.shortfallNights,
              }
            )}
          </p>
          <a className="sleep-text-action" href="#sleep-preferences">
            {date === today
              ? tr("Plan tonight’s times")
              : tr("Edit current sleep plan")}
          </a>
        </section>
      )}
      <SleepTimingChart
        history={history}
        bedtimeMinutes={bedtimeMinutes}
        wakeMinutes={wakeMinutes}
      />
      {night && (
        <details className="sleep-disclosure sleep-section">
          <summary>{tr("Measurements and calculation")}</summary>
          <p className="sleep-chart-caption">
            {tr("Recorded: {{readings}}", {
              readings: night.coverageKeys
                .map((key) => coverage[key])
                .join(", "),
            })}
          </p>
          {night.napMinutes !== null && night.napMinutes > 0 && (
            <p>
              {tr(
                "An additional {{extra}} was recorded outside the main period, for {{total}} total sleep. The chart and goal comparison use main sleep only.",
                {
                  extra: formatHours(night.napMinutes),
                  total: formatHours(night.totalMinutes),
                }
              )}
            </p>
          )}
          <dl className="sleep-detail-rows">
            <div>
              <dt>{tr("Duration goal progress")}</dt>
              <dd>{night.score}%</dd>
            </div>
            <div>
              <dt>{tr("Recorded efficiency")}</dt>
              <dd>
                {night.efficiency === null
                  ? tr("Unavailable")
                  : `${Math.round(night.efficiency)}%`}
              </dd>
            </div>
            <div>
              <dt>{tr("Recorded awake time")}</dt>
              <dd>
                {night.awake === null
                  ? tr("Unavailable")
                  : formatHours(night.awake)}
              </dd>
            </div>
            <div>
              <dt>{tr("Timing difference from recent nights")}</dt>
              <dd>
                {night.timingShift === null
                  ? tr("More timed nights needed")
                  : tr("About {{count}} min", {
                      count: Math.round(night.timingShift),
                    })}
              </dd>
            </div>
          </dl>
          <p className="sleep-chart-caption">
            {tr(
              "Duration goal progress is main sleep divided by the goal for that waking day, capped at 100%. The chart keeps the full duration. Stages, efficiency, and timing do not change this percentage."
            )}
          </p>
          <p className="sleep-chart-caption">
            {tr(
              "All displayed nights use this duration-only method. It does not measure sleep quality, sleep need, or readiness to train."
            )}
          </p>
          <h2 className="sleep-detail-subtitle">
            {tr("Wearable stage estimates")}
          </h2>
          {night.stages.length > 0 ? (
            <ul className="sleep-stage-readings">
              {night.stages.map((stage) => (
                <li key={stage.key}>
                  <span>
                    {stage.key === "sleepDeepMinutes"
                      ? tr("Deep")
                      : stage.key === "sleepRemMinutes"
                        ? tr("REM")
                        : tr("Light")}
                  </span>
                  <span>{formatHours(stage.minutes)}</span>
                </li>
              ))}
              {night.unclassifiedMinutes > 0 && (
                <li>
                  <span>{tr("Unclassified")}</span>
                  <span>{formatHours(night.unclassifiedMinutes)}</span>
                </li>
              )}
            </ul>
          ) : (
            <p>{tr("No usable stage estimates for this night.")}</p>
          )}
          <p className="sleep-chart-caption">
            {tr(
              "Stage totals are estimates, not a chronological timeline. Their availability does not affect your goal comparison."
            )}
          </p>
        </details>
      )}
    </>
  )
}

export type SleepPreferencesValue = {
  automaticReview: boolean
  targetMinutes: number
  bedtimeMinutes: number | null
  wakeMinutes: number | null
}
export function SleepPreferencesForm({
  value,
  save,
}: {
  value: SleepPreferencesValue
  save: (value: SleepPreferencesValue) => Promise<unknown>
}) {
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const asInput = (minutes: number | null) =>
    minutes === null
      ? ""
      : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  const parseTime = (time: string) =>
    time ? Number(time.split(":")[0]) * 60 + Number(time.split(":")[1]) : null
  return (
    <section className="sleep-section" id="sleep-preferences">
      <h2>{tr("Your sleep plan")}</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError("")
          setSaved(false)
          try {
            await save(draft)
            setSaved(true)
          } catch {
            setError(
              tr(
                "Could not save your sleep plan. Your changes are still here. Try again."
              )
            )
          } finally {
            setBusy(false)
          }
        }}
        onChange={() => setSaved(false)}
      >
        <fieldset disabled={busy} className="sleep-preferences-fields">
          <label>
            {tr("Main sleep duration goal")}
            <select
              value={draft.targetMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  targetMinutes: Number(event.target.value),
                })
              }
            >
              {[
                ...new Set([
                  420,
                  450,
                  480,
                  510,
                  540,
                  570,
                  600,
                  draft.targetMinutes,
                ]),
              ]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {formatHours(m)}
                  </option>
                ))}
            </select>
          </label>
          <p className="sleep-chart-caption">
            {tr(
              "Duration goal changes start with tomorrow’s waking day. Earlier nights keep their goal."
            )}
          </p>
          <div className="sleep-plan-times">
            <label>
              {tr("Planned bedtime (optional)")}
              <input
                type="time"
                value={asInput(draft.bedtimeMinutes)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    bedtimeMinutes: parseTime(event.target.value),
                  })
                }
              />
            </label>
            <label>
              {tr("Planned wake time (optional)")}
              <input
                type="time"
                value={asInput(draft.wakeMinutes)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    wakeMinutes: parseTime(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="sleep-chart-caption">
            {tr(
              "Planned times describe time available for sleep. They are separate from time actually asleep. Clear either field to remove its guide."
            )}
          </p>
          <label className="sleep-checkbox">
            <input
              type="checkbox"
              checked={draft.automaticReview}
              onChange={(event) =>
                setDraft({ ...draft, automaticReview: event.target.checked })
              }
            />
            {tr("Automatic AI review after each night syncs")}
          </label>
          <p className="sleep-chart-caption">
            {tr(
              "Uses your AI allowance and existing AI processing settings. Regular insights are always available."
            )}
          </p>
          <button className="sleep-action" type="submit">
            {busy ? tr("Saving…") : tr("Save sleep plan")}
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="sleep-error">
            {error}
          </p>
        )}
        {saved && <p role="status">{tr("Sleep plan saved.")}</p>}
      </form>
    </section>
  )
}
