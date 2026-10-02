import { tr } from "@repo/ui/i18n"
import type { GoalFocus } from "../../../../convex/lib/goalNutrition"

export const GOAL_NUTRITION_LABELS: Record<GoalFocus, string> = {
  hypertrophy: tr("Build muscle"),
  deficit: tr("Lose fat"),
  recomp: tr("Recomposition"),
  endurance: tr("Build endurance"),
}
export const GOAL_NUTRITION_NOTES: Record<GoalFocus, string> = {
  hypertrophy: tr(
    "Start near estimated maintenance, then increase calories by 5% over the programme. Keep lifting and review weight and performance before adding more food."
  ),
  deficit: tr(
    "Start near estimated maintenance, then reduce calories by 10% over the programme. Keep protein consistent and review weight loss, hunger and training performance."
  ),
  recomp: tr(
    "Start near estimated maintenance with consistent protein. Follow waist measurements and lifting performance over several weeks before changing calories."
  ),
  endurance: tr(
    "Start near estimated maintenance and leave room for carbohydrates. Longer or harder sessions may need more food; this daily baseline does not estimate session-specific fueling."
  ),
}
