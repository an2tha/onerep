import { useState } from "react"
import {
  ArrowCounterClockwise,
  CaretRight,
  Fire,
  PintGlass,
  Plus,
} from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { Card, CardTitle, useAnimatedNumber, tint } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { useSmoothNavigate } from "@/lib/navigation"
import { useStreakMilestone } from "@/lib/use-streak-milestone"
import { cn } from "@/lib/utils"
import {
  filledWaterGlassCount,
  waterAmountNeededForGlass,
  WATER_GLASS_COUNT,
  waterGlassTargetMl,
} from "@/lib/water-glasses"
import {
  DASHBOARD_SMALL_METRIC_ICON_CLASS,
  FOOD_COLOR,
  WATER_BG,
  WATER_COLOR,
  WEEK_LABELS,
  WORKOUT_COLOR,
} from "./constants"
import { fmtWater } from "./helpers"

type WaterEntry = { id: string; amountMl: number; loggedAt: string }

/**
 * Eight glasses, tappable in either direction. Tapping an empty one fills the
 * day up to that mark rather than adding a fixed amount, which is what people
 * actually mean when they reach for the fifth glass.
 */
export function WaterWidget({ dateKey }: { dateKey: string }) {
  const navigate = useSmoothNavigate()
  const preferences = useQuery(api.users.users.getPreferences)
  const goalMl = preferences?.waterGoalMl ?? 2500

  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const setWaterDay = useOfflineMutation(
    api.logs.water.setDay,
    "logs.water.setDay"
  )

  const entries = (rawEntries ?? []) as WaterEntry[]
  const totalMl = entries.reduce((s, e) => s + e.amountMl, 0)
  const mlPerGlass = waterGlassTargetMl(goalMl, 1)
  const filledCount = filledWaterGlassCount(totalMl, goalMl)

  function addWater(amountMl: number) {
    if (amountMl <= 0) return
    const entry = {
      id: crypto.randomUUID(),
      amountMl,
      loggedAt: new Date().toISOString(),
    }
    void setWaterDay({ date: dateKey, entries: [...entries, entry] })
  }

  function addGlass() {
    if (filledCount >= WATER_GLASS_COUNT) {
      addWater(mlPerGlass)
      return
    }
    addWater(waterAmountNeededForGlass(totalMl, goalMl, filledCount + 1))
  }

  function removeLastEntry() {
    if (entries.length === 0) return
    const sorted = [...entries].sort((a, b) =>
      b.loggedAt.localeCompare(a.loggedAt)
    )
    void setWaterDay({ date: dateKey, entries: sorted.slice(1) })
  }

  return (
    <Card className="dashboard-tile">
      {/* The same row shape as the quick-log list above it: what it is, where
          it stands, and the button that moves it. The eight-segment bar was a
          third idiom on a screen that already had two. */}
      <div className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => navigate("/nutrition")}
          aria-label="Open water log"
          className="min-w-0 flex-1 text-left"
        >
          <p className="native-row-title">Water</p>
          <p className="native-row-detail mt-0.5 tabular-nums">
            {fmtWater(totalMl)} of {fmtWater(goalMl)}
          </p>
        </button>

        {/* The day as a slim bar rather than eight tap targets: one glance,
            and the adding happens on the button beside it. */}
        <span
          className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted/60 sm:w-24"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.min(100, Math.round((totalMl / Math.max(1, goalMl)) * 100))}%`,
              backgroundColor: WATER_COLOR,
            }}
          />
        </span>

        {totalMl > 0 && (
          <button
            type="button"
            onClick={removeLastEntry}
            aria-label="Remove last water entry"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted active:text-foreground"
          >
            <ArrowCounterClockwise size={15} weight="bold" />
          </button>
        )}
        <button
          type="button"
          onClick={addGlass}
          aria-label={`Add ${fmtWater(mlPerGlass)} of water`}
          className="motion-tactile flex size-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
    </Card>
  )
}

/** The training streak, plus the seven dots that explain where it came from. */
export function StreakCard({
  streak,
  workoutsThisWeek,
  workoutDates,
  today,
  translucent = false,
}: {
  streak: number
  workoutsThisWeek: number
  workoutDates: Set<string>
  today: Date
  /** On the hero field the tile becomes a pane the gradient shows through. */
  translucent?: boolean
}) {
  // Build Mon–Sun for the current week
  const todayDow = today.getUTCDay() // 0=Sun … 6=Sat
  const daysFromMon = todayDow === 0 ? 6 : todayDow - 1
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - daysFromMon)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const active = streak > 0
  const milestoneActive = useStreakMilestone(streak)
  const animatedStreak = useAnimatedNumber(streak)
  const fireColor = active
    ? WORKOUT_COLOR
    : "color-mix(in srgb, var(--foreground) 18%, transparent)"

  const card = (
    <div className="flex h-full flex-col px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Streak</CardTitle>
          <Fire
            size={17}
            weight={active ? "fill" : "regular"}
            style={{ color: fireColor }}
            className="size-[17px] shrink-0"
          />
        </div>

        <div
          className={cn(
            "mt-1 flex items-baseline gap-1.5",
            milestoneActive && "streak-milestone"
          )}
          role={milestoneActive ? "status" : undefined}
          aria-label={
            milestoneActive ? `${streak} day streak milestone` : undefined
          }
        >
          <span
            className="text-[26px] leading-none font-bold tracking-tight tabular-nums"
            style={{
              color: active
                ? WORKOUT_COLOR
                : "color-mix(in srgb, var(--foreground) 30%, transparent)",
            }}
          >
            {animatedStreak}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground/50">
            {streak === 1 ? "day" : "days"}
          </span>
        </div>

        {/* The week, one flame per day: lit for a day that was trained,
            an empty outline for one that wasn't. */}
        <div className="mt-3 flex items-end justify-between gap-0.5">
          {weekDays.map((iso, i) => {
            const isToday = iso === today.toISOString().slice(0, 10)
            const isFuture = iso > today.toISOString().slice(0, 10)
            const done = workoutDates.has(iso)
            return (
              <div key={iso} className="flex flex-col items-center gap-1">
                <Fire
                  size={15}
                  weight={done ? "fill" : "regular"}
                  aria-hidden="true"
                  className="size-[15px] shrink-0 transition-colors"
                  style={{
                    color: done
                      ? WORKOUT_COLOR
                      : // Today is still winnable, so its outline sits a shade
                        // brighter than the days already lost.
                        `color-mix(in srgb, var(--foreground) ${
                          isToday ? 32 : isFuture ? 12 : 20
                        }%, transparent)`,
                  }}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isToday ? "text-foreground/60" : "text-muted-foreground/35"
                  )}
                >
                  {WEEK_LABELS[i]}
                </span>
              </div>
            )
          })}
        </div>

        <p className="mt-auto truncate pt-2 text-[11px] font-medium text-muted-foreground/45 tabular-nums">
          {workoutsThisWeek === 1
            ? "1 workout this week"
            : `${workoutsThisWeek} workouts this week`}
      </p>
    </div>
  )

  // On the hero field there is no card: the streak is a line of the hero, so
  // it drops the surface, the title and the footnote and keeps the two things
  // that carry meaning — the count, and the week behind it.
  if (translucent) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div
          className={cn(
            "flex items-baseline gap-1.5",
            milestoneActive && "streak-milestone"
          )}
          role={milestoneActive ? "status" : undefined}
          aria-label={
            milestoneActive ? `${streak} day streak milestone` : undefined
          }
        >
          <span
            className="text-[22px] leading-none font-bold tracking-tight tabular-nums"
            style={{
              color: active
                ? WORKOUT_COLOR
                : "color-mix(in srgb, var(--foreground) 35%, transparent)",
            }}
          >
            {animatedStreak}
          </span>
          <span className="text-[13px] font-medium text-muted-foreground">
            {streak === 1 ? "day streak" : "day streak"}
          </span>
        </div>

        <div className="flex items-end gap-2.5">
          {weekDays.map((iso, i) => {
            const isToday = iso === today.toISOString().slice(0, 10)
            const isFuture = iso > today.toISOString().slice(0, 10)
            const done = workoutDates.has(iso)
            return (
              <div
                key={iso}
                className="flex min-h-11 flex-col items-center justify-center gap-1"
              >
                <Fire
                  size={14}
                  weight={done ? "fill" : "regular"}
                  aria-hidden="true"
                  className="size-[14px] shrink-0"
                  style={{
                    color: done
                      ? WORKOUT_COLOR
                      : `color-mix(in srgb, var(--foreground) ${
                          isToday ? 34 : isFuture ? 14 : 22
                        }%, transparent)`,
                  }}
                />
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    isToday ? "text-foreground/70" : "text-muted-foreground/60"
                  )}
                >
                  {WEEK_LABELS[i]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return <Card className="dashboard-tile h-full">{card}</Card>
}

/** The half-width water tile, for the compact widget grid. */
export function WaterSmall({
  dateKey,
  goalMl,
}: {
  dateKey: string
  goalMl: number
}) {
  const [hoveredGlass, setHoveredGlass] = useState<number | null>(null)
  const rawEntries = useQuery(api.logs.water.getDay, { date: dateKey })
  const entries = (rawEntries ?? []) as WaterEntry[]
  const setWaterDay = useOfflineMutation(
    api.logs.water.setDay,
    "logs.water.setDay"
  )
  const totalMl = entries.reduce((s, e) => s + e.amountMl, 0)
  const filledCount = filledWaterGlassCount(totalMl, goalMl)
  const previewFilledCount =
    hoveredGlass === null
      ? filledCount
      : Math.max(filledCount, hoveredGlass + 1)

  function addWater(amountMl: number) {
    if (amountMl <= 0) return
    const entry = {
      id: crypto.randomUUID(),
      amountMl,
      loggedAt: new Date().toISOString(),
    }
    void setWaterDay({ date: dateKey, entries: [...entries, entry] })
  }

  function fillToGlass(index: number) {
    addWater(waterAmountNeededForGlass(totalMl, goalMl, index + 1))
  }

  function removeLastGlass() {
    if (entries.length === 0) return
    const sorted = [...entries].sort((a, b) =>
      b.loggedAt.localeCompare(a.loggedAt)
    )
    void setWaterDay({ date: dateKey, entries: sorted.slice(1) })
  }

  return (
    <Card className="dashboard-tile h-full">
      <div className="flex h-full flex-col justify-between px-3.5 py-3">
        <div className="flex items-start justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Water
          </p>
          <p className="text-[9px] text-muted-foreground/30 tabular-nums">
            {filledCount}/{WATER_GLASS_COUNT}
          </p>
        </div>
        <div>
          <div
            className="grid grid-cols-4 gap-1"
            onPointerLeave={() => setHoveredGlass(null)}
          >
            {Array.from({ length: WATER_GLASS_COUNT }, (_, i) => {
              const filled = i < filledCount
              const previewFilled = i < previewFilledCount
              return (
                <button
                  key={i}
                  onClick={filled ? removeLastGlass : () => fillToGlass(i)}
                  onPointerEnter={() => setHoveredGlass(i)}
                  onFocus={() => setHoveredGlass(i)}
                  onBlur={() => setHoveredGlass(null)}
                  className={cn(
                    "flex h-6 items-center justify-center rounded transition-all active:scale-[0.985]",
                    previewFilled ? "" : "bg-muted/25 active:bg-muted/50"
                  )}
                  style={
                    previewFilled
                      ? {
                          backgroundColor: tint(WATER_COLOR, 20),
                        }
                      : undefined
                  }
                  aria-label={
                    filled
                      ? "Remove glass"
                      : `Fill to ${fmtWater(waterGlassTargetMl(goalMl, i + 1))}`
                  }
                >
                  <PintGlass
                    size={11}
                    weight={previewFilled ? "fill" : "regular"}
                    style={{ color: previewFilled ? WATER_COLOR : undefined }}
                    className={
                      previewFilled ? undefined : "text-muted-foreground/20"
                    }
                  />
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[9px] text-muted-foreground/30 tabular-nums">
            {fmtWater(totalMl)} / {fmtWater(goalMl)}
          </p>
        </div>
      </div>
    </Card>
  )
}

/** The half-width streak tile, for the compact widget grid. */
export function StreakSmall({ streak }: { streak: number }) {
  const navigate = useSmoothNavigate()
  const active = streak > 0
  const milestoneActive = useStreakMilestone(streak)
  return (
    <Card className="dashboard-tile h-full">
      <button
        onClick={() => navigate("/workouts")}
        className="motion-tactile-subtle flex h-full w-full flex-col justify-between px-3.5 py-3 text-left transition-colors active:bg-muted/20"
      >
        <div className="flex w-full items-start justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50">
            Streak
          </p>
          <CaretRight size={9} className="mt-0.5 text-muted-foreground/20" />
        </div>
        <div
          className={cn(
            "flex items-end gap-2",
            milestoneActive && "streak-milestone"
          )}
        >
          <Fire
            size={22}
            weight={active ? "fill" : "regular"}
            style={{
              color: active
                ? FOOD_COLOR
                : "color-mix(in srgb, var(--foreground) 20%, transparent)",
            }}
            className={DASHBOARD_SMALL_METRIC_ICON_CLASS}
          />
          <div>
            <span
              className="text-[1.35rem] leading-none font-bold tracking-tight tabular-nums"
              style={{
                color: active
                  ? FOOD_COLOR
                  : "color-mix(in srgb, var(--foreground) 35%, transparent)",
              }}
            >
              {streak}
            </span>
            <p className="text-[9px] text-muted-foreground/35">
              {streak === 1 ? "day" : "days"}
            </p>
          </div>
        </div>
      </button>
    </Card>
  )
}
