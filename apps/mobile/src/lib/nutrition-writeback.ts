/**
 * Nutrition and hydration, pushed out to the health store.
 *
 * The reverse of everything else health sync does: workouts and readings
 * flow in from Apple Health / Health Connect, and this is the one place
 * the app flows back out — when a day's food log or water total changes,
 * its totals land in the store as dietary energy, macros, and hydration.
 *
 * Gated on `healthSync.writeEnabled` like every other write, debounced so
 * a burst of logging produces one write rather than a dozen, and keyed by
 * a signature of the totals so unchanged days never re-push. Per-metric
 * writes go through `saveHealthDailyMetric`, which already no-ops on web
 * and degrades silently on shells older than the native layer.
 */

import { useEffect, useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { saveHealthDailyMetric } from "./health-provider"

export type NutritionTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

function signatureFor(totals: NutritionTotals, waterMl: number): string {
  const r = (n: number) => Math.round(n)
  return [
    r(totals.calories),
    r(totals.protein),
    r(totals.carbs),
    r(totals.fat),
    r(waterMl),
  ].join(":")
}

export function useNutritionHealthWriteBack(
  dateKey: string,
  foodEntries:
    | { calories: number; protein: number; carbs: number; fat: number }[]
    | undefined,
  waterTotalMl?: number
) {
  const preferences = useQuery(api.users.users.getPreferences)
  const writeEnabled = preferences?.healthSync?.writeEnabled ?? false

  const totals = useMemo<NutritionTotals>(() => {
    return (foodEntries ?? []).reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.calories,
        protein: acc.protein + entry.protein,
        carbs: acc.carbs + entry.carbs,
        fat: acc.fat + entry.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }, [foodEntries])

  const water = waterTotalMl ?? 0
  const signature = signatureFor(totals, water)

  useEffect(() => {
    if (!writeEnabled) return
    // An entirely empty day has nothing to say; skipping it also stops an
    // old write from being shadowed by a fresh zero before the query lands.
    if (totals.calories <= 0 && water <= 0) return

    // The debounce is the whole trick: food logging arrives in bursts —
    // three entries in ten seconds — and Health Connect merges records
    // by summing, so five pushes of running totals would read as five
    // days' worth of food. One settled write per quiet period.
    const timer = window.setTimeout(() => {
      const entries: [string, number][] = [
        ["dietaryEnergyKcal", Math.round(totals.calories)],
        ["dietaryProteinG", Math.round(totals.protein)],
        ["dietaryCarbsG", Math.round(totals.carbs)],
        ["dietaryFatG", Math.round(totals.fat)],
      ]
      if (water > 0) entries.push(["hydrationMl", Math.round(water)])
      for (const [metric, value] of entries) {
        void saveHealthDailyMetric({ metric, date: dateKey, value })
      }
    }, 1500)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, signature, writeEnabled])
}
