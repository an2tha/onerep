import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { defaultProgrammeSettings } from "../../packages/models/src/guided-programme";

const modules = import.meta.glob("../**/*.ts");

test("preset swaps clear loads and leave active workouts and historical logs intact", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ tokenIdentifier: "test|swap" });
  await t.run((ctx) =>
    ctx.db.insert("exercises", {
      userId: "__global__",
      exerciseId: "lunge",
      name: "Lunge",
      category: "strength",
      level: "beginner",
      primaryMuscles: ["quads"],
      secondaryMuscles: [],
      instructions: [],
    }),
  );
  const preset = await user.mutation(api.logs.presets.create, {
    name: "Leg day",
    items: [{ kind: "solo", exerciseId: "squat" }],
    exerciseData: {
      squat: {
        sets: [{ id: "set", weight: "100", reps: "5" }],
        barWeight: "20",
      },
    },
  });
  await user.mutation(api.logs.workouts.completion, {
    date: "2026-10-07",
    exercises: [
      {
        id: "squat",
        name: "Squat",
        sets: [{ type: "normal", reps: 5, weight: 100, completed: true }],
      },
    ],
    durationSeconds: 60,
  });
  await user.mutation(api.logs.activeWorkout.createActive, {
    slot: 1,
    presetId: preset.id,
    items: [{ kind: "solo", exerciseId: "squat" }],
    exerciseData: {
      squat: {
        sets: [{ id: "done", reps: "5", weight: "100", completed: true }],
      },
    },
  });
  const beforeActive = await t.run((ctx) =>
    ctx.db.query("activeWorkouts").take(5),
  );
  const beforeLogs = await t.run((ctx) => ctx.db.query("workoutLogs").take(5));
  const stored = await t.run((ctx) => ctx.db.get(preset.id));
  await user.mutation(api.exerciseSwaps.swapPreset, {
    presetId: preset.id,
    oldExerciseId: "squat",
    newExerciseId: "lunge",
    sets: 3,
    reps: "8-12",
    restSeconds: 90,
    expectedUpdatedAt: stored!.updatedAt,
  });
  const after = await t.run((ctx) => ctx.db.get(preset.id));
  expect(after!.items).toEqual([{ kind: "solo", exerciseId: "lunge" }]);
  expect(after!.exerciseData.squat).toBeUndefined();
  expect(after!.exerciseData.lunge.sets).toHaveLength(3);
  expect(after!.exerciseData.lunge.sets[0]).toMatchObject({
    weight: "",
    reps: "8-12",
  });
  expect(after!.exerciseData.lunge.barWeight).toBe("");
  expect(await t.run((ctx) => ctx.db.query("workoutLogs").take(5))).toEqual(
    beforeLogs,
  );
  expect(await t.run((ctx) => ctx.db.query("activeWorkouts").take(5))).toEqual(
    beforeActive,
  );
});

test("preset swaps reject another user's preset and stale previews", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: "test|owner" });
  const other = t.withIdentity({ tokenIdentifier: "test|other" });
  const preset = await owner.mutation(api.logs.presets.create, {
    name: "Day",
    items: [{ kind: "solo", exerciseId: "squat" }],
    exerciseData: {},
  });
  const row = await t.run((ctx) => ctx.db.get(preset.id));
  const args = {
    presetId: preset.id,
    oldExerciseId: "squat",
    newExerciseId: "lunge",
    sets: 3,
    reps: "8",
    restSeconds: 90,
    expectedUpdatedAt: row!.updatedAt,
  };
  await expect(
    other.mutation(api.exerciseSwaps.swapPreset, args),
  ).rejects.toThrow("not found");
  await expect(
    owner.mutation(api.exerciseSwaps.swapPreset, {
      ...args,
      expectedUpdatedAt: 0,
    }),
  ).rejects.toThrow("changed");
  await expect(
    owner.mutation(api.exerciseSwaps.swapPreset, { ...args, sets: -1 }),
  ).rejects.toThrow("Invalid");
  await expect(
    owner.mutation(api.exerciseSwaps.swapPreset, {
      ...args,
      newExerciseId: "invented-exercise",
    }),
  ).rejects.toThrow("library");
  const privateId = await t.run((ctx) =>
    ctx.db.insert("customExercises", {
      userId: "someone-else",
      name: "Private",
      category: "strength",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await expect(
    owner.mutation(api.exerciseSwaps.swapPreset, {
      ...args,
      newExerciseId: `custom:${privateId}`,
    }),
  ).rejects.toThrow("library");
});

test("preset editor and scoped swaps keep linked programme sessions in sync without flattening supersets", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ tokenIdentifier: "test|linked" });
  await t.run(async (ctx) => {
    for (const exerciseId of ["squat", "lunge", "row"])
      await ctx.db.insert("exercises", {
        userId: "__global__",
        exerciseId,
        name: exerciseId,
        category: "strength",
        level: "beginner",
        primaryMuscles: [],
        secondaryMuscles: [],
        instructions: [],
      });
  });
  const id = await user.mutation(api.guidedProgrammes.saveDraft, {
    track: "training",
    settings: { ...defaultProgrammeSettings(), daysPerWeek: 1 },
    plan: {
      summary: "Training",
      training: {
        mesocycles: [
          {
            id: "block",
            name: "Foundation",
            startWeek: 1,
            endWeek: 6,
            objective: "Consistency",
            progression: "Add reps",
            deload: false,
          },
        ],
        sessions: [
          {
            id: "day",
            name: "Day",
            dayOfWeek: 1,
            blockId: "block",
            exercises: [
              {
                id: "lift",
                exerciseId: "squat",
                name: "Squat",
                sets: 3,
                reps: "8",
                restSeconds: 90,
                notes: "",
                alternatives: [],
              },
            ],
          },
        ],
      },
    },
  });
  await user.mutation(api.guidedProgrammes.activate, { id });
  let preset = (await user.query(api.logs.presets.list, {}))[0]!;
  await user.mutation(api.exerciseSwaps.swapPreset, {
    presetId: preset._id,
    oldExerciseId: "squat",
    newExerciseId: "lunge",
    sets: 2,
    reps: "10",
    restSeconds: 120,
    expectedUpdatedAt: preset.updatedAt,
  });
  expect(
    (await user.query(api.guidedProgrammes.get, { id })).plan!.training!
      .sessions[0]!.exercises[0],
  ).toMatchObject({ exerciseId: "lunge", sets: 2, reps: "10" });
  preset = (await user.query(api.logs.presets.list, {}))[0]!;
  const body = {
    id: preset._id,
    expectedUpdatedAt: preset.updatedAt,
    name: "Updated day",
    items: [{ kind: "solo", exerciseId: "row" }],
    exerciseData: {
      row: {
        sets: [
          {
            id: "one",
            type: "working",
            reps: "12",
            weight: "",
            restSeconds: 60,
          },
        ],
      },
    },
  };
  await user.mutation(api.logs.presets.update, body);
  expect(
    (await user.query(api.guidedProgrammes.get, { id })).plan!.training!
      .sessions[0],
  ).toMatchObject({
    name: "Updated day",
    exercises: [
      expect.objectContaining({ exerciseId: "row", sets: 1, reps: "12" }),
    ],
  });
  await expect(user.mutation(api.logs.presets.update, body)).rejects.toThrow(
    "changed",
  );
  preset = (await user.query(api.logs.presets.list, {}))[0]!;
  await expect(
    user.mutation(api.logs.presets.update, {
      ...body,
      expectedUpdatedAt: preset.updatedAt,
      items: [
        {
          kind: "superset",
          id: "group",
          color: "blue",
          exerciseIds: ["row", "lunge"],
        },
      ],
    }),
  ).rejects.toThrow("Ungroup");
});
