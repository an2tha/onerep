/**
 * Formatting shared between the exercise list and the exercise detail page.
 * Both screens show the same muscles, the same dates and the same weights, and
 * the two of them disagreeing about any of it would be worse than the effort of
 * one small module.
 */

import type { WeightUnit } from "./health-goals"

export const EXERCISE_CATEGORY_LABELS: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
  core: "Core",
}

export function titleCase(value: string) {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function muscleSummary(primaryMuscles: string[] | undefined) {
  const muscles = (primaryMuscles ?? []).map(titleCase)
  return muscles.length > 0 ? muscles.join(" · ") : "Full body"
}

export function formatSessionDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function toDisplayWeight(kg: number, unit: WeightUnit) {
  return unit === "lbs" ? kg * 2.20462 : kg
}

export function formatWeight(kg: number, unit: WeightUnit) {
  return `${formatWeightValue(kg, unit)} ${unit}`
}

/** The number on its own, for places that already say which unit they mean. */
export function formatWeightValue(kg: number, unit: WeightUnit) {
  const value = toDisplayWeight(kg, unit)
  return value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
}
