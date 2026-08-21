import { describe, expect, test } from "bun:test";
import {
  MAX_WORKSPACE_CHARS,
  fitWorkspaceToBudget,
} from "../coachWorkspaceBudget";

function bigString(length: number) {
  return "x".repeat(length);
}

/** A workspace comfortably over budget, with every trimmable field populated. */
function oversizedWorkspace() {
  return {
    today: "2026-08-01",
    personalized: true,
    routine: [{ day: "Mon", presetId: "p1", presetName: "Push" }],
    profile: { allergies: ["peanut"], safetyFlags: ["rehab"] },
    goals: [{ id: "g1", title: "Squat 140kg", tasks: [] }],
    presets: Array.from({ length: 40 }, (_, index) => ({
      id: `preset-${index}`,
      name: `Preset ${index}`,
      snapshot: {
        focus: "strength",
        items: Array.from({ length: 12 }, (_, item) => ({
          name: `Exercise ${item} ${bigString(60)}`,
          sets: 4,
          reps: 8,
        })),
      },
    })),
    recipes: Array.from({ length: 30 }, (_, index) => ({
      id: `recipe-${index}`,
      name: `Recipe ${index}`,
      ingredients: Array.from({ length: 12 }, (_, item) => ({
        id: `i-${item}`,
        name: `Ingredient ${item} ${bigString(60)}`,
        grams: 100,
      })),
    })),
    foodEntries: Array.from({ length: 50 }, (_, index) => ({
      date: "2026-08-01",
      name: `Food ${index} ${bigString(80)}`,
    })),
    recentActions: Array.from({ length: 30 }, (_, index) => ({
      id: `a-${index}`,
      summary: bigString(120),
    })),
    progressMetrics: Array.from({ length: 24 }, (_, index) => ({
      id: `m-${index}`,
      title: `Metric ${index}`,
      entries: Array.from({ length: 14 }, () => ({
        date: "2026-08-01",
        value: 1,
      })),
    })),
    bodyMeasurements: Array.from({ length: 30 }, () => ({
      date: "2026-08-01",
      weightKg: 80,
      notes: bigString(100),
    })),
    memories: Array.from({ length: 40 }, () => ({ value: bigString(150) })),
    recentWorkouts: Array.from({ length: 30 }, (_, index) => ({
      id: `w-${index}`,
      exercises: Array.from({ length: 12 }, () => ({
        name: bigString(60),
        setCount: 4,
      })),
    })),
    checkIns: Array.from({ length: 14 }, () => ({
      date: "2026-08-01",
      energy: 3,
    })),
    water: Array.from({ length: 14 }, () => ({
      date: "2026-08-01",
      totalMl: 2000,
    })),
    fasting: Array.from({ length: 14 }, () => ({
      startDate: "2026-08-01",
      hours: 16,
    })),
    supplementAdherence: { days: [], bySupplement: [] },
  };
}

describe("fitWorkspaceToBudget", () => {
  test("passes a small workspace through untouched", () => {
    const workspace = { today: "2026-08-01", presets: [], foodEntries: [] };
    const result = fitWorkspaceToBudget(workspace);

    expect(result.truncated).toEqual([]);
    expect(result.today).toBe("2026-08-01");
  });

  test("does not mutate its input", () => {
    const workspace = oversizedWorkspace();
    const before = JSON.stringify(workspace).length;
    fitWorkspaceToBudget(workspace);

    expect(JSON.stringify(workspace).length).toBe(before);
  });

  test("trims an oversized workspace under the cap", () => {
    const workspace = oversizedWorkspace();
    expect(JSON.stringify(workspace).length).toBeGreaterThan(
      MAX_WORKSPACE_CHARS,
    );

    const result = fitWorkspaceToBudget(workspace);

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(
      MAX_WORKSPACE_CHARS,
    );
    expect(result.truncated.length).toBeGreaterThan(0);
  });

  test("names every trim step it applied", () => {
    const result = fitWorkspaceToBudget(oversizedWorkspace());

    // The model needs this to say "partial history" instead of confabulating.
    for (const field of result.truncated) {
      expect(typeof field).toBe("string");
      expect(field.length).toBeGreaterThan(0);
    }
    expect(result.truncated[0]).toBe("recipes.ingredients");
  });

  test("never trims the identifiers operations depend on", () => {
    // Trimming these would stop the model acting, not merely narrow its view.
    const result = fitWorkspaceToBudget(oversizedWorkspace(), 500);

    expect(result.today).toBe("2026-08-01");
    expect(result.routine).toHaveLength(1);
    expect(result.profile.allergies).toEqual(["peanut"]);
    expect(result.goals).toHaveLength(1);
    expect(result.presets).toHaveLength(40);
    expect(result.recipes).toHaveLength(30);
    for (const preset of result.presets) {
      expect(preset.id).toMatch(/^preset-/);
      expect(preset.name).toMatch(/^Preset /);
    }
    for (const recipe of result.recipes) {
      expect(recipe.id).toMatch(/^recipe-/);
      expect(recipe.name).toMatch(/^Recipe /);
    }
  });

  test("drops the lowest-value behavioural windows last", () => {
    const result = fitWorkspaceToBudget(oversizedWorkspace(), 500);

    // With an unreachable budget every step runs, so these are gone.
    expect(result.truncated).toContain("water");
    expect(result.truncated).toContain("fasting");
    expect(result.truncated).toContain("supplementAdherence");
    expect(result).not.toHaveProperty("water");
    expect(result).not.toHaveProperty("fasting");
    expect(result).not.toHaveProperty("supplementAdherence");
  });
});
