/**
 * Small pure functions the Today cards share.
 *
 * Nothing here touches Convex or React, which is the point: these are the bits
 * that can be reasoned about — and tested — without standing up the dashboard.
 */

import { todayIso } from "@/lib/workout-sync"
import { ABORTED_WORKOUT_SLOT_KEY } from "./constants"
import type { ActiveWorkoutCandidate, RoutineDay } from "./constants"
import type { FoodLogEntry, RecipeIngredient } from "@/lib/food-log"
import { dateForOffset } from "@/lib/food-log"

export function greeting(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export function fmtKcal(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n))
}

export function fmtWater(ml: number): string {
  if (ml >= 1000) {
    const l = ml / 1000
    return l % 1 === 0 ? `${l} L` : `${l.toFixed(1)} L`
  }
  return `${ml} ml`
}

export function dateKeyToCalendarDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`)
}

export function dayOffsetLabel(offset: number, timeZone: string): string {
  if (offset === 0) return "Today"
  if (offset === -1) return "Yesterday"
  return dateKeyToCalendarDate(
    dateForOffset(offset, timeZone)
  ).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

/**
 * How far back a day sits, in the words somebody would actually use.
 *
 * A date alone says which day it was and nothing about how long ago that
 * was, and working it out from the numerals is arithmetic the header should
 * be doing. Past days only — the dashboard never shows a future one.
 */
export function daysAgoLabel(dateKey: string, todayKey: string): string {
  const from = new Date(`${dateKey}T12:00:00`).getTime()
  const to = new Date(`${todayKey}T12:00:00`).getTime()
  const days = Math.round((to - from) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 14) return "Last week"
  if (days < 31) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

export function dateKeyToDay(dateKey: string, timeZone: string): RoutineDay {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(`${dateKey}T12:00:00Z`))

  const map: Record<string, RoutineDay> = {
    Mon: "Mon",
    Tue: "Tue",
    Wed: "Wed",
    Thu: "Thu",
    Fri: "Fri",
    Sat: "Sat",
    Sun: "Sun",
  }

  return map[weekday]
}

export function hourInTimeZone(date: Date, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(date)
  )
}

export function totalsForEntries(entries: FoodLogEntry[]) {
  return entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

export function totalsForRecipe(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, ingredient) => ({
      calories:
        acc.calories +
        Math.round((ingredient.caloriesPer100 * ingredient.grams) / 100),
      protein:
        acc.protein +
        Math.round((ingredient.proteinPer100 * ingredient.grams) / 100),
      carbs:
        acc.carbs +
        Math.round((ingredient.carbsPer100 * ingredient.grams) / 100),
      fat:
        acc.fat + Math.round((ingredient.fatPer100 * ingredient.grams) / 100),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

export function readRecentlyAbortedWorkoutSlot(): 1 | 2 | null {
  if (typeof window === "undefined") return null
  const value = window.sessionStorage.getItem(ABORTED_WORKOUT_SLOT_KEY)
  if (value === "1") return 1
  if (value === "2") return 2
  return null
}

export function isLiveActiveWorkout(
  workout: ActiveWorkoutCandidate | null | undefined
) {
  if (!workout) return false
  if (workout.completedAt || workout.abortedAt) return false
  const status = workout.status?.toLowerCase()
  return status !== "aborted" && status !== "complete" && status !== "completed"
}

/** A calendar date `days` away from today, in the user's local time. */
export function offsetIsoDate(days: number) {
  const date = new Date(`${todayIso()}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/** "Tuesday" for this week, "Mar 3" beyond it. */
export function formatNudgeDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  const daysAgo = Math.round(
    (Date.parse(`${todayIso()}T12:00:00`) - parsed.getTime()) / 86_400_000
  )
  if (daysAgo === 0) return "Today"
  if (daysAgo === 1) return "Yesterday"
  if (daysAgo < 7)
    return parsed.toLocaleDateString(undefined, { weekday: "long" })
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
