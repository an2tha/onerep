import { useAction, useQuery } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { api } from "../../../../convex/_generated/api"
import type { AnalyticsReport } from "../../../../convex/lib/internalAnalytics"
import { SocialAnalytics } from "@/components/admin-analytics/social"

import {
  AnalyticsResults,
  AnalyticsLoading,
} from "@/components/admin-analytics/results"

export default function AdminAnalytics() {
  const viewer = useQuery(api.analytics.viewer, {})
  const tiktok = useQuery(
    api.analytics.tiktokSnapshot,
    viewer?.canView === true ? {} : "skip"
  )
  const loadReport = useAction(api.analytics.report)
  const instagram = useQuery(
    api.analytics.instagramSnapshot,
    viewer?.canView === true ? {} : "skip"
  )
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const inFlight = useRef(false)
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(false)
    try {
      setReport(await loadReport({}))
    } catch {
      setError(true)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [loadReport])
  useEffect(() => {
    if (viewer?.canView) void refresh()
    else setReport(null)
  }, [viewer?.canView, refresh])

  return (
    <main className="desktop-canvas min-h-svh px-[var(--app-page-x)] pt-[var(--app-safe-top)] pb-12">
      <div className="mx-auto max-w-7xl py-6">
        <Link
          to="/more"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to More
        </Link>
        <header className="mb-7 mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              OneRep / Internal analytics
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Product growth & social performance
            </p>
          </div>
          {viewer?.canView && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className="native-toolbar-button min-h-11 border border-border px-4 disabled:opacity-60"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </header>
        {viewer === undefined ? (
          <p role="status">Checking admin access…</p>
        ) : !viewer.canView ? (
          <p role="status" className="rounded-lg border border-border p-5">
            Analytics is restricted to administrators. Contact the OneRep
            deployment owner if you need access.
          </p>
        ) : (
          <>
            <div
              aria-live="polite"
              className="mb-5 text-sm text-muted-foreground"
            >
              {loading
                ? "Reading account and workout history…"
                : report && (
                    <>
                      As of{" "}
                      <time dateTime={new Date(report.asOf).toISOString()}>
                        {new Date(report.asOf).toLocaleString("en-GB", {
                          timeZone: "UTC",
                        })}{" "}
                        UTC
                      </time>
                    </>
                  )}
            </div>
            {error && (
              <p
                role="alert"
                className="mb-5 rounded-lg border border-border p-4 text-sm"
              >
                Could not load analytics. Check your connection and admin
                access, then select Refresh.
                {report && " The previous report remains below."}
              </p>
            )}
            {!report && loading && <AnalyticsLoading />}
            {report && (
              <AnalyticsResults
                report={report}
                social={
                  <SocialAnalytics tiktok={tiktok} instagram={instagram} />
                }
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}
