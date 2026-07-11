import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const sampleItems = [{ id: "squat", name: "Squat" }];
const sampleExerciseData = {
  squat: { sets: [{ reps: 5, weight: 100, completed: true }] },
};

describe("activeWorkout Convex functions", () => {
  test("unauthenticated reads return empty state and writes throw", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.logs.activeWorkout.getActive, { slot: 1 }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.logs.activeWorkout.getAllActive, {}),
    ).resolves.toEqual([]);
    await expect(
      t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        items: [],
        exerciseData: {},
      }),
    ).rejects.toThrow("Unauthenticated");
  });

  test("createActive persists a workout and replaces an existing workout in the same slot", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "active-user" }, async () => {
      const first = await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        presetId: "preset-a",
        items: sampleItems,
        exerciseData: sampleExerciseData,
      });
      const second = await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        presetId: "preset-b",
        items: [{ id: "bench", name: "Bench" }],
        exerciseData: { bench: { sets: [] } },
      });

      expect(first.id).not.toBe(second.id);
      const active = await t.query(api.logs.activeWorkout.getActive, {
        slot: 1,
      });
      expect(active).toMatchObject({
        _id: second.id,
        slot: 1,
        presetId: "preset-b",
        elapsedSeconds: 0,
      });
      expect(active!.completedAt).toBeUndefined();
    });
  });

  test("updateActive changes the current workout and rejects missing slots", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "active-user" }, async () => {
      await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        items: sampleItems,
        exerciseData: sampleExerciseData,
      });

      await expect(
        t.mutation(api.logs.activeWorkout.updateActive, {
          slot: 1,
          items: [{ id: "deadlift", name: "Deadlift" }],
          exerciseData: { deadlift: { sets: [{ reps: 3, weight: 140 }] } },
          elapsedSeconds: 123,
        }),
      ).resolves.toEqual({ ok: true });
      await expect(
        t.mutation(api.logs.activeWorkout.updateActive, {
          slot: 2,
          items: [],
          exerciseData: {},
          elapsedSeconds: 0,
        }),
      ).rejects.toThrow("No active workout found");

      const active = await t.query(api.logs.activeWorkout.getActive, {
        slot: 1,
      });
      expect(active).toMatchObject({
        items: [{ id: "deadlift", name: "Deadlift" }],
        elapsedSeconds: 123,
      });
    });
  });

  test("abortActive marks a workout complete so it no longer appears in active queries", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "active-user" }, async () => {
      await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        items: sampleItems,
        exerciseData: sampleExerciseData,
      });
      await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 2,
        items: [{ id: "run", name: "Run" }],
        exerciseData: {},
      });

      await expect(
        t.mutation(api.logs.activeWorkout.abortActive, { slot: 1 }),
      ).resolves.toEqual({ ok: true });

      await expect(
        t.query(api.logs.activeWorkout.getActive, { slot: 1 }),
      ).resolves.toBe(null);
      const allActive = await t.query(api.logs.activeWorkout.getAllActive, {});
      expect(allActive.map((workout) => workout.slot)).toEqual([2]);
    });
  });

  test("finishActive completes the active workout and writes a workout log", async () => {
    const t = convexTest(schema, modules);
    const today = new Date().toISOString().split("T")[0];

    await t.withIdentity({ name: "active-user" }, async () => {
      await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        items: sampleItems,
        exerciseData: sampleExerciseData,
      });

      await expect(
        t.mutation(api.logs.activeWorkout.finishActive, {
          slot: 1,
          exercises: [
            {
              id: "squat",
              name: "Squat",
              sets: [{ type: "normal", reps: 5, weight: 100, completed: true }],
            },
          ],
          durationSeconds: 1800,
        }),
      ).resolves.toEqual({ ok: true });

      await expect(
        t.query(api.logs.activeWorkout.getActive, { slot: 1 }),
      ).resolves.toBe(null);
      const logs = await t.query(api.logs.workouts.getLog, { date: today });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        date: today,
        durationSeconds: 1800,
      });
      expect(logs[0]!.exercises).toHaveLength(1);
      await expect(
        t.mutation(api.logs.activeWorkout.finishActive, {
          slot: 1,
          exercises: [],
          durationSeconds: 0,
        }),
      ).resolves.toEqual({ ok: true });
      expect(
        await t.query(api.logs.workouts.getLog, { date: today }),
      ).toHaveLength(1);
    });
  });

  test("finishActive preserves an existing daily workout as a separate session", async () => {
    const t = convexTest(schema, modules);
    const today = new Date().toISOString().split("T")[0];

    await t.withIdentity({ name: "active-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: today,
        exercises: [{ id: "bench", name: "Bench", sets: [] }],
        durationSeconds: 600,
      });
      await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        items: sampleItems,
        exerciseData: sampleExerciseData,
      });
      await t.mutation(api.logs.activeWorkout.finishActive, {
        slot: 1,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
        durationSeconds: 900,
      });

      const logs = await t.query(api.logs.workouts.getLog, { date: today });
      expect(logs).toHaveLength(2);
      expect(logs.find((log) => log.slot === 1)).toMatchObject({
        durationSeconds: 900,
        exercises: [{ id: "squat" }],
      });
      expect(logs.find((log) => log.slot === undefined)).toMatchObject({
        durationSeconds: 600,
        exercises: [{ id: "bench" }],
      });
    });
  });

  test("finishActive writes cardio details to today's workout log", async () => {
    const t = convexTest(schema, modules);
    const today = new Date().toISOString().split("T")[0];

    await t.withIdentity({ name: "active-cardio-user" }, async () => {
      await t.mutation(api.logs.activeWorkout.createActive, {
        slot: 1,
        items: [{ id: "run", name: "Run" }],
        exerciseData: {},
      });

      await t.mutation(api.logs.activeWorkout.finishActive, {
        slot: 1,
        exercises: [
          {
            id: "run",
            name: "Run",
            category: "cardio",
            sets: [],
            cardio: {
              distanceMeters: 3218.69,
              distanceUnit: "mi",
              durationSeconds: 1500,
              paceSecondsPerKm: 466,
              avgHeartRateBpm: 150,
              heartRateZones: {
                zone2Seconds: 900,
                zone3Seconds: 600,
              },
              source: {
                provider: "garmin",
                externalId: "activity-456",
              },
            },
          },
        ],
        durationSeconds: 1500,
      });

      const logs = await t.query(api.logs.workouts.getLog, { date: today });
      expect(logs[0]!.exercises[0]).toMatchObject({
        id: "run",
        category: "cardio",
        cardio: {
          distanceUnit: "mi",
          durationSeconds: 1500,
          avgHeartRateBpm: 150,
          source: {
            provider: "garmin",
            externalId: "activity-456",
          },
        },
      });
    });
  });
});
