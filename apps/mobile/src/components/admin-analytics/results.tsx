import { useState, type ReactNode } from "react"
import type {
  AnalyticsCohort,
  AnalyticsReport,
} from "../../../../../convex/lib/internalAnalytics"

const number = new Intl.NumberFormat("en")
const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
const count = (value: number | null) =>
  value === null ? "Unavailable" : number.format(value)
function percent(value: number | null, denominator: number | null) {
  return value === null || denominator === null || denominator === 0
    ? null
    : Math.round((value / denominator) * 100)
}
const percentage = (value: number | null) =>
  value === null ? "Not available" : `${value}%`
function share(value: number | null, denominator: number, group: string) {
  if (denominator === 0) return `No ${group} yet`
  return value === null
    ? "Rate unavailable"
    : `${percentage(percent(value, denominator))} of ${group}`
}

function Comparison({
  current,
  previous,
  period,
}: {
  current: number | null
  previous: number | null
  period: string
}) {
  if (current === null || previous === null)
    return <span>Comparison unavailable</span>
  const delta = current - previous
  return (
    <span>
      <span
        className={
          delta > 0
            ? "font-medium text-emerald-700 dark:text-emerald-400"
            : "font-medium text-foreground"
        }
      >
        {delta > 0 ? "↑ +" : delta < 0 ? "↓ " : ""}
        {number.format(delta)}
      </span>{" "}
      vs previous {period}
    </span>
  )
}

function WeeklyTrends({ report }: { report: AnalyticsReport }) {
  const [range, setRange] = useState(12)
  const [selected, setSelected] = useState<string | null>(null)
  const weeks = report.weekly?.slice(-range) ?? []
  const active =
    weeks.find((week) => week.week === selected) ?? weeks[weeks.length - 1]
  const maximum = Math.max(
    1,
    ...weeks.flatMap((week) => [week.signups ?? 0, week.activeUsers ?? 0])
  )
  return (
    <section
      aria-labelledby="weekly-trends-heading"
      className="min-w-0 rounded-xl border border-border bg-background p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="weekly-trends-heading" className="font-semibold">
            Weekly growth & activity
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Unique users · Monday weeks · UTC
          </p>
        </div>
        <label className="sr-only" htmlFor="analytics-trend-range">
          Trend range
        </label>
        <select
          id="analytics-trend-range"
          value={range}
          onChange={(event) => {
            setRange(Number(event.target.value))
            setSelected(null)
          }}
          className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value={8}>8 weeks</option>
          <option value={12}>12 weeks</option>
          <option value={26}>26 weeks</option>
        </select>
      </div>
      {!active ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          Trend history unavailable. Refresh to load the latest report.
        </p>
      ) : (
        <>
          <div
            className="mt-6 flex flex-wrap items-baseline justify-between gap-3"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="text-sm font-medium">
              Week of {shortDate(active.week)}
              {active.partial && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  In progress
                </span>
              )}
            </p>
            <div className="flex gap-5 text-sm tabular-nums">
              <span>
                <span className="font-semibold">{count(active.signups)}</span>{" "}
                <span className="text-muted-foreground">signups</span>
              </span>
              <span>
                <span className="font-semibold">
                  {count(active.activeUsers)}
                </span>{" "}
                <span className="text-muted-foreground">active</span>
              </span>
            </div>
          </div>
          <div
            className="relative mt-5 flex gap-2"
            role="group"
            aria-label="Weekly signup and activity chart"
          >
            <div
              className="flex w-6 shrink-0 flex-col justify-between pb-7 text-right text-[10px] tabular-nums text-muted-foreground"
              aria-hidden="true"
            >
              <span>{number.format(maximum)}</span>
              <span>{number.format(Math.round(maximum / 2))}</span>
              <span>0</span>
            </div>
            <div className="relative flex min-w-0 flex-1 gap-1 sm:gap-2">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between"
                aria-hidden="true"
              >
                <span className="border-t border-dashed border-border" />
                <span className="border-t border-dashed border-border" />
                <span className="border-t border-border" />
              </div>
              {weeks.map((week, index) => (
                <button
                  key={week.week}
                  type="button"
                  aria-pressed={active.week === week.week}
                  onClick={() => setSelected(week.week)}
                  aria-label={`Week of ${week.week}: ${count(week.signups)} signups, ${count(week.activeUsers)} workout-active users${week.partial ? ", in progress" : ""}`}
                  className={`relative min-w-0 flex-1 rounded-md px-0.5 pt-2 outline-offset-2 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-foreground ${active.week === week.week ? "bg-muted/60" : ""}`}
                >
                  <span
                    className="flex h-44 items-end justify-center gap-0.5 sm:gap-1"
                    aria-hidden="true"
                  >
                    {week.signups === null ? (
                      <span className="w-[40%] self-center text-xs text-muted-foreground">
                        ?
                      </span>
                    ) : (
                      <span
                        className="w-[40%] max-w-4 rounded-t-sm bg-foreground/25"
                        style={{
                          height: `${((week.signups ?? 0) / maximum) * 100}%`,
                        }}
                      />
                    )}
                    {week.activeUsers === null ? (
                      <span className="w-[40%] self-center text-xs text-muted-foreground">
                        ?
                      </span>
                    ) : (
                      <span
                        className={`w-[40%] max-w-4 rounded-t-sm bg-foreground ${week.partial ? "opacity-60" : ""}`}
                        style={{
                          height: `${((week.activeUsers ?? 0) / maximum) * 100}%`,
                        }}
                      />
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-2 block h-5 whitespace-nowrap text-[9px] text-muted-foreground sm:text-[10px]"
                  >
                    {index % Math.ceil(weeks.length / 4) === 0
                      ? shortDate(week.week)
                      : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-foreground/25" />
                Signups
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-foreground" />
                Workout-active
              </span>
            </div>
            <span>
              {weeks.some(
                (week) => week.signups === null || week.activeUsers === null
              )
                ? "? = unavailable"
                : "Select a week to inspect"}
            </span>
          </div>
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer py-1">
              View weekly numbers
            </summary>
            <div
              className="mt-2 max-h-64 overflow-auto"
              tabIndex={0}
              aria-label="Weekly numbers"
            >
              <table className="w-full text-left tabular-nums">
                <thead>
                  <tr>
                    <th className="py-2" scope="col">
                      Week
                    </th>
                    <th scope="col">Signups</th>
                    <th scope="col">Workout-active</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week.week}>
                      <th className="py-1 font-normal" scope="row">
                        {week.week}
                        {week.partial ? " (partial)" : ""}
                      </th>
                      <td>{count(week.signups)}</td>
                      <td>{count(week.activeUsers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

function ActivationFunnel({ report }: { report: AnalyticsReport }) {
  const { totals } = report
  const steps = [
    {
      label: "Signed up",
      value: totals.signups,
      detail: "All retained accounts",
    },
    {
      label: "Logged a first workout",
      value: totals.workoutUsers,
      detail: share(totals.workoutUsers, totals.signups, "signups"),
    },
    {
      label: "Logged on 2+ days",
      value: totals.repeatDayUsers,
      detail: share(
        totals.repeatDayUsers,
        totals.workoutUsers,
        "workout loggers"
      ),
    },
  ]
  return (
    <section
      aria-labelledby="funnel-heading"
      className="rounded-xl border border-border bg-background p-5 sm:p-6"
    >
      <h2 id="funnel-heading" className="font-semibold">
        From signup to repeat
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">All retained history</p>
      <ol className="mt-7 space-y-7">
        {steps.map((step, index) => (
          <li key={step.label}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm">
                <span className="text-xs tabular-nums text-muted-foreground">
                  0{index + 1}
                </span>
                {step.label}
              </span>
              <strong className="text-xl font-semibold tabular-nums">
                {count(step.value)}
              </strong>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden="true">
              <div
                className={`h-full rounded-full ${index === 0 ? "bg-foreground/25" : index === 1 ? "bg-foreground/50" : "bg-foreground"}`}
                style={{
                  width: `${percent(step.value, totals.signups) ?? 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
      <div className="mt-7 flex items-center justify-between border-t border-border pt-4 text-sm">
        <span className="text-muted-foreground">Yet to log a workout</span>
        <strong className="font-medium tabular-nums">
          {number.format(totals.signups - totals.workoutUsers)}
        </strong>
      </div>
      {report.comparisons && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            New signups, last 30 days
          </span>
          <strong className="font-medium tabular-nums">
            {count(report.comparisons.signups30)}
          </strong>
        </div>
      )}
    </section>
  )
}

function RateCell({
  value,
  denominator,
  status,
}: {
  value: number | null
  denominator: number
  status: string
}) {
  if (status === "pending")
    return <td className="px-5 py-4 text-sm text-muted-foreground">Pending</td>
  if (value === null)
    return (
      <td className="px-5 py-4 text-sm text-muted-foreground">Unavailable</td>
    )
  if (denominator === 0)
    return (
      <td className="px-5 py-4 text-xs text-muted-foreground">
        No activated users
      </td>
    )
  const rate = percent(value, denominator)!
  return (
    <td
      className="px-5 py-4"
      aria-label={`${number.format(value)} / ${number.format(denominator)} (${rate}%)`}
      style={{
        backgroundColor: `color-mix(in srgb, var(--foreground) ${2 + rate * 0.08}%, transparent)`,
      }}
    >
      <span className="text-base font-semibold">{rate}%</span>
      <span className="ml-3 text-xs text-muted-foreground">
        {number.format(value)} / {number.format(denominator)}
      </span>
    </td>
  )
}

function matureRate(cohorts: AnalyticsCohort[], retained: boolean) {
  const mature = cohorts.filter(
    (cohort) =>
      (retained ? cohort.retentionStatus : cohort.activationStatus) ===
      "available"
  )
  const numerator = mature.reduce(
    (sum, cohort) =>
      sum + (retained ? (cohort.retained ?? 0) : (cohort.activated ?? 0)),
    0
  )
  const denominator = mature.reduce(
    (sum, cohort) =>
      sum + (retained ? (cohort.activated ?? 0) : cohort.signups),
    0
  )
  const status =
    mature.length === 0
      ? cohorts.some(
          (cohort) =>
            (retained ? cohort.retentionStatus : cohort.activationStatus) ===
            "pending"
        )
        ? "Pending"
        : cohorts.length
          ? "Unavailable"
          : "No cohorts"
      : denominator === 0
        ? "No activations"
        : null
  return {
    value: percent(numerator, denominator),
    numerator,
    denominator,
    status,
  }
}

function Cohorts({ report }: { report: AnalyticsReport }) {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? report.cohorts : report.cohorts.slice(0, 12)
  const activation = matureRate(report.cohorts, false)
  const retention = matureRate(report.cohorts, true)
  const max = Math.max(1, ...rows.map((cohort) => cohort.signups))
  return (
    <section
      aria-labelledby="cohort-heading"
      className="overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-6">
        <div>
          <h2 id="cohort-heading" className="font-semibold">
            Weekly signup cohorts
          </h2>
          <p
            id="cohort-description"
            className="mt-1 text-xs text-muted-foreground"
          >
            First workout within 7 days. Return logging in days 7 to 14.
          </p>
        </div>
        <div className="flex gap-7 text-xs text-muted-foreground">
          <div>
            First-week activation
            <strong className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
              {activation.status ?? percentage(activation.value)}
            </strong>
            {activation.denominator > 0 && (
              <span>
                {number.format(activation.numerator)} /{" "}
                {number.format(activation.denominator)} users
              </span>
            )}
          </div>
          <div>
            Week-2 retention
            <strong className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
              {retention.status ?? percentage(retention.value)}
            </strong>
            {retention.denominator > 0 && (
              <span>
                {number.format(retention.numerator)} /{" "}
                {number.format(retention.denominator)} activated
              </span>
            )}
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-border p-6 text-sm text-muted-foreground">
          {report.quality.unknownSignupAccounts > 0
            ? "Signup dates are unavailable, so cohorts cannot be calculated."
            : "No eligible signups yet. Your first cohort will appear here."}
        </p>
      ) : (
        <div
          className="overflow-x-auto border-t border-border"
          data-horizontal-swipe
          role="region"
          aria-label="Signup cohort table"
          tabIndex={0}
        >
          <table
            className="w-full min-w-[650px] text-left text-sm tabular-nums"
            aria-describedby="cohort-description"
          >
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Signup week
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Signups
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  First-workout activation
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Week-2 retention
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((cohort) => (
                <tr key={cohort.week}>
                  <th
                    scope="row"
                    className="whitespace-nowrap px-5 py-4 font-medium"
                  >
                    <time dateTime={cohort.week}>
                      {shortDate(cohort.week)} {cohort.week.slice(0, 4)}
                    </time>
                  </th>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-4">
                      <span className="min-w-5">
                        {number.format(cohort.signups)}
                      </span>
                      <span
                        className="h-1.5 w-16 rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-foreground/30"
                          style={{ width: `${(cohort.signups / max) * 100}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <RateCell
                    value={cohort.activated}
                    denominator={cohort.signups}
                    status={cohort.activationStatus}
                  />
                  <RateCell
                    value={cohort.retained}
                    denominator={cohort.activated ?? 0}
                    status={cohort.retentionStatus}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span>
          Pending = observation window open · Summary rates use mature,
          available cohorts
        </span>
        {report.cohorts.length > 12 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="min-h-9 font-medium text-foreground underline underline-offset-4"
          >
            {showAll
              ? "Show latest 12"
              : `Show all ${report.cohorts.length} cohorts`}
          </button>
        )}
      </div>
    </section>
  )
}

export function AnalyticsResults({
  report,
  social,
}: {
  report: AnalyticsReport
  social?: ReactNode
}) {
  const { totals, quality } = report
  const comparison = report.comparisons
  const issues =
    quality.unknownSignupAccounts +
    quality.unlinkedWorkoutRecords +
    quality.invalidWorkoutDates +
    quality.invalidLogTimes
  const metrics = [
    {
      label: "Total signups",
      value: totals.signups,
      detail: comparison
        ? `${count(comparison.signups7)} in the last 7 days`
        : "Retained accounts",
    },
    {
      label: "Logged a workout",
      value: totals.workoutUsers,
      detail: share(totals.workoutUsers, totals.signups, "signups"),
    },
    {
      label: "Logged on 2+ days",
      value: totals.repeatDayUsers,
      detail: share(
        totals.repeatDayUsers,
        totals.workoutUsers,
        "workout loggers"
      ),
    },
    {
      label: "Workout-active, 7 days",
      value: totals.active7,
      detail: comparison ? (
        <Comparison
          current={totals.active7}
          previous={comparison.activePrevious7}
          period="7 days"
        />
      ) : (
        "Past 168 hours"
      ),
    },
    {
      label: "Workout-active, 30 days",
      value: totals.active30,
      detail: comparison ? (
        <Comparison
          current={totals.active30}
          previous={comparison.activePrevious30}
          period="30 days"
        />
      ) : (
        "Past 720 hours"
      ),
    },
  ]
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-5">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="bg-background p-5 last:col-span-2 md:last:col-span-1"
          >
            <dt className="text-xs font-medium text-muted-foreground">
              {metric.label}
            </dt>
            <dd
              className={`mt-3 font-semibold tracking-tight tabular-nums ${metric.value === null ? "text-lg" : "text-4xl"}`}
            >
              {count(metric.value)}
            </dd>
            <dd className="mt-3 text-xs leading-5 text-muted-foreground">
              {metric.detail}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
        <WeeklyTrends report={report} />
        <ActivationFunnel report={report} />
      </div>
      {social}
      <Cohorts report={report} />
      <details className="rounded-lg border border-border px-5 py-4 text-xs leading-6 text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          About these metrics{" "}
          <span className="ml-3 font-normal text-muted-foreground">
            {number.format(quality.excludedAccounts)} test accounts excluded
            {issues > 0
              ? ` · ${number.format(issues)} data issues`
              : " · Retained records only"}
          </span>
        </summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="font-medium text-foreground">Definitions</h3>
            <p>
              Activity uses the time a workout log was first saved, including
              backfilled workouts. Repeat days use saved workout dates. Passive
              health imports do not count unless saved to the training log.
            </p>
            <p className="mt-2">
              Activation is logging within 7 days of signup. Week-2 retention
              divides activated users who log again in days 7 to 14 by activated
              users. Weeks begin Monday in UTC.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Coverage & privacy</h3>
            <p>
              Deleted accounts, deleted workouts, and earlier identity-provider
              history cannot be reconstructed. Zero means no matching retained
              records; Unavailable means the calculation is unsupported. Pending
              cohorts need more observation time.
            </p>
            <p className="mt-2">
              Test domains and configured accounts are excluded. Only aggregate
              counts reach this dashboard.
            </p>
            {quality.unknownSignupAccounts > 0 && (
              <p>
                {number.format(quality.unknownSignupAccounts)} accounts have no
                usable signup date.
              </p>
            )}
            {quality.unlinkedWorkoutRecords > 0 && (
              <p>
                {number.format(quality.unlinkedWorkoutRecords)} workout records
                could not be linked to retained accounts.
              </p>
            )}
            {(quality.invalidLogTimes > 0 ||
              quality.invalidWorkoutDates > 0) && (
              <p>
                Some historical dates are unavailable. Affected calculations are
                marked Unavailable.
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  )
}

export function AnalyticsLoading() {
  return (
    <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-36 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <div className="h-96 rounded-xl bg-muted" />
        <div className="h-96 rounded-xl bg-muted" />
      </div>
    </div>
  )
}
