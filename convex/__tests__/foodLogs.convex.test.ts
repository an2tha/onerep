import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("foodLogs Convex functions", () => {
  test("getDay throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.foodLogs.getDay, { date: "2024-01-15" })
    ).rejects.toThrow();
  });

  test("setDay throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.foodLogs.setDay, { date: "2024-01-15", entries: [] })
    ).rejects.toThrow();
  });

  test("inserts a new food log document", async () => {
    const t = convexTest(schema, modules);
    const userId = "food-test-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("foodLogs", {
        userId, date: "2024-01-15",
        entries: [{ name: "Apple", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 }],
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
        userId, date: "2024-01-16",
        entries: [{ name: "Banana", calories: 89 }],
        updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        entries: [{ name: "Banana", calories: 89 }, { name: "Oatmeal", calories: 150 }],
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
        userId, date: "2024-01-15", entries: [{ name: "Day 1" }], updatedAt: Date.now(),
      });
      await ctx.db.insert("foodLogs", {
        userId, date: "2024-01-16", entries: [{ name: "Day 2" }], updatedAt: Date.now(),
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
});
