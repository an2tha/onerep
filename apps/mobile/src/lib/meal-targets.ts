/**
 * Client mirror of `convex/lib/mealTargets.ts`, plus the progress maths the
 * per-meal UI needs. The normalisation helpers are re-exported rather than
 * reimplemented so the Settings preview and the server agree on the numbers.
 */

export {
  DEFAULT_MEAL_IDS,
  DEFAULT_MEAL_SHARES,
  normalizeMealShares,
  resolveMealCalorieTargets,
  type MealShare,
  type ResolvedMealTarget,
} from "../../../../convex/lib/mealTargets"

export type MealTargetState = "under" | "on-track" | "over"

export type MealTargetProgress = {
  /** Consumed / target, clamped to 2 so a wild overshoot still renders a bar. */
  ratio: number
  state: MealTargetState
}

/**
 * How a meal is tracking against its budget.
 *
 * The on-track band is deliberately wide (90–110%): a per-meal budget is a
 * planning aid, and flagging a 30 kcal overshoot as "over" would make the
 * whole feature feel nagging.
 */
export function mealTargetProgress(
  consumedCalories: number,
  target: number
): MealTargetProgress {
  const consumed =
    Number.isFinite(consumedCalories) && consumedCalories > 0
      ? consumedCalories
      : 0

  if (!Number.isFinite(target) || target <= 0) {
    // No budget for this meal — anything logged is "over" by definition, but
    // an empty meal is not a failure.
    return { ratio: consumed > 0 ? 2 : 0, state: consumed > 0 ? "over" : "under" }
  }

  const exact = consumed / target
  const ratio = Math.min(2, exact)

  if (exact > 1.1) return { ratio, state: "over" }
  if (exact >= 0.9) return { ratio, state: "on-track" }
  return { ratio, state: "under" }
}
