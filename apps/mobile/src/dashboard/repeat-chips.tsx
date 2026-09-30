import { tr } from "@repo/ui/i18n"
import { useMemo } from "react"
import { useMutation, useQuery } from "convex/react"
import { Plus } from "@phosphor-icons/react"
import { toast } from "@repo/ui"

import { api } from "../../../../convex/_generated/api"
import { hapticMedium } from "@/lib/haptics"
import { announceOrbActivity } from "@/lib/orb-activity"
import {
  defaultMeal,
  foodLogEntriesFromMealPreset,
  stripUndefined,
  type FoodLogEntry,
} from "@/lib/food-log"
import { createClientId } from "@/lib/utils"
import { foodLogTimestampForMeal } from "@/lib/food-log-context"
import { buildQuickRepeatFoods } from "@/lib/food-quick-repeat"
import { useEnergyUnit } from "@/lib/use-energy-unit"
import { energyDisplay } from "@repo/ui"

/**
 * The foods worth a chip: the most-logged ones, newest portion winning.
 */
function macroLine(entry: { calories?: number; protein?: number }, unit: string) {
  const calories = Math.round(entry.calories ?? 0)
  const protein = Math.round(entry.protein ?? 0)
  return protein > 0
    ? tr("{{value0}} {{value1}} · {{value2}}g protein", {
        value0: energyDisplay(calories, unit as never),
        value1: unit,
        value2: protein,
      })
    : `${energyDisplay(calories, unit as never)} ${unit}`
}

/**
 * One-tap repeats that live on the dashboard itself: the foods this account
 * actually logs, one tap each, no drawer in between. The FAB stays for
 * everything the list cannot do.
 */
export function RepeatChips({ dateKey }: { dateKey: string }) {
  const energyUnit = useEnergyUnit()
  const recentFood = useQuery(api.logs.foodLogs.getRecent, {
    beforeOrOn: dateKey,
  })
  const mealPresets = useQuery(api.logs.mealPresets.list) as
    | Array<{ id: string; name: string; meal: string; entries: FoodLogEntry[] }>
    | undefined
  const addFood = useMutation(api.logs.foodLogs.addEntry)
  const removeFood = useMutation(api.logs.foodLogs.removeEntry)

  const choices = useMemo(() => {
    const repeats = buildQuickRepeatFoods(
      ((recentFood ?? []) as Parameters<typeof buildQuickRepeatFoods>[0]).filter(
        (day) => day.date !== dateKey
      ),
      4
    )
    return [
      ...repeats.map((food) => ({
        key: `again:${food.key}`,
        name: food.entry.name,
        detail: macroLine(food.entry, energyUnit),
        entries: () => [food.entry],
      })),
      ...(mealPresets ?? []).slice(0, 2).map((preset) => ({
        key: `saved:${preset.id}`,
        name: preset.name,
        detail: tr("{{value0}} items · {{value1}}", {
          value0: preset.entries.length,
          value1: macroLine(
            preset.entries.reduce(
              (sum, entry) => ({
                calories: sum.calories + (entry.calories ?? 0),
                protein: sum.protein + (entry.protein ?? 0),
              }),
              { calories: 0, protein: 0 }
            ),
            energyUnit
          ),
        }),
        entries: () =>
          foodLogEntriesFromMealPreset({
            entries: preset.entries,
            meal: preset.meal,
          } as Parameters<typeof foodLogEntriesFromMealPreset>[0]),
      })),
    ].slice(0, 6)
  }, [dateKey, energyUnit, mealPresets, recentFood])

  if ((recentFood === undefined && mealPresets === undefined) || choices.length === 0) {
    return null
  }

  async function log(choice: (typeof choices)[number]) {
    const entries = choice.entries().map((entry) => ({
      ...entry,
      id: createClientId(),
      meal: entry.meal ?? defaultMeal(),
      loggedAt: foodLogTimestampForMeal(dateKey, entry.meal ?? defaultMeal()),
    }))
    try {
      await Promise.all(entries.map((entry) => addFood({ date: dateKey, entry })))
      announceOrbActivity("log", Math.min(entries.length, 3))
      hapticMedium()
      toast.success(tr("{{value0}} logged", { value0: choice.name }), {
        action: {
          label: tr("Undo"),
          onClick: () => {
            void Promise.all(
              entries.map((entry) =>
                removeFood({ date: dateKey, entryId: entry.id })
              )
            ).catch(() => {
              toast.error(tr("Couldn't undo that"))
            })
          },
        },
      })
    } catch {
      toast.error(tr("Couldn't log that. Try again."))
    }
  }

  return (
    <div
      aria-label={tr("Log again")}
      className="repeat-chips mx-[var(--app-page-x)] flex gap-2 overflow-x-auto pb-1 md:mx-8"
    >
      {choices.map((choice) => (
        <button
          key={choice.key}
          type="button"
          onClick={() => void log(choice)}
          className="motion-tactile flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] leading-none font-medium shadow-[0_1px_4px_rgba(0,0,0,0.06)] active:bg-muted/60"
        >
          <Plus size={14} weight="bold" aria-hidden="true" />
          <span className="max-w-40 truncate">{choice.name}</span>
          <span className="text-muted-foreground">{choice.detail}</span>
        </button>
      ))}
    </div>
  )
}
