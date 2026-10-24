import type {
  TikTokSnapshot,
  TikTokWindow,
} from "../../../../../convex/lib/tiktokAnalytics"

const format = new Intl.NumberFormat("en")
const date = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
const shift = (value: string, days: number) =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
const show = (value: number | null) =>
  value === null ? "Unavailable" : format.format(value)
const signed = (value: number) =>
  `${value > 0 ? "+" : ""}${format.format(value)}`

export function TikTokCharts({
  snapshot,
  period,
  network = "TikTok",
}: {
  snapshot: Pick<TikTokSnapshot, "history">
  period: Pick<TikTokWindow, "key" | "from" | "to">
  network?: "TikTok" | "Instagram"
}) {
  const length = { yesterday: 1, last7: 7, last30: 30 }[period.key]
  const previousFrom = shift(period.from, -length)
  const previousTo = shift(period.from, -1)
  const history = new Map(snapshot.history?.map((point) => [point.date, point]))
  const rows = Array.from({ length }, (_, index) => {
    const currentDate = shift(period.from, index)
    const previousDate = shift(previousFrom, index)
    return {
      currentDate,
      previousDate,
      current: history.get(currentDate),
      previous: history.get(previousDate),
    }
  })
  const total = (previous: boolean) => {
    const values = rows.map(
      (row) => (previous ? row.previous : row.current)?.videoViews
    )
    return values.every((value) => value !== null && value !== undefined)
      ? values.reduce<number>((sum, value) => sum + value!, 0)
      : null
  }
  const growth = (from: string, to: string) => {
    const start = history.get(shift(from, -1))?.followers
    const end = history.get(to)?.followers
    return start != null && end != null ? end - start : null
  }
  const views = total(false)
  const previousViews = total(true)
  const followers = growth(period.from, period.to)
  const previousFollowers = growth(previousFrom, previousTo)
  const comparison = (
    current: number | null,
    previous: number | null,
    percent: boolean
  ) => {
    if (current === null || previous === null)
      return "Previous-period comparison unavailable"
    const change = current - previous
    return `${signed(change)} vs previous${percent && previous > 0 ? ` (${signed(Math.round((change / previous) * 1000) / 10)}%)` : ` (${show(previous)})`}`
  }
  const maxViews = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.current?.videoViews ?? 0,
      row.previous?.videoViews ?? 0,
    ])
  )
  const maxFollowers = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.current?.followers ?? 0,
      row.previous?.followers ?? 0,
    ])
  )
  const observations = rows.filter(
    (row) => row.current?.followers != null
  ).length
  const viewObservations = rows.filter(
    (row) => row.current?.videoViews != null
  ).length
  const x = (index: number) =>
    16 + (length === 1 ? 144 : (index / (length - 1)) * 288)
  const y = (value: number) => 110 - (value / maxFollowers) * 90
  if (viewObservations === 0 && followers === null) return null
  return (
    <div className="border-t border-border px-5 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {date(period.from)} to {date(period.to)} vs {date(previousFrom)} to{" "}
          {date(previousTo)}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 bg-foreground" />
            Selected
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 border border-dashed border-muted-foreground" />
            Previous
          </span>
        </span>
      </div>
      <div
        className={`grid gap-7 ${viewObservations > 0 && followers !== null ? "sm:grid-cols-2" : ""}`}
      >
        {viewObservations > 0 && (
          <figure aria-label={`${network} video views chart`}>
            <figcaption className="text-sm font-medium">
              {network === "Instagram" ? "Content views" : "Video views"}
            </figcaption>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {show(views)}
            </p>
            <p className="mt-1 min-h-8 text-[11px] text-muted-foreground">
              {comparison(views, previousViews, true)}
            </p>
            <div
              className="mt-3 flex h-32 items-end gap-1 border-b border-border"
              role="img"
              aria-label={`Cumulative views by ${network === "Instagram" ? "content" : "video"} publishing date. Selected: ${show(views)}. Previous: ${show(previousViews)}.`}
            >
              {rows.map((row) => (
                <div
                  key={row.currentDate}
                  className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
                  title={`${date(row.currentDate)}: ${show(row.current?.videoViews ?? null)} views; ${date(row.previousDate)}: ${show(row.previous?.videoViews ?? null)} views`}
                >
                  {(
                    [row.current?.videoViews, row.previous?.videoViews] as const
                  ).map((value, index) => (
                    <span
                      key={index}
                      className={`w-full max-w-5 ${value == null ? "border-b border-dotted border-muted-foreground" : index === 0 ? "bg-foreground" : "border border-dashed border-muted-foreground"}`}
                      style={{
                        height:
                          value == null
                            ? 1
                            : Math.max(1, (value / maxViews) * 120),
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{date(period.from)}</span>
              <span>{date(period.to)}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {viewObservations
                ? "Cumulative views, grouped by publish date"
                : `Dated ${network === "Instagram" ? "content" : "video"} history unavailable`}
            </p>
          </figure>
        )}
        {followers !== null && (
          <figure aria-label={`${network} follower growth chart`}>
            <figcaption className="text-sm font-medium">
              Follower growth
            </figcaption>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {followers === null ? "Unavailable" : signed(followers)}
            </p>
            <p className="mt-1 min-h-8 text-[11px] text-muted-foreground">
              {comparison(followers, previousFollowers, false)}
            </p>
            <svg
              viewBox="0 0 320 128"
              className="mt-3 h-32 w-full border-b border-border"
              role="img"
              aria-label={`Dated follower counts. ${observations} observations in selected period. Growth: ${show(followers)}.`}
            >
              {(["previous", "current"] as const).map((series) =>
                rows.map((row, index) => {
                  const value = row[series]?.followers
                  const preceding =
                    index > 0 ? rows[index - 1][series]?.followers : null
                  return value == null ? null : (
                    <g
                      key={`${series}-${row.currentDate}`}
                      className={
                        series === "current"
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      <title>
                        {date(
                          series === "current"
                            ? row.currentDate
                            : row.previousDate
                        )}
                        : {show(value)} followers
                      </title>
                      {preceding != null && (
                        <line
                          x1={x(index - 1)}
                          y1={y(preceding)}
                          x2={x(index)}
                          y2={y(value)}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray={
                            series === "previous" ? "4 3" : undefined
                          }
                        />
                      )}
                      <circle
                        cx={x(index)}
                        cy={y(value)}
                        r="3"
                        fill={
                          series === "current"
                            ? "currentColor"
                            : "var(--background)"
                        }
                        stroke="currentColor"
                      />
                      {observations === 1 && series === "current" && (
                        <text
                          x={x(index)}
                          y={y(value) - 9}
                          textAnchor="middle"
                          fill="currentColor"
                          fontSize="11"
                        >
                          {show(value)}
                        </text>
                      )}
                    </g>
                  )
                })
              )}
            </svg>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{date(period.from)}</span>
              <span>{date(period.to)}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Observed follower counts. Missing days stay blank.
            </p>
          </figure>
        )}
      </div>
      <details className="mt-5 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer">View daily numbers</summary>
        <div
          className="mt-3 overflow-x-auto"
          role="region"
          aria-label={`${network} daily numbers`}
          tabIndex={0}
        >
          <table className="w-full text-left text-[11px] tabular-nums">
            <thead>
              <tr>
                {[
                  "Date",
                  "Views",
                  "Followers",
                  "Previous date",
                  "Views",
                  "Followers",
                ].map((label, index) => (
                  <th
                    key={index}
                    className="whitespace-nowrap p-2 font-medium"
                    scope="col"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.currentDate} className="border-t border-border">
                  {[
                    date(row.currentDate),
                    show(row.current?.videoViews ?? null),
                    show(row.current?.followers ?? null),
                    date(row.previousDate),
                    show(row.previous?.videoViews ?? null),
                    show(row.previous?.followers ?? null),
                  ].map((value, index) => (
                    <td className="whitespace-nowrap p-2" key={index}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
