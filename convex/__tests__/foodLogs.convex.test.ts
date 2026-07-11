import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("foodLogs Convex functions", () => {
  test("getDay returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.foodLogs.getDay, { date: "2024-01-15" }),
    ).resolves.toEqual([]);
  });

  test("setDay throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.foodLogs.setDay, { date: "2024-01-15", entries: [] }),
    ).rejects.toThrow();
  });

  test("getRecent returns bounded authenticated logs in descending date order", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "food-recent-user" }, async () => {
      await t.mutation(api.logs.foodLogs.setDay, {
        date: "2024-01-14",
        entries: [
          {
            id: "a",
            name: "Day 1",
            calories: 100,
            protein: 1,
            carbs: 2,
            fat: 3,
            meal: "breakfast",
            loggedAt: "2024-01-14T08:00:00.000Z",
          },
        ],
      });
      await t.mutation(api.logs.foodLogs.setDay, {
        date: "2024-01-15",
        entries: [
          {
            id: "b",
            name: "Day 2",
            calories: 200,
            protein: 2,
            carbs: 3,
            fat: 4,
            meal: "breakfast",
            loggedAt: "2024-01-15T08:00:00.000Z",
          },
        ],
      });
      await t.mutation(api.logs.foodLogs.setDay, {
        date: "2024-01-16",
        entries: [
          {
            id: "c",
            name: "Day 3",
            calories: 300,
            protein: 3,
            carbs: 4,
            fat: 5,
            meal: "breakfast",
            loggedAt: "2024-01-16T08:00:00.000Z",
          },
        ],
      });

      const recent = await t.query(api.logs.foodLogs.getRecent, {
        beforeOrOn: "2024-01-16",
        limit: 2,
      });

      expect(recent.map((day) => day.date)).toEqual([
        "2024-01-16",
        "2024-01-15",
      ]);
    });
  });

  test("inserts a new food log document", async () => {
    const t = convexTest(schema, modules);
    const userId = "food-test-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("foodLogs", {
        userId,
        date: "2024-01-15",
        entries: [
          { name: "Apple", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
        ],
        updatedAt: Date.now(),
      });
    });

    const stored = await t.run(async (ctx) => {
      return ctx.db
        .query("foodLogs")
        .filter((q) => q.eq(q.field("userId"), userId))
        .unique();
    });

    expect(stored).not.toBeNull();
    expect(stored!.entries).toHaveLength(1);
    expect(stored!.entries[0].name).toBe("Apple");
    expect(stored!.date).toBe("2024-01-15");
  });

  test("updates existing food log document", async () => {
    const t = convexTest(schema, modules);
    const userId = "food-update-user";

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("foodLogs", {
        userId,
        date: "2024-01-16",
        entries: [{ name: "Banana", calories: 89 }],
        updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        entries: [
          { name: "Banana", calories: 89 },
          { name: "Oatmeal", calories: 150 },
        ],
        updatedAt: Date.now(),
      });
    });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.entries).toHaveLength(2);
  });

  test("multiple dates stored independently", async () => {
    const t = convexTest(schema, modules);
    const userId = "food-multi-day-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("foodLogs", {
        userId,
        date: "2024-01-15",
        entries: [{ name: "Day 1" }],
        updatedAt: Date.now(),
      });
      await ctx.db.insert("foodLogs", {
        userId,
        date: "2024-01-16",
        entries: [{ name: "Day 2" }],
        updatedAt: Date.now(),
      });
    });

    const all = await t.run(async (ctx) => {
      return ctx.db
        .query("foodLogs")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
    });

    expect(all).toHaveLength(2);
    expect(all.map((d) => d.date).sort()).toEqual(["2024-01-15", "2024-01-16"]);
  });

  test("setDay keeps the latest copy of a duplicate client entry id", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "food-dedupe-user" }, async () => {
      await t.mutation(api.logs.foodLogs.setDay, {
        date: "2024-02-01",
        entries: [
          {
            id: "same-entry",
            name: "First copy",
            calories: 100,
            protein: 10,
            carbs: 10,
            fat: 2,
            meal: "lunch",
            loggedAt: "2024-02-01T12:00:00.000Z",
          },
          {
            id: "same-entry",
            name: "Corrected copy",
            calories: 220,
            protein: -5,
            carbs: 20,
            fat: 4,
            meal: "lunch",
            loggedAt: "2024-02-01T12:01:00.000Z",
          },
        ],
      });

      const entries = await t.query(api.logs.foodLogs.getDay, {
        date: "2024-02-01",
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: "same-entry",
        name: "Corrected copy",
        calories: 220,
        protein: 0,
      });
    });
  });

  test("addEntry is retry-safe for a repeated client entry id", async () => {
    const t = convexTest(schema, modules);
    const entry = {
      id: "offline-retry-entry",
      name: "Yogurt",
      calories: 170,
      protein: 15,
      carbs: 8,
      fat: 4,
      meal: "breakfast",
      loggedAt: "2024-02-02T08:00:00.000Z",
    };

    await t.withIdentity({ name: "food-retry-user" }, async () => {
      await t.mutation(api.logs.foodLogs.addEntry, {
        date: "2024-02-02",
        entry,
      });
      await t.mutation(api.logs.foodLogs.addEntry, {
        date: "2024-02-02",
        entry: { ...entry, calories: 180 },
      });

      const entries = await t.query(api.logs.foodLogs.getDay, {
        date: "2024-02-02",
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: entry.id,
        calories: 180,
      });
    });
  });
});
