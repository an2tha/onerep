import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

async function seedExercise(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    userId: string;
    exerciseId: string;
    name: string;
    category: string;
    level: string;
    mechanic: string;
    equipment: string;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    instructions: string[];
  }> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("exercises", {
      userId: "__global__",
      exerciseId: "barbell-squat",
      name: "Barbell Squat",
      category: "strength",
      level: "intermediate",
      mechanic: "compound",
      equipment: "barbell",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: ["glutes", "hamstrings"],
      instructions: ["Brace, descend, and stand tall."],
      ...overrides,
    }),
  );
}

describe("exercise catalog Convex functions", () => {
  test("search returns global exercises mapped to the client shape", async () => {
    const t = convexTest(schema, modules);
    await seedExercise(t);

    const results = await t.query(api.exercises.search, {});

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "barbell-squat",
      name: "Barbell Squat",
      category: "strength",
      muscle: "Quadriceps · Glutes · Hamstrings",
      description: "Brace, descend, and stand tall.",
      sets: "3 × 8–12 reps",
      color: "#78716c",
      level: "intermediate",
      mechanic: "compound",
      equipment: "barbell",
    });
  });

  test("search filters by categories, deduplicates categories, and excludes non-global exercises", async () => {
    const t = convexTest(schema, modules);
    await seedExercise(t, {
      exerciseId: "rower",
      name: "Rower",
      category: "cardio",
    });
    await seedExercise(t, {
      exerciseId: "dead-bug",
      name: "Dead Bug",
      category: "core",
      primaryMuscles: ["abdominals"],
      secondaryMuscles: [],
    });
    await seedExercise(t, {
      userId: "custom-user",
      exerciseId: "private-cardio",
      name: "Private Cardio",
      category: "cardio",
    });

    const results = await t.query(api.exercises.search, {
      categories: ["cardio", "cardio", "core"],
      limit: 10,
    });

    expect(results.map((exercise) => exercise.id).sort()).toEqual([
      "dead-bug",
      "rower",
    ]);
    expect(results.find((exercise) => exercise.id === "rower")!.sets).toBe(
      "20–40 min",
    );
    expect(results.find((exercise) => exercise.id === "dead-bug")!.sets).toBe(
      "3 × 12 reps",
    );
  });

  test("search combines text and category filters", async () => {
    const t = convexTest(schema, modules);
    await seedExercise(t, {
      exerciseId: "incline-press",
      name: "Incline Press",
      category: "strength",
      primaryMuscles: ["chest"],
    });
    await seedExercise(t, {
      exerciseId: "machine-press",
      name: "Machine Press",
      category: "strength",
      primaryMuscles: ["chest"],
    });
    await seedExercise(t, {
      exerciseId: "shoulder-press",
      name: "Shoulder Press",
      category: "mobility",
      primaryMuscles: ["shoulders"],
    });

    const results = await t.query(api.exercises.search, {
      query: "press",
      categories: ["strength"],
      limit: 10,
    });

    expect(results.map((exercise) => exercise.id).sort()).toEqual([
      "incline-press",
      "machine-press",
    ]);
  });

  test("search clamps limits to a maximum of 50 and a minimum of 1", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 60; i += 1) {
      await seedExercise(t, {
        exerciseId: `exercise-${i}`,
        name: `Exercise ${i}`,
      });
    }

    await expect(
      t.query(api.exercises.search, { limit: 500 }),
    ).resolves.toHaveLength(50);
    await expect(
      t.query(api.exercises.search, { limit: -10 }),
    ).resolves.toHaveLength(1);
  });

  test("resolve deduplicates ids, ignores blanks and missing ids, and preserves requested keys", async () => {
    const t = convexTest(schema, modules);
    await seedExercise(t);
    await seedExercise(t, {
      exerciseId: "child-pose",
      name: "Child Pose",
      category: "mobility",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      equipment: undefined,
    });

    const result = await t.query(api.exercises.resolve, {
      ids: ["", "barbell-squat", "barbell-squat", "missing", "child-pose"],
    });

    expect(Object.keys(result).sort()).toEqual(["barbell-squat", "child-pose"]);
    expect(result["child-pose"]).toMatchObject({
      category: "mobility",
      muscle: "Full Body",
      description:
        "Child Pose exercise using bodyweight or available equipment.",
      sets: "2–3 × 60 s",
      color: "#10b981",
      equipment: null,
    });
  });
});
