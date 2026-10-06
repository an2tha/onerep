import { v } from "convex/values";

export const goalFocusValidator = v.union(
  v.literal("hypertrophy"),
  v.literal("deficit"),
  v.literal("recomp"),
  v.literal("endurance"),
);
export const goalPlanValidator = v.object({
  focus: goalFocusValidator,
  // Older saved plans may still have these fields. New goals use the whole-body
  // assessment and never ask for a single muscle target.
  muscle: v.optional(v.string()),
  minimumSets: v.optional(v.number()),
  maximumSets: v.optional(v.number()),
});

export function validateGoalRange(minimum: number, maximum: number) {
  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    minimum < 1 ||
    maximum > 30 ||
    minimum >= maximum
  ) {
    throw new Error(
      "Choose a set range between 1 and 30, with the upper bound above the lower bound.",
    );
  }
}
