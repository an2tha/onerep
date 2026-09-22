import type { CoachPreparation } from "../../packages/models/src/coachPreparation";
import type { CoachWorkspace } from "./coachWorkspace";

/** Only server-authorized facts, with no generated claims or executable actions. */
export function coachPreparationCandidates(
  workspace: CoachWorkspace,
): CoachPreparation[] {
  const candidates: CoachPreparation[] = [];
  const targets = workspace.nutritionTargets;
  const targetRows = [
    { label: "Daily protein target", value: targets?.protein, unit: "g" },
    { label: "Daily calorie target", value: targets?.calories, unit: "kcal" },
  ].flatMap(({ label, value, unit }) =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? [{ label, value: `${Math.round(value)} ${unit}` }]
      : [],
  );
  if (targetRows.length)
    candidates.push({
      id: "nutrition_targets",
      title: "Your nutrition targets",
      detail:
        "Current saved daily targets, useful for nutrition and meal-planning questions. These are targets, not logged intake.",
      rows: targetRows,
    });
  const workouts =
    "recentWorkouts" in workspace ? workspace.recentWorkouts.slice(0, 3) : [];
  if (workouts.length)
    candidates.push({
      id: "recent_training",
      title: "Recent training",
      detail:
        "Recent logged sessions, useful context for workout planning, training changes, and progress questions.",
      rows: workouts.map((workout) => ({
        label: workout.date,
        value: `${workout.durationMinutes} min · ${workout.exercises.length} exercises shown`,
      })),
    });
  const recipes = workspace.recipes.slice(0, 3);
  if (recipes.length)
    candidates.push({
      id: "saved_meals",
      title: "Your saved meals",
      detail:
        "A short list of saved recipes, useful for choosing a meal or discussing an existing recipe. Nothing has been logged.",
      rows: recipes.map((recipe) => ({
        label: recipe.name.slice(0, 100),
        value: `${recipe.servings} servings`,
      })),
    });
  return candidates;
}
