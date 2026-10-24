import { useEffect, useState } from "react"
import { TikTokCharts } from "./tiktok-charts"
import { SocialMetrics } from "./social-metrics"
import type {
  TikTokSnapshot,
  TikTokWindow,
} from "../../../../../convex/lib/tiktokAnalytics"

const number = new Intl.NumberFormat("en")
const count = (value: number | null) =>
  value === null ? "Unavailable" : number.format(value)
const day = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
const windows = [
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 days" },
  { key: "last30", label: "30 days" },
] as const

export function TikTokAnalytics({
  snapshot,
}: {
  snapshot: TikTokSnapshot | null | undefined
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const [selected, setSelected] = useState<TikTokWindow["key"]>("last7")
  const period = snapshot?.windows.find((window) => window.key === selected)
  const interactions =
    period &&
    [period.likes, period.comments, period.shares].every(
      (value) => value !== null
    )
      ? period.likes! + period.comments! + period.shares!
      : null
  const engagement =
    period?.views && interactions !== null
      ? `${((interactions / period.views) * 100).toFixed(2)}%`
      : "Unavailable"
  const stale = snapshot && now - snapshot.capturedAt > 36 * 3_600_000
  const metrics = period
    ? [
        {
          label: "Followers",
          value: count(snapshot!.followers),
          detail: snapshot!.accountAsOf
            ? `Latest source: ${day(snapshot!.accountAsOf)}`
            : "Source date unavailable",
        },
        {
          label: "Videos published",
          value: count(period.videos),
          detail: "In the selected dates",
        },
        {
          label: "Views on these videos",
          value: count(period.views),
          detail: "Cumulative video views",
        },
        {
          label: "Interactions",
          value: count(interactions),
          detail: "Likes + comments + shares",
        },
        {
          label: "Engagement",
          value: engagement,
          detail: "Video interactions / views",
        },
        {
          label: "Net followers",
          value: count(period.netFollowers),
          detail: "Change in selected dates",
        },
      ]
    : []
  return (
    <section
      aria-labelledby="tiktok-heading"
      className="overflow-hidden rounded-xl border border-border bg-background"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 id="tiktok-heading" className="font-semibold">
            TikTok
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <a
              className="underline underline-offset-4"
              href="https://www.tiktok.com/@onerep.life"
              target="_blank"
              rel="noopener noreferrer"
            >
              @onerep.life
            </a>{" "}
            · Organic · Metricool
          </p>
        </div>
        {snapshot && (
          <div
            role="group"
            aria-label="TikTok reporting period"
            className="flex rounded-lg border border-border p-1"
          >
            {windows.map((window) => (
              <button
                key={window.key}
                type="button"
                aria-pressed={selected === window.key}
                onClick={() => setSelected(window.key)}
                className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${selected === window.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                {window.label}
              </button>
            ))}
          </div>
        )}
      </header>
      {snapshot === undefined ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground" role="status">
          Loading TikTok snapshot…
        </p>
      ) : snapshot === null ? (
        <p className="px-5 pb-6 text-sm text-muted-foreground">
          No TikTok snapshot has been synced yet. The daily summary will save
          the latest available metrics here.
        </p>
      ) : (
        period && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground sm:px-6">
              <p>
                {day(period.from)} to {day(period.to)} · Published video
                performance
              </p>
              <span>
                {period.videoCoverage === "available"
                  ? "Video history available"
                  : period.videoCoverage === "partial"
                    ? "Partial video history"
                    : "Video history unverified"}
              </span>
            </div>
            <SocialMetrics metrics={metrics} />
            {interactions !== null && (
              <p className="px-5 pb-5 text-xs text-muted-foreground sm:px-6">
                {count(period.likes)} likes · {count(period.comments)} comments
                · {count(period.shares)} shares
              </p>
            )}
            <TikTokCharts snapshot={snapshot} period={period} />
            {(period.topVideos.length > 0 ||
              (period.videoCoverage === "available" &&
                period.videos === 0)) && (
              <div className="border-t border-border px-5 py-5 sm:px-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    Top videos published in this period
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Cumulative totals
                  </span>
                </div>
                {period.topVideos.length > 0 ? (
                  <ol className="divide-y divide-border">
                    {period.topVideos.map((video, index) => (
                      <li
                        key={video.url}
                        className="flex items-center gap-3 py-3"
                      >
                        <span className="text-xs tabular-nums text-muted-foreground">
                          0{index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="line-clamp-2 text-sm font-medium underline-offset-4 hover:underline"
                            title={video.title}
                          >
                            {video.title || "Open TikTok video"}
                          </a>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Published {day(video.publishedOn)}
                          </span>
                        </div>
                        <div className="pl-3 text-right text-sm tabular-nums">
                          <strong className="font-medium">
                            {count(video.views)}
                          </strong>
                          <span className="block text-xs text-muted-foreground">
                            views
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {period.videoCoverage === "available" && period.videos === 0
                      ? "No videos published in this period."
                      : "Video history is unavailable for this period."}
                  </p>
                )}
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
              <span className={stale ? "font-medium text-foreground" : ""}>
                {stale ? "Snapshot older than 36 hours · " : ""}Synced{" "}
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
                Video views and interactions are cumulative totals for videos
                published in the selected dates, not views received during those
                dates. Engagement is those interactions divided by video views,
                multiplied by 100. Followers use the latest dated account
                observation.
              </p>
              <p className="mt-2">
                {["unverified", "unavailable"].includes(period.activityCoverage)
                  ? "Period-wide account activity is not verified yet. Net follower change, profile views, and account-wide period views remain unavailable."
                  : `Profile views: ${count(period.profileViews)}. Account-wide views in period: ${count(period.accountViews)}.`}{" "}
                Profile-link visits and TikTok-to-signup attribution are
                unavailable. Refresh reads this saved snapshot; it does not
                request new data from Metricool.
              </p>
            </details>
          </>
        )
      )}
    </section>
  )
}
