import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

async function seedGlobalExercise(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
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
      secondaryMuscles: ["glutes"],
      instructions: ["Brace, descend, and stand tall."],
      ...overrides,
    }),
  );
}

describe("custom exercises", () => {
  test("unauthenticated reads are empty and writes throw", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.logs.customExercises.list, {})).resolves.toEqual(
      [],
    );
    await expect(
      t.mutation(api.logs.customExercises.save, {
        name: "Reverse Hyper",
        category: "strength",
      }),
    ).rejects.toThrow("Unauthenticated");
  });

  test("save returns the full client shape with derived fields", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "lifter" }, async () => {
      const saved = await t.mutation(api.logs.customExercises.save, {
        name: "Reverse Hyper",
        category: "core",
        equipment: "bench",
        primaryMuscles: ["glutes", "glutes", " hamstrings "],
        instructions: ["Hinge at the hip.", "  ", "Squeeze at the top."],
      });

      expect(saved.id.startsWith("custom:")).toBe(true);
      expect(saved).toMatchObject({
        name: "Reverse Hyper",
        category: "core",
        muscle: "Glutes · Hamstrings",
        description: "Hinge at the hip.",
        sets: "3 × 12 reps",
        color: "#3b82f6",
        equipment: "bench",
        custom: true,
      });
      // Blank and duplicate entries are dropped rather than stored.
      expect(saved.primaryMuscles).toEqual(["glutes", "hamstrings"]);
      expect(saved.instructions).toEqual([
        "Hinge at the hip.",
        "Squeeze at the top.",
      ]);
    });
  });

  test("save rejects a blank name and a duplicate name", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "lifter" }, async () => {
      await expect(
        t.mutation(api.logs.customExercises.save, {
          name: "   ",
          category: "strength",
        }),
      ).rejects.toThrow("Exercise name is required");

      await t.mutation(api.logs.customExercises.save, {
        name: "Reverse Hyper",
        category: "strength",
      });
      await expect(
        t.mutation(api.logs.customExercises.save, {
          name: "reverse hyper",
          category: "strength",
        }),
      ).rejects.toThrow("already have an exercise named");
    });
  });

  test("search lists a user's own exercises ahead of the global catalog", async () => {
    const t = convexTest(schema, modules);
    await seedGlobalExercise(t);

    await t.withIdentity({ name: "lifter" }, async () => {
      await t.mutation(api.logs.customExercises.save, {
        name: "Barbell Squat To Box",
        category: "strength",
      });

      const results = await t.query(api.exercises.search, { query: "squat" });

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("Barbell Squat To Box");
      expect(results[0].custom).toBe(true);
      expect(results[1].id).toBe("barbell-squat");
      expect(results[1].custom).toBeUndefined();
    });
  });

  test("search honours category filters for custom exercises", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "lifter" }, async () => {
      await t.mutation(api.logs.customExercises.save, {
        name: "Sled Push",
        category: "cardio",
      });
      await t.mutation(api.logs.customExercises.save, {
        name: "Copenhagen Plank",
        category: "core",
      });

      const cardio = await t.query(api.exercises.search, {
        categories: ["cardio"],
      });
      expect(cardio.map((exercise) => exercise.name)).toEqual(["Sled Push"]);
    });
  });

  test("another user's custom exercises are never visible", async () => {
    const t = convexTest(schema, modules);

    let otherId = "";
    await t.withIdentity({ name: "other-lifter" }, async () => {
      const saved = await t.mutation(api.logs.customExercises.save, {
        name: "Secret Movement",
        category: "strength",
      });
      otherId = saved.id;
    });

    await t.withIdentity({ name: "lifter" }, async () => {
      await expect(
        t.query(api.exercises.search, { query: "secret" }),
      ).resolves.toEqual([]);
      await expect(
        t.query(api.exercises.resolve, { ids: [otherId] }),
      ).resolves.toEqual({});
    });
  });

  test("resolve returns custom and global exercises together", async () => {
    const t = convexTest(schema, modules);
    await seedGlobalExercise(t);

    await t.withIdentity({ name: "lifter" }, async () => {
      const saved = await t.mutation(api.logs.customExercises.save, {
        name: "Reverse Hyper",
        category: "strength",
      });

      const result = await t.query(api.exercises.resolve, {
        ids: [saved.id, "barbell-squat", "custom:not-a-real-id", "missing"],
      });

      expect(Object.keys(result).sort()).toEqual(
        [saved.id, "barbell-squat"].sort(),
      );
      expect(result[saved.id].custom).toBe(true);
    });
  });

  test("remove deletes the exercise and denies other users", async () => {
    const t = convexTest(schema, modules);

    let docId = "";
    await t.withIdentity({ name: "lifter" }, async () => {
      const saved = await t.mutation(api.logs.customExercises.save, {
        name: "Reverse Hyper",
        category: "strength",
      });
      docId = saved.id.slice("custom:".length);
    });

    await t.withIdentity({ name: "other-lifter" }, async () => {
      await expect(
        t.mutation(api.logs.customExercises.remove, { id: docId as never }),
      ).rejects.toThrow("not found or access denied");
    });

    await t.withIdentity({ name: "lifter" }, async () => {
      await t.mutation(api.logs.customExercises.remove, { id: docId as never });
      await expect(t.query(api.logs.customExercises.list, {})).resolves.toEqual(
        [],
      );
    });
  });
});
