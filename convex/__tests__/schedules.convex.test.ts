import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const routine = {
  Mon: "preset-1",
  Tue: null,
  Wed: "preset-2",
  Thu: null,
  Fri: "preset-1",
  Sat: null,
  Sun: null,
};

describe("schedules Convex functions", () => {
  test("get returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.schedules.get, {})).resolves.toBeNull();
  });

  test("set throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.schedules.set, {
        routine,
        presetOrder: ["preset-1", "preset-2"],
      })
    ).rejects.toThrow();
  });

  test("returns null when no schedule exists for user", async () => {
    const t = convexTest(schema, modules);

    const result = await t.run(async (ctx) =>
      ctx.db
        .query("schedules")
        .withIndex("by_userId", (q) => q.eq("userId", "no-schedule-user"))
        .unique()
    );

    expect(result).toBeNull();
  });

  test("inserts a new schedule with routine and presetOrder", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) =>
      ctx.db.insert("schedules", {
        userId: "schedule-create-user",
        routine,
        presetOrder: ["preset-1", "preset-2"],
        updatedAt: Date.now(),
      })
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored).not.toBeNull();
    expect(stored!.routine.Mon).toBe("preset-1");
    expect(stored!.routine.Tue).toBeNull();
    expect(stored!.presetOrder).toEqual(["preset-1", "preset-2"]);
  });

  test("upsert pattern: patches existing schedule instead of inserting a second", async () => {
    const t = convexTest(schema, modules);
    const userId = "schedule-upsert-user";

    const id = await t.run(async (ctx) =>
      ctx.db.insert("schedules", {
        userId,
        routine,
        presetOrder: ["preset-1"],
        updatedAt: Date.now(),
      })
    );

    // Simulate the set mutation's upsert logic
    await t.run(async (ctx) => {
      const existing = await ctx.db
        .query("schedules")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          routine: { ...routine, Mon: "preset-3" },
          presetOrder: ["preset-1", "preset-3"],
          updatedAt: Date.now(),
        });
      }
    });

    const allSchedules = await t.run(async (ctx) =>
      ctx.db
        .query("schedules")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    );

    // Should still be exactly one document
    expect(allSchedules).toHaveLength(1);
    expect(allSchedules[0].routine.Mon).toBe("preset-3");
    expect(allSchedules[0].presetOrder).toEqual(["preset-1", "preset-3"]);
  });

  test("schedule is isolated per user", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("schedules", {
        userId: "sched-user-a",
        routine: { ...routine, Mon: "preset-a" },
        presetOrder: ["preset-a"],
        updatedAt: now,
      });
      await ctx.db.insert("schedules", {
        userId: "sched-user-b",
        routine: { ...routine, Mon: "preset-b" },
        presetOrder: ["preset-b"],
        updatedAt: now,
      });
    });

    const userASchedule = await t.run(async (ctx) =>
      ctx.db
        .query("schedules")
        .withIndex("by_userId", (q) => q.eq("userId", "sched-user-a"))
        .unique()
    );

    expect(userASchedule!.routine.Mon).toBe("preset-a");
    expect(userASchedule!.presetOrder).toEqual(["preset-a"]);
  });

  test("schedule accepts empty presetOrder", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) =>
      ctx.db.insert("schedules", {
        userId: "schedule-empty-user",
        routine: { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null },
        presetOrder: [],
        updatedAt: Date.now(),
      })
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored!.presetOrder).toHaveLength(0);
    expect(stored!.routine.Mon).toBeNull();
  });
});
