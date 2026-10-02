import type { ProgrammeGoal } from "./nutritionProgramme";

export type GoalFocus = "hypertrophy" | "deficit" | "recomp" | "endurance";

/** Editable planning defaults, not estimates of an individual's optimal intake. */
export function goalNutritionDefaults(
  focus: GoalFocus,
  profile?: { maintenance: number; weightKg: number } | null,
) {
  const goal: ProgrammeGoal =
    focus === "hypertrophy"
      ? "step_up"
      : focus === "deficit"
        ? "step_down"
        : "maintain";
  const changePercent =
    focus === "hypertrophy" ? 5 : focus === "deficit" ? 10 : 0;
  const weight = profile?.weightKg;
  const maintenance = profile?.maintenance;
  const validProfile =
    weight != null &&
    Number.isFinite(weight) &&
    weight > 0 &&
    maintenance != null &&
    Number.isFinite(maintenance) &&
    maintenance > 0;
  return {
    focus,
    goal,
    changePercent,
    weeks: 6,
    fastingHours: 0,
    baselineCalories: validProfile ? Math.round(maintenance) : null,
    protein: validProfile
      ? Math.round(
          weight *
            (focus === "deficit" ? 2 : focus === "endurance" ? 1.6 : 1.8),
        )
      : null,
    fat: validProfile
      ? Math.round(Math.max(weight * 0.6, (maintenance * 0.25) / 9))
      : null,
  };
}

export type GoalNutritionRecommendation = ReturnType<
  typeof goalNutritionDefaults
>;
