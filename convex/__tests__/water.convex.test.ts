import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("waterLogs Convex functions", () => {
  test("getDay throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.water.getDay, { date: "2024-01-15" })
    ).rejects.toThrow();
  });

  test("setDay throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.water.setDay, { date: "2024-01-15", entries: [] })
    ).rejects.toThrow();
  });

  test("stores water log entries for a date", async () => {
    const t = convexTest(schema, modules);
    const userId = "water-test-user";
    const entries = [
      { id: "1", ml: 250, loggedAt: "2024-01-15T08:00:00Z" },
      { id: "2", ml: 500, loggedAt: "2024-01-15T12:00:00Z" },
    ];

    await t.run(async (ctx) => {
      await ctx.db.insert("waterLogs", {
        userId, date: "2024-01-15", entries, updatedAt: Date.now(),
      });
    });

    const stored = await t.run(async (ctx) => {
      return ctx.db
        .query("waterLogs")
        .filter((q) => q.eq(q.field("userId"), userId))
        .unique();
    });

    expect(stored).not.toBeNull();
    expect(stored!.entries).toHaveLength(2);
    expect(stored!.entries[0].ml).toBe(250);
    expect(stored!.entries[1].ml).toBe(500);
  });

  test("updates water log entries for same date", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("waterLogs", {
        userId: "water-update-user", date: "2024-01-16",
        entries: [{ id: "1", ml: 250 }], updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        entries: [{ id: "1", ml: 250 }, { id: "2", ml: 500 }, { id: "3", ml: 300 }],
        updatedAt: Date.now(),
      });
    });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.entries).toHaveLength(3);
    const totalMl = updated!.entries.reduce((sum: number, e: any) => sum + e.ml, 0);
    expect(totalMl).toBe(1050);
  });

  test("daily logs are independent per date", async () => {
    const t = convexTest(schema, modules);
    const userId = "water-multi-day-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("waterLogs", {
        userId, date: "2024-01-15", entries: [{ id: "a", ml: 2000 }], updatedAt: Date.now(),
      });
      await ctx.db.insert("waterLogs", {
        userId, date: "2024-01-16", entries: [{ id: "b", ml: 1500 }], updatedAt: Date.now(),
      });
    });

    const logs = await t.run(async (ctx) => {
      return ctx.db
        .query("waterLogs")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
    });

    expect(logs).toHaveLength(2);
    const jan15 = logs.find((l) => l.date === "2024-01-15");
    const jan16 = logs.find((l) => l.date === "2024-01-16");
    expect(jan15!.entries[0].ml).toBe(2000);
    expect(jan16!.entries[0].ml).toBe(1500);
  });
});
