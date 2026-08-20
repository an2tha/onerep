import { useState } from "react"
import { ArrowCounterClockwise, PintGlass, Plus } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { Card, useReplayKey, tint } from "@repo/ui"
import { api } from "../../../../convex/_generated/api"
import { useOfflineMutation } from "@/lib/use-offline-mutation"
import { useSmoothNavigate } from "@/lib/navigation"
import { hapticRain } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import {
  filledWaterGlassCount,
  waterAmountNeededForGlass,
  WATER_GLASS_COUNT,
  waterGlassTargetMl,
} from "@/lib/water-glasses"
import { WATER_BG, WATER_COLOR } from "./constants"
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
  const rain = useReplayKey(1100)

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
    // The drops and the buzz first, the mutation second: the network can take
    // its time, the hand cannot.
    rain.replay()
    hapticRain()
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
    <Card className="dashboard-tile relative overflow-hidden">
      {/* The same row shape as the quick-log list above it: what it is, where
          it stands, and the button that moves it. The eight-segment bar was a
          third idiom on a screen that already had two. */}
      {/* A short shower across the row when a glass lands — nine drops, out
          of step with one another, gone before anyone decides to study it. */}
      {rain.active && (
        <span key={rain.key} className="water-rain" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} />
          ))}
        </span>
      )}

      <div className="relative flex min-h-14 items-center gap-3 px-3.5 py-2.5">
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
          className={cn(
            "motion-tactile flex size-11 shrink-0 items-center justify-center rounded-full",
            rain.active && "water-add-splash"
          )}
          style={{ backgroundColor: WATER_BG, color: WATER_COLOR }}
        >
          <Plus size={16} weight="bold" />
        </button>
      </div>
    </Card>
  )
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
