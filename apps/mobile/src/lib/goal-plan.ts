export type GoalFocus = "hypertrophy" | "deficit" | "recomp" | "endurance"
export type GoalPlan = {
  focus: GoalFocus
}
export const DEFAULT_GOAL_PLAN: GoalPlan = {
  focus: "hypertrophy",
}

/** Distance from a chosen plan, not an estimate of growth or recovery. */
export function goalRangePosition(
  value: number,
  minimum: number,
  maximum: number,
) {
  const scale = Math.max(maximum * 1.5, value, 20)
  return {
    start: (minimum / scale) * 100,
    end: (maximum / scale) * 100,
    marker: Math.min(98, Math.max(2, (value / scale) * 100)),
    scale,
    distance:
      value < minimum ? minimum - value : value > maximum ? value - maximum : 0,
    status:
      value < minimum
        ? ("below" as const)
        : value > maximum
          ? ("above" as const)
          : ("within" as const),
  }
}
