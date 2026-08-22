import { useMemo, useState, type CSSProperties } from "react"
import { useQuery } from "convex/react"

import { api } from "../../../convex/_generated/api"
import { useAppAuth } from "@/lib/auth-client"
import { useSmoothNavigate } from "@/lib/navigation"
import { currentDateKey } from "@/lib/food-log"
import { DashboardHero } from "@repo/ui"
import {
  dateKeyToCalendarDate,
  greeting,
  hourInTimeZone,
} from "@/dashboard/helpers"
import { DayTimeline, type TimelineEntry } from "@/dashboard/timeline"
import { DashboardDials } from "@/dashboard/dials"

import LegacyApp from "./App.legacy"

// ─── The old dashboard ────────────────────────────────────────────────────────
//
// Everything that used to be here is still here, verbatim, one file over in
// `App.legacy.tsx`. Flip this to `true` and the old home page comes back
// exactly as it was; flip it back and you are on the bare canvas again. The
// redesign happens below the hero, in the empty space where the cards were.

const USE_LEGACY_DASHBOARD = true

export default function App() {
  if (USE_LEGACY_DASHBOARD) return <LegacyApp />
  return <Dashboard />
}

function Dashboard() {
  const navigate = useSmoothNavigate()
  const { user } = useAppAuth()
  const preferences = useQuery(api.users.users.getPreferences, {})
  const activeTimezone = preferences?.lastActiveTimezone || "UTC"
  const [timelineEntries, setTimelineEntries] =
    useState<TimelineEntry[]>(PLACEHOLDER_TIMELINE)

  const now = useMemo(() => new Date(), [])
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? "there"
  const salutation = greeting(hourInTimeZone(now, activeTimezone))
  const dateLabel = dateKeyToCalendarDate(
    currentDateKey(activeTimezone)
  ).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="dashboard-home desktop-canvas relative flex h-svh flex-col overflow-hidden bg-background lg:pr-8 lg:pl-72">
      <span className="dashboard-home-wash" aria-hidden="true" />
      <div
        className="relative z-10 shrink-0"
        style={{ "--app-hero-min-h": "0rem" } as CSSProperties}
      >
        <DashboardHero
          dateLabel={dateLabel}
          salutation={salutation}
          firstName={firstName}
          action={
            <DashboardDials
              nutritionPercent={62}
              recoveryScore={78}
              // No confirmation step and no picker: the hold *is* the
              // confirmation, so it drops straight into an empty session.
              onStartWorkout={() =>
                navigate("/workout/active", { motion: "forward" })
              }
              onOpenNutrition={() =>
                navigate("/nutrition", { motion: "switch" })
              }
              onOpenRecovery={() => navigate("/health", { motion: "switch" })}
            />
          }
        />
      </div>
      {/* The day ruler is taller than the screen on purpose — scrolling it
          pans through the hours in place, rather than carrying the hero
          off screen with it. */}
      <div className="relative z-10 min-h-0 flex-1">
        <DayTimeline
          entries={timelineEntries}
          onEntryTimeChange={(id, time) =>
            setTimelineEntries((prev) =>
              prev.map((entry) =>
                entry.id === id ? { ...entry, time } : entry
              )
            )
          }
          onAddAtTime={() => navigate("/nutrition", { motion: "forward" })}
        />
      </div>
    </div>
  )
}

// Placeholder shape until this reads from the day's actual log.
const PLACEHOLDER_TIMELINE: TimelineEntry[] = [
  {
    id: "1",
    time: "8:00 AM",
    title: "Breakfast",
    detail: "Oats, banana, coffee",
    kind: "food",
  },
  {
    id: "2",
    time: "10:30 AM",
    title: "Creatine",
    detail: "5 g",
    kind: "supplement",
  },
  {
    id: "3",
    time: "12:00 PM",
    title: "Workout",
    detail: "Upper body · 42 min",
    kind: "workout",
  },
  {
    id: "4",
    time: "1:00 PM",
    title: "Lunch",
    detail: "Chicken bowl",
    kind: "food",
  },
  {
    id: "5",
    time: "3:30 PM",
    title: "Water",
    detail: "500 ml",
    kind: "water",
  },
  {
    id: "6",
    time: "7:00 PM",
    title: "Dinner",
    detail: "Salmon, rice, greens",
    kind: "food",
  },
]
