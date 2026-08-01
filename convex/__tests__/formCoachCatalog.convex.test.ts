import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import { FORM_COACH_FALLBACK, matchFormCoachExercise } from "../ai/formCoach";

const modules = import.meta.glob("../**/*.ts");

describe("form coach movement catalog", () => {
  test("names the movement when the exercise is one it knows", () => {
    expect(matchFormCoachExercise("Barbell Back Squat").slug).toBe("squat");
    expect(matchFormCoachExercise("Romanian Deadlift").slug).toBe("deadlift");
    expect(matchFormCoachExercise("Incline Bench Press").slug).toBe("bench");
    expect(matchFormCoachExercise("Seated Cable Row").slug).toBe("row");
  });

  // The measurement tools and the prompt are exercise-agnostic, so there is no
  // such thing as an exercise the coach has to turn away.
  test("falls back rather than refusing an exercise it has never seen", () => {
    for (const name of ["Cable Fly", "Zercher Carry", "", "🙃"]) {
      expect(matchFormCoachExercise(name).slug).toBe(FORM_COACH_FALLBACK.slug);
    }
  });

  test("publishes the fallback last, and only it is flagged", () => {
    const t = convexTest(schema, modules);

    return t.query(api.ai.formCoach.listSupported, {}).then((catalog) => {
      const flagged = catalog.filter((entry) => entry.fallback);
      expect(flagged).toHaveLength(1);
      expect(catalog.at(-1)?.slug).toBe(FORM_COACH_FALLBACK.slug);
      // Empty keywords are what stop older clients — which match on keywords
      // alone — from picking the fallback up and changing behaviour under them.
      expect(flagged[0]?.keywords).toEqual([]);
      for (const entry of catalog) {
        expect(entry.setup.length).toBeGreaterThan(0);
      }
    });
  });
});
