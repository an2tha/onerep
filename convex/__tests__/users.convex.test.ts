import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("users Convex functions", () => {
  test("getCurrentUser throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.users.getCurrentUser, {})).rejects.toThrow();
  });

  test("getPreferences throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.users.getPreferences, {})).rejects.toThrow();
  });

  test("syncTimezone throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.syncTimezone, { timeZone: "America/New_York" })
    ).rejects.toThrow();
  });

  test("setWeightUnit throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.setWeightUnit, { unit: "kg" })
    ).rejects.toThrow();
  });

  test("setWaterGoal throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.setWaterGoal, { goalMl: 2000 })
    ).rejects.toThrow();
  });

  test("setCustomGoals throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.setCustomGoals, { calories: 2000 })
    ).rejects.toThrow();
  });

  test("getEffectiveGoals throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.users.getEffectiveGoals, {})).rejects.toThrow();
  });

  test("stores user preferences correctly", async () => {
    const t = convexTest(schema, modules);
    const userId = "user-prefs-test";

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("userPreferences", {
        userId,
        lastActiveTimezone: "America/New_York",
        waterGoalMl: 2500,
        weightUnit: "kg",
        updatedAt: Date.now(),
      });
    });

    const prefs = await t.run(async (ctx) => ctx.db.get(id));
    expect(prefs!.lastActiveTimezone).toBe("America/New_York");
    expect(prefs!.waterGoalMl).toBe(2500);
    expect(prefs!.weightUnit).toBe("kg");
  });

  test("stores custom goals correctly", async () => {
    const t = convexTest(schema, modules);
    const customGoals = { calories: 1800, protein: 150, carbs: 200, fat: 55 };

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("userPreferences", {
        userId: "user-custom-goals-test",
        lastActiveTimezone: "UTC",
        customGoals,
        updatedAt: Date.now(),
      });
    });

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored!.customGoals).toEqual(customGoals);
  });

  test("stores body reminder settings", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("userPreferences", {
        userId: "user-reminder-test",
        lastActiveTimezone: "UTC",
        bodyReminder: { enabled: true, hour: 8, minute: 30 },
        updatedAt: Date.now(),
      });
    });

    const prefs = await t.run(async (ctx) => ctx.db.get(id));
    expect(prefs!.bodyReminder).toEqual({ enabled: true, hour: 8, minute: 30 });
  });

  test("stores dashboard settings", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("userPreferences", {
        userId: "user-dashboard-test",
        lastActiveTimezone: "UTC",
        dashboardSettings: { workoutFocus: "strength" },
        updatedAt: Date.now(),
      });
    });

    const prefs = await t.run(async (ctx) => ctx.db.get(id));
    expect(prefs!.dashboardSettings!.workoutFocus).toBe("strength");
  });

  test("stores health profile for calorie calculation", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("healthProfiles", {
        userId: "user-health-profile-test",
        sex: "male",
        age: 30,
        weightKg: 80,
        heightCm: 175,
        activityLevel: "moderately_active",
        goal: "maintain",
        updatedAt: Date.now(),
      });
    });

    const profile = await t.run(async (ctx) => ctx.db.get(id));
    expect(profile!.sex).toBe("male");
    expect(profile!.weightKg).toBe(80);
    expect(profile!.goal).toBe("maintain");
  });
});
