import { describe, expect, test } from "bun:test";
import { coachPreparationCandidates } from "./coachPreparationCandidates";
import type { CoachWorkspace } from "./coachWorkspace";

describe("Coach preparation candidates", () => {
  test("respects absent personal data and never substitutes client context or default targets", () => {
    const workspace = {
      nutritionTargets: null,
      recipes: [],
      omitted: ["recentWorkouts"],
    } as unknown as CoachWorkspace;
    expect(coachPreparationCandidates(workspace)).toEqual([]);
  });

  test("uses actual saved targets and caps lists without generating advice", () => {
    const workspace = {
      nutritionTargets: { protein: 131.2, calories: null },
      recipes: Array.from({ length: 6 }, (_, i) => ({
        name: `Meal ${i}`,
        servings: 2,
      })),
      recentWorkouts: [
        { date: "2026-09-21", durationMinutes: 45, exercises: [{}, {}] },
      ],
    } as unknown as CoachWorkspace;
    const result = coachPreparationCandidates(workspace);
    expect(result.map((candidate) => candidate.id)).toEqual([
      "nutrition_targets",
      "recent_training",
      "saved_meals",
    ]);
    expect(result[0].rows).toEqual([
      { label: "Daily protein target", value: "131 g" },
    ]);
    expect(result[1].rows).toEqual([
      { label: "2026-09-21", value: "45 min · 2 exercises shown" },
    ]);
    expect(result[2].rows).toHaveLength(3);
  });
});
