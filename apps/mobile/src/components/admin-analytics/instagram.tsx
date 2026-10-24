import { useEffect, useState } from "react"
import type { InstagramSnapshot } from "../../../../../convex/lib/instagramAnalytics"
import { TikTokCharts } from "./tiktok-charts"
import { SocialMetrics } from "./social-metrics"

const count = (value: number | null) =>
  value === null ? "Unavailable" : new Intl.NumberFormat("en").format(value)
const day = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
const ranges = [
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 days" },
  { key: "last30", label: "30 days" },
] as const

export function InstagramAnalytics({
  snapshot,
}: {
  snapshot: InstagramSnapshot | null | undefined
}) {
  const [selected, setSelected] =
    useState<InstagramSnapshot["windows"][number]["key"]>("last7")
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const period = snapshot?.windows.find((period) => period.key === selected)
  const known =
    period && ["available", "partial"].includes(period.contentCoverage)
  const interactions =
    known &&
    [period.likes, period.comments, period.saves, period.shares].every(
      (value) => value !== null
    )
      ? period.likes! + period.comments! + period.saves! + period.shares!
      : null
  const history = snapshot?.history.map((point) => ({
    date: point.date,
    videoViews: point.contentViews,
    followers: point.followers,
  }))
  const baselineDate = period
    ? new Date(Date.parse(period.from) - 86_400_000).toISOString().slice(0, 10)
    : null
  const start = history?.find((point) => point.date === baselineDate)?.followers
  const end = history?.find((point) => point.date === period?.to)?.followers
  const growth = start != null && end != null ? end - start : null
  const metrics =
    snapshot && period
      ? [
          {
            label: "Followers",
            value: count(snapshot.followers),
            detail: snapshot.accountAsOf
              ? `Latest source: ${day(snapshot.accountAsOf)}`
              : "Source date unavailable",
          },
          {
            label: "Content published",
            value: count(known ? period.contentCount : null),
            detail: known
              ? `${count(period.feedPosts)} feed posts · ${count(period.reels)} reels`
              : "Feed posts + reels",
          },
          {
            label: "Views on this content",
            value: count(known ? period.views : null),
            detail: "Cumulative organic views",
          },
          {
            label: "Interactions",
            value: count(interactions),
            detail: "Likes, comments, saves, shares",
          },
          {
            label: "Engagement",
            value:
              known && period.views && interactions !== null
                ? `${((interactions / period.views) * 100).toFixed(2)}%`
                : "Unavailable",
            detail: "Content interactions / views",
          },
          {
            label: "Net followers",
            value:
              growth === null
                ? "Unavailable"
                : `${growth > 0 ? "+" : ""}${count(growth)}`,
            detail: "Requires dated baselines",
          },
        ]
      : []
  return (
    <section
      aria-labelledby="instagram-heading"
      className="overflow-hidden rounded-xl border border-border bg-background"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 id="instagram-heading" className="font-semibold">
            Instagram
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <a
              href="https://www.instagram.com/onerep_app/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              @onerep_app
            </a>{" "}
            · Organic content · Metricool
          </p>
        </div>
        {snapshot && (
          <div
            role="group"
            aria-label="Instagram reporting period"
            className="flex rounded-lg border border-border p-1"
          >
            {ranges.map((range) => (
              <button
                key={range.key}
                type="button"
                aria-pressed={range.key === selected}
                onClick={() => setSelected(range.key)}
                className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${selected === range.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                {range.label}
              </button>
            ))}
          </div>
        )}
      </header>
      {snapshot === undefined ? (
        <p role="status" className="px-5 pb-6 text-sm text-muted-foreground">
          Loading Instagram snapshot…
        </p>
      ) : snapshot === null ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">
          No Instagram snapshot has been synced yet.
        </p>
      ) : (
        period && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground sm:px-6">
              <span>
                {day(period.from)} to {day(period.to)} · Published content
                performance
              </span>
              <span>
                {period.contentCoverage === "available"
                  ? "Content history available"
                  : period.contentCoverage === "partial"
                    ? "Partial content history"
                    : "Content history unverified"}
              </span>
            </div>
            <SocialMetrics metrics={metrics} />
            <TikTokCharts
              snapshot={{ history }}
              period={period}
              network="Instagram"
            />
            {known && (
              <div className="border-t border-border px-5 py-5 sm:px-6">
                <h3 className="text-sm font-medium">
                  Top content by cumulative views
                </h3>
                {known && period.topContent.length ? (
                  <ol className="mt-3 divide-y divide-border">
                    {period.topContent.map((item) => (
                      <li
                        className="flex items-center gap-4 py-3"
                        key={item.url}
                      >
                        <div className="min-w-0 flex-1">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="line-clamp-2 text-sm font-medium underline-offset-4 hover:underline"
                          >
                            {item.title || "Open Instagram content"}
                          </a>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Published {day(item.publishedOn)}
                          </span>
                        </div>
                        <span className="text-sm tabular-nums">
                          {count(item.views)} views
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {known && period.contentCount === 0
                      ? "No feed posts or reels published in this period."
                      : "Post and reel history is not verified yet."}
                  </p>
                )}
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
              <span>
                {now - snapshot.capturedAt > 36 * 3_600_000
                  ? "Snapshot older than 36 hours · "
                  : ""}
                Synced{" "}
                <time dateTime={new Date(snapshot.capturedAt).toISOString()}>
                  {new Date(snapshot.capturedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Berlin",
                  })}
                </time>{" "}
                Berlin
              </span>
              <span>Daily sync at 9am Berlin</span>
            </footer>
            <details className="border-t border-border px-5 py-3 text-xs leading-6 text-muted-foreground sm:px-6">
              <summary className="w-fit cursor-pointer">
                Scope & unavailable metrics
              </summary>
              <p className="mt-3">
                Organic feed posts and reels only. Views and interactions are
                cumulative totals on content published in the selected dates,
                including saves. Stories, ads, and account-wide views are
                excluded. Engagement is interactions divided by views,
                multiplied by 100. Reach is not summed across posts. Missing
                history and initial empty provider responses remain unavailable.
                Follower growth requires dated observations at both period
                boundaries. Refresh reads the saved snapshot.
              </p>
            </details>
          </>
        )
      )}
    </section>
  )
}
