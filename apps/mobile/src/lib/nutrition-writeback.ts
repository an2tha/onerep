/**
 * Nutrition and hydration, pushed out to the health store.
 *
 * The reverse of everything else health sync does: workouts and readings
 * flow in from Apple Health / Health Connect, and this is the one place
 * the app flows back out — when a day's food log or water total changes,
 * **each logged food lands as its own named record** (energy, macros, meal
 * and the time it was eaten) and the day's water as its own.
 *
 * Gated on `healthSync.writeEnabled` like every other write, debounced so
 * a burst of logging produces one write rather than a dozen, and keyed by
 * a signature of the items so unchanged days never re-push.
 *
 * The day goes out as one call and its answer is reported rather than dropped.
 * This used to fire and forget, which made a store that refused every meal
 * indistinguishable from one that took them — the shape of a bug that can hide
 * for months. It also used to send only totals, which is what made a health
 * record say "2,020 kcal" and nothing else.
 */

import { useEffect, useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import {
  saveHealthNutritionItems,
  type HealthNutritionItemWrite,
} from "./health-provider"
import {
  toHealthNutritionItems,
  type HealthNutritionItemSource,
} from "./health-nutrition-items"
import { hydrationEnabledFor } from "./hydration"
import { refreshHealthWriteAccess } from "./health-write-access"
import { reportHealthWriteOutcome } from "./health-write-report"

/**
 * What a push is keyed on: everything about the day that reaches the store.
 *
 * The names and meals are in here as well as the numbers, so renaming a meal or
 * correcting a food's name re-pushes the day — the store's record is stale the
 * moment any of it changes, and a signature over totals alone would leave the
 * old name sitting there for ever.
 */
function signatureFor(
  items: readonly HealthNutritionItemWrite[],
  waterMl: number
): string {
  const parts = items.map((item) =>
    [
      item.id,
      item.name,
      item.meal,
      item.loggedAt ?? "",
      Math.round(item.calories),
      Math.round(item.protein),
      Math.round(item.carbs),
      Math.round(item.fat),
    ].join(":")
  )
  return [...parts, `water:${Math.round(waterMl)}`].join("|")
}

/**
 * Days this session has filed food for.
 *
 * Deleting the last meal of a day is the one empty state worth a call: the
 * record has to go, and an empty day is otherwise sent nowhere. Before anything
 * was pushed there is nothing to remove, so a date change stays silent rather
 * than deleting a day it never wrote.
 *
 * Module scope rather than a ref: leaving the day and coming back is the same
 * session, and a clear still waiting on the debounce has to survive the
 * remount, or the store keeps a day nobody can see.
 */
const filedDays = new Set<string>()

export function useNutritionHealthWriteBack(
  dateKey: string,
  foodEntries: readonly HealthNutritionItemSource[] | undefined,
  waterTotalMl?: number
) {
  const preferences = useQuery(api.users.users.getPreferences)
  const writeEnabled = preferences?.healthSync?.writeEnabled ?? false

  const items = useMemo(
    () => toHealthNutritionItems(foodEntries ?? []),
    [foodEntries]
  )

  // With the tracker off nothing is written for hydration at all: an absent
  // metric is the honest record of "not tracked", where a zero would claim the
  // day was spent drinking nothing.
  const water = hydrationEnabledFor(preferences) ? (waterTotalMl ?? 0) : 0
  const signature = signatureFor(items, water)

  useEffect(() => {
    if (!writeEnabled) return
    const dayIsEmpty = items.length === 0 && water <= 0
    // An entirely empty day has nothing to say; skipping it also stops an
    // old write from being shadowed by a fresh zero before the query lands.
    if (dayIsEmpty && !filedDays.has(dateKey)) return

    // The debounce is the whole trick: food logging arrives in bursts —
    // three entries in ten seconds — and one settled write per quiet period is
    // what keeps the store showing the day as it stands rather than as the sum
    // of every intermediate state. Each push replaces the day rather than
    // adding to it, but the burst is still not worth four round trips.
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await saveHealthNutritionItems({
          date: dateKey,
          items,
          ...(water > 0 ? { waterMl: Math.round(water) } : {}),
          ...(dayIsEmpty ? { cleared: true } : {}),
        })
        if (result.saved) {
          if (dayIsEmpty) filedDays.delete(dateKey)
          else filedDays.add(dateKey)
        }
        reportHealthWriteOutcome({
          // The store's own count when it gave one; one write either way.
          saved: result.saved ? (result.written ?? 1) : 0,
          refused: result.saved ? 0 : 1,
          ...(result.reason ? { reason: result.reason } : {}),
          ...(result.message ? { message: result.message } : {}),
        })
        // A refusal for want of permission is the store correcting the app's
        // own account of itself, so the write-access row hears it too.
        if (!result.saved && result.reason === "no_permission") {
          void refreshHealthWriteAccess()
        }
      })()
    }, 1500)
    return () => window.clearTimeout(timer)
    // The signature is the dependency on purpose: it changes when, and only
    // when, something the store would see has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, signature, writeEnabled])
}
