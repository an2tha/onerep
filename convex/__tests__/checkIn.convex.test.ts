import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("checkIn Convex functions", () => {
  test("getDailyCheckIn throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.checkIn.getDailyCheckIn, {})).rejects.toThrow();
  });

  test("setDailyCheckIn throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.checkIn.setDailyCheckIn, {})).rejects.toThrow();
  });

  test("inserts a daily check-in for a user", async () => {
    const t = convexTest(schema, modules);
    const userId = "checkin-test-user";

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("dailyCheckIns", { userId, updatedAt: Date.now() });
    });

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored).not.toBeNull();
    expect(stored!.userId).toBe(userId);
    expect(stored!.updatedAt).toBeGreaterThan(0);
  });

  test("updates existing daily check-in (upsert pattern)", async () => {
    const t = convexTest(schema, modules);
    const initialTime = Date.now();

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("dailyCheckIns", { userId: "checkin-update-user", updatedAt: initialTime });
    });

    const newTime = initialTime + 1000;
    await t.run(async (ctx) => { await ctx.db.patch(id, { updatedAt: newTime }); });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.updatedAt).toBe(newTime);
    expect(updated!.updatedAt).toBeGreaterThan(initialTime);
  });

  test("only one check-in per user via index", async () => {
    const t = convexTest(schema, modules);
    const userId = "checkin-unique-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("dailyCheckIns", { userId, updatedAt: Date.now() });
    });

    const all = await t.run(async (ctx) => {
      return ctx.db
        .query("dailyCheckIns")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
    });

    expect(all).toHaveLength(1);
  });
});
