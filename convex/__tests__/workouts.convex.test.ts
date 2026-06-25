import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("workoutLogs Convex functions", () => {
  test("getLog returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.workouts.getLog, { date: "2024-01-15" })
    ).resolves.toBeNull();
  });

  test("getHistory returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.workouts.getHistory, {})
    ).resolves.toEqual([]);
  });

  test("completion throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.workouts.completion, {
        date: "2024-01-15", exercises: [], durationSeconds: 3600,
      })
    ).rejects.toThrow();
  });

  test("remove throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.workouts.remove, { id: "jd7f4z1y2s3d4t5v6w7x8" as any })
    ).rejects.toThrow();
  });

  test("inserts a workout log with correct data", async () => {
    const t = convexTest(schema, modules);
    const exercises = [
      { name: "Squat", sets: [{ reps: 5, weight: 100 }] },
      { name: "Bench Press", sets: [{ reps: 5, weight: 80 }] },
    ];

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("workoutLogs", {
        userId: "workout-test-user",
        date: "2024-01-15",
        exercises,
        durationSeconds: 3600,
        completedAt: Date.now(),
      });
    });

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored).not.toBeNull();
    expect(stored!.exercises).toHaveLength(2);
    expect(stored!.durationSeconds).toBe(3600);
    expect(stored!.date).toBe("2024-01-15");
  });

  test("updates existing workout log (upsert pattern)", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("workoutLogs", {
        userId: "workout-upsert-user", date: "2024-01-20",
        exercises: [{ name: "Old exercise" }],
        durationSeconds: 1800, completedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        exercises: [{ name: "Updated exercise" }],
        durationSeconds: 3600, completedAt: Date.now(),
      });
    });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.exercises[0].name).toBe("Updated exercise");
    expect(updated!.durationSeconds).toBe(3600);
  });

  test("deletes a workout log", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("workoutLogs", {
        userId: "workout-delete-user", date: "2024-02-01",
        exercises: [], durationSeconds: 0, completedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => ctx.db.delete(id));

    const deleted = await t.run(async (ctx) => ctx.db.get(id));
    expect(deleted).toBeNull();
  });

  test("removeBySlot throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.workouts.removeBySlot, { date: "2024-01-15", slot: 1 })
    ).rejects.toThrow();
  });
});
