import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { ConvexProvider, type ConvexReactClient } from "convex/react"
import { getFunctionName, type FunctionReference } from "convex/server"
import { ThemeProvider, PALETTES } from "@repo/ui"
import AdminAnalytics from "../../../src/pages/AdminAnalytics"
import More from "../../../src/pages/More"
import type { AnalyticsReport } from "@repo/models"
import type { TikTokSnapshot } from "@repo/models"
import type { InstagramSnapshot } from "@repo/models"
import "../../../src/styles/index.css"

const params = new URLSearchParams(location.search)
let fail = params.has("error")
let calls = 0
const report: AnalyticsReport = {
  asOf: Date.parse("2026-10-24T12:00:00Z"),
  totals: {
    signups: 142,
    workoutUsers: 73,
    repeatDayUsers: 42,
    active7: 24,
    active30: 51,
  },
  comparisons: {
    signups7: 18,
    signupsPrevious7: 36,
    signups30: 87,
    signupsPrevious30: 37,
    activePrevious7: 19,
    activePrevious30: 39,
  },
  weekly: Array.from({ length: 26 }, (_, index) => ({
    week: new Date(
      Date.parse("2026-10-19T00:00:00Z") - (25 - index) * 7 * 86_400_000
    )
      .toISOString()
      .slice(0, 10),
    signups:
      index < 14 ? 0 : [3, 5, 6, 8, 10, 12, 9, 3, 18, 20, 36, 12][index - 14],
    activeUsers:
      index < 14 ? 0 : [1, 3, 4, 5, 7, 8, 11, 10, 16, 21, 19, 18][index - 14],
    partial: index === 25,
  })),
  cohorts: [
    {
      week: "2026-10-19",
      signups: 12,
      activated: null,
      retained: null,
      activationStatus: "pending",
      retentionStatus: "pending",
    },
    {
      week: "2026-10-05",
      signups: 20,
      activated: 9,
      retained: null,
      activationStatus: "available",
      retentionStatus: "pending",
    },
    {
      week: "2026-09-28",
      signups: 18,
      activated: 10,
      retained: 4,
      activationStatus: "available",
      retentionStatus: "available",
    },
    {
      week: "2026-09-21",
      signups: 3,
      activated: 0,
      retained: 0,
      activationStatus: "available",
      retentionStatus: "available",
    },
  ],
  quality: {
    excludedAccounts: 7,
    unknownSignupAccounts: 0,
    unlinkedWorkoutRecords: 0,
    invalidWorkoutDates: 0,
    invalidLogTimes: 0,
  },
}
if (params.has("empty")) {
  report.totals = {
    signups: 0,
    workoutUsers: 0,
    repeatDayUsers: 0,
    active7: 0,
    active30: 0,
  }
  report.cohorts = []
  report.comparisons = {
    signups7: 0,
    signupsPrevious7: 0,
    signups30: 0,
    signupsPrevious30: 0,
    activePrevious7: 0,
    activePrevious30: 0,
  }
  report.weekly = report.weekly.map((week) => ({
    ...week,
    signups: 0,
    activeUsers: 0,
  }))
}
if (params.has("unavailable")) {
  report.totals.active7 = null
  report.totals.repeatDayUsers = null
  report.quality.invalidLogTimes = 1
  report.quality.unknownSignupAccounts = 2
  report.cohorts[2].activated = null
  report.cohorts[2].retained = null
  report.cohorts[2].activationStatus = "unavailable"
  report.cohorts[2].retentionStatus = "unavailable"
  report.comparisons.activePrevious7 = null
  report.comparisons.signups7 = null
  report.weekly = report.weekly.map((week) => ({
    ...week,
    signups: null,
    activeUsers: null,
  }))
}
if (params.has("long")) {
  report.cohorts.push(
    ...Array.from({ length: 10 }, (_, index) => ({
      week: new Date(Date.parse("2026-09-14") - index * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      signups: 2,
      activated: 1,
      retained: 0,
      activationStatus: "available" as const,
      retentionStatus: "available" as const,
    }))
  )
  report.totals.signups += 20
}
const tiktok: TikTokSnapshot = {
  provider: "metricool",
  brandId: "7632357",
  accountHandle: "onerep.life",
  timezone: "Europe/Berlin",
  capturedAt: Date.now() - (params.has("tiktok-stale") ? 48 * 3_600_000 : 0),
  connectedAt: Date.parse("2026-10-01"),
  accountAsOf: "2026-10-23",
  followers: 3,
  history: Array.from({ length: 61 }, (_, index) => {
    const date = new Date(Date.parse("2026-08-24") + index * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const views: Record<string, number> = {
      "2026-10-08": 292,
      "2026-10-15": 302,
      "2026-10-20": 2124,
      "2026-10-21": 2,
      "2026-10-22": 1591,
    }
    return {
      date,
      videoViews: index === 0 ? null : (views[date] ?? 0),
      followers: date === "2026-10-23" ? 3 : null,
    }
  }),
  windows: (
    [
      ["yesterday", "2026-10-23", 0, 0, 0, 0, 0],
      ["last7", "2026-10-17", 16, 3717, 11, 1, 0],
      ["last30", "2026-09-24", 18, 4311, 24, 3, 2],
    ] as const
  ).map(([key, from, videos, views, likes, comments, shares]) => ({
    key,
    from,
    to: "2026-10-23",
    videoCoverage: "available",
    activityCoverage: "unverified",
    videos,
    views,
    likes,
    comments,
    shares,
    netFollowers: null,
    profileViews: null,
    accountViews: null,
    topVideos:
      key === "yesterday"
        ? []
        : [
            {
              url: "https://www.tiktok.com/@onerep.life/video/7699502918365351190",
              title: "Workout logging",
              publishedOn: "2026-10-22",
              views: 278,
              likes: 2,
              comments: 0,
              shares: 0,
            },
          ],
  })),
}
if (params.has("tiktok-unverified")) {
  tiktok.history = undefined
  for (const window of tiktok.windows) {
    window.videoCoverage = "unverified"
    window.videos =
      window.views =
      window.likes =
      window.comments =
      window.shares =
        null
    window.topVideos = []
  }
}
if (params.has("tiktok-followers-test")) {
  for (const point of tiktok.history ?? []) {
    if (point.date === "2026-10-09") point.followers = 1
    if (point.date === "2026-10-16") point.followers = 2
  }
}
const instagram: InstagramSnapshot = {
  provider: "metricool",
  brandId: "7632357",
  accountHandle: "onerep_app",
  timezone: "Europe/Berlin",
  capturedAt: Date.now(),
  accountAsOf: "2026-10-23",
  followers: 4,
  history: [{ date: "2026-10-23", contentViews: null, followers: 4 }],
  windows: tiktok.windows.map((period) => ({
    key: period.key,
    from: period.from,
    to: period.to,
    contentCoverage: "unverified",
    contentCount: null,
    feedPosts: null,
    reels: null,
    views: null,
    likes: null,
    comments: null,
    saves: null,
    shares: null,
    topContent: [],
  })),
}
if (params.has("instagram-zero-test")) {
  for (const period of instagram.windows)
    Object.assign(period, {
      contentCoverage: "available",
      contentCount: 0,
      feedPosts: 0,
      reels: 0,
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
    })
}
const client = {
  watchQuery(reference: FunctionReference<"query">) {
    const social = getFunctionName(reference) === "analytics:tiktokSnapshot"
    const ig = getFunctionName(reference) === "analytics:instagramSnapshot"
    if (social) document.body.dataset.tiktokRequested = "true"
    if (ig) document.body.dataset.instagramRequested = "true"
    return {
      onUpdate() {
        return () => {}
      },
      localQueryResult: () =>
        ig
          ? params.has("instagram-loading")
            ? undefined
            : params.has("instagram")
              ? instagram
              : null
          : social
            ? params.has("tiktok-loading")
              ? undefined
              : params.has("tiktok")
                ? tiktok
                : null
            : params.has("access-loading")
              ? undefined
              : { canView: !params.has("denied") },
      journal() {},
    }
  },
  async action() {
    calls++
    document.body.dataset.reportCalls = String(calls)
    await new Promise((resolve) =>
      setTimeout(resolve, params.has("loading") ? 60_000 : 100)
    )
    if (fail) throw new Error("Simulated error")
    return report
  },
}
createRoot(document.getElementById("root")!).render(
  <ConvexProvider client={client as unknown as ConvexReactClient}>
    <ThemeProvider identities={PALETTES} defaultTheme="system">
      <BrowserRouter>
        <div className="p-2 text-xs">
          Analytics test fixture{" "}
          <label>
            <input
              type="checkbox"
              defaultChecked={fail}
              onChange={(event) => {
                fail = event.target.checked
              }}
            />{" "}
            Simulate failed refresh
          </label>
        </div>
        {params.has("more") ? <More /> : <AdminAnalytics />}
      </BrowserRouter>
    </ThemeProvider>
  </ConvexProvider>
)
