/**
 * The rail above the wheel: where the day stands, stacked — what's been
 * eaten against the day's targets, how much has been drunk, and which
 * supplements are checked off. On the phone the nutrition and water cards
 * share a row (compact enough to fit half a screen each) and supplements
 * takes the row below full width; on the desk it's three columns.
 *
 * Everything here writes: water's plus pours a glass, and a supplement's
 * checkbox is the log — tapping it takes the dose, tapping a taken one
 * takes it back off. The pages still own the long tail.
 */

import { useState } from "react"
import { useMutation } from "convex/react"
import { Check, Plus } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { api } from "../../../../convex/_generated/api"
import { hapticMedium } from "@/lib/haptics"

export function DayRail({
  dateKey,
  isToday = true,
  calories,
  protein,
  carbs,
  fat,
  calorieGoal,
  proteinGoal,
  carbsGoal,
  fatGoal,
  waterTotalMl,
  waterGoalMl,
  supplements,
  className,
}: {
  dateKey: string
  /** False when the rail is showing a day that has already happened. */
  isToday?: boolean
  calories: number
  protein: number
  carbs: number
  fat: number
  calorieGoal?: number
  proteinGoal?: number
  carbsGoal?: number
  fatGoal?: number
  waterTotalMl: number
  waterGoalMl: number
  /** Supplements on today's plan. `logId` is set when one is already
   * taken today — it's what unticking deletes. */
  supplements: Array<{ id: string; name: string; logId?: string }>
  className?: string
}) {
  const addWater = useMutation(api.logs.water.addEntry)
  const logTaken = useMutation(api.logs.supplements.logTaken)
  const removeLog = useMutation(api.logs.supplements.removeLog)
  const [busySupplementId, setBusySupplementId] = useState<string | null>(null)

  async function toggleSupplement(supplement: { id: string; logId?: string }) {
    if (busySupplementId) return
    setBusySupplementId(supplement.id)
    try {
      if (supplement.logId) {
        await removeLog({ logId: supplement.logId })
      } else {
        await logTaken({ supplementId: supplement.id, date: dateKey })
      }
      hapticMedium()
    } finally {
      setBusySupplementId(null)
    }
  }

  const caloriesRemaining = calorieGoal
    ? Math.round(calorieGoal - calories)
    : null
  const takenCount = supplements.filter((s) => s.logId).length

  return (
    <aside
      className={`grid grid-cols-2 gap-2.5 ${supplements.length > 0 ? "lg:grid-cols-3" : ""} ${className ?? ""}`}
    >
      {/* Nutrition ledger */}
      <RailCard title="Nutrition">
        {caloriesRemaining !== null ? (
          <>
            {/* A day still running has calories left in it. A day that is
              over has a number it landed on, and "432 kcal left" about last
              Tuesday is an instruction nobody can follow. */}
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span className="text-[26px] leading-none font-semibold tracking-tight text-foreground tabular-nums lg:text-[32px]">
                {isToday
                  ? caloriesRemaining >= 0
                    ? caloriesRemaining
                    : `+${Math.abs(caloriesRemaining)}`
                  : Math.round(calories)}
              </span>
              <span className="text-[12px] text-muted-foreground lg:text-[13px]">
                {isToday
                  ? `kcal ${caloriesRemaining >= 0 ? "left" : "over"}`
                  : `of ${Math.round(calorieGoal ?? 0)} kcal`}
              </span>
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <MacroBar label="Protein" value={protein} goal={proteinGoal} />
              <MacroBar label="Carbs" value={carbs} goal={carbsGoal} />
              <MacroBar label="Fat" value={fat} goal={fatGoal} />
            </div>
          </>
        ) : (
          <p className="text-[14px] text-muted-foreground">
            {Math.round(calories)} kcal {isToday ? "so far today" : "logged"}.
          </p>
        )}
      </RailCard>

      {/* Water */}
      <RailCard
        title="Water"
        action={
          <button
            type="button"
            aria-label={
              isToday ? "Add a glass of water" : "Add a glass to this day"
            }
            onClick={() =>
              void addWater({
                date: dateKey,
                entry: {
                  id: `rail:${Date.now()}`,
                  amountMl: 250,
                  // A glass poured into a past day did not happen at this
                  // minute. Noon is the honest default; the wheel can drag
                  // it to the hour it really was.
                  loggedAt: isToday
                    ? new Date().toISOString()
                    : new Date(`${dateKey}T12:00:00`).toISOString(),
                },
              })
            }
            className="motion-tactile inline-flex size-7 items-center justify-center rounded-full bg-foreground text-background"
          >
            <Plus size={14} weight="bold" />
          </button>
        }
      >
        <p className="flex items-baseline gap-1.5">
          <span className="text-[26px] leading-none font-semibold tracking-tight text-foreground tabular-nums lg:text-[32px]">
            {(waterTotalMl / 1000).toFixed(2).replace(/0$/, "")}
          </span>
          <span className="text-[13px] text-muted-foreground">
            / {(waterGoalMl / 1000).toFixed(1).replace(/\.0$/, "")} L
          </span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-500"
            style={{
              width: `${Math.min(100, (waterTotalMl / Math.max(1, waterGoalMl)) * 100)}%`,
            }}
          />
        </div>
      </RailCard>

      {/* Supplements */}
      {supplements.length > 0 && (
        <RailCard
          title="Supplements"
          className="col-span-2 lg:col-span-1"
          action={
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {takenCount}/{supplements.length}
            </span>
          }
        >
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 lg:grid-cols-1">
            {supplements.slice(0, 6).map((supplement) => {
              const taken = Boolean(supplement.logId)
              return (
                <li key={supplement.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={taken}
                    aria-label={
                      taken
                        ? `Untake ${supplement.name}`
                        : `Take ${supplement.name}`
                    }
                    disabled={busySupplementId === supplement.id}
                    onClick={() => void toggleSupplement(supplement)}
                    className="flex min-h-9 w-full items-center gap-2 rounded-lg py-1 text-left text-[14px] disabled:opacity-45"
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        taken
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-transparent"
                      }`}
                      aria-hidden="true"
                    >
                      <Check size={11} weight="bold" />
                    </span>
                    <span
                      className={
                        taken
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }
                    >
                      {supplement.name}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </RailCard>
      )}
    </aside>
  )
}

function MacroBar({
  label,
  value,
  goal,
}: {
  label: string
  value: number
  goal?: number
}) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[12px] text-muted-foreground sm:w-14">
        {label}
      </span>
      <div className="hidden h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted sm:block">
        <div
          className="h-full rounded-full bg-foreground/80 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-right text-[12px] whitespace-nowrap text-muted-foreground tabular-nums">
        {Math.round(value)}
        {goal ? ` / ${Math.round(goal)}g` : "g"}
      </span>
    </div>
  )
}

function RailCard({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card p-3 lg:p-4 ${
        className ?? ""
      }`}
    >
      <header className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="text-[14px] font-medium text-muted-foreground">
          {title}
        </h2>
        {action}
      </header>
      <div className="mt-2">{children}</div>
    </section>
  )
}
