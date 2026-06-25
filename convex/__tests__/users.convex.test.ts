import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("users Convex functions", () => {
  test("getCurrentUser returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.users.getCurrentUser, {})).resolves.toBeNull();
  });

  test("getPreferences returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.users.getPreferences, {})).resolves.toBeNull();
  });

  test("syncTimezone is a no-op when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.syncTimezone, { timeZone: "America/New_York" })
    ).resolves.toEqual({ timeZone: "America/New_York" });
  });

  test("syncTimezone normalizes invalid timezone when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.syncTimezone, { timeZone: "Not/A_Zone" })
    ).resolves.toEqual({ timeZone: "UTC" });
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

  test("getEffectiveGoals returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.users.getEffectiveGoals, {})).resolves.toBeNull();
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

  test("getEffectiveGoals includes BMR, TDEE, and source for a health profile", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "health-goals-user" }, async () => {
      await t.mutation(api.logs.calories.setProfile, {
        sex: "male",
        age: 30,
        weightKg: 80,
        heightCm: 175,
        activityLevel: "moderately_active",
        goal: "maintain",
      });

      const goals = await t.query(api.users.users.getEffectiveGoals, {});

      expect(goals!.health).toMatchObject({
        calories: 2711,
        protein: 203,
        carbs: 271,
        fat: 90,
        bmr: 1749,
        tdee: 2711,
        source: "healthProfile",
      });
      expect(goals!.effective).toMatchObject({
        calories: 2711,
        protein: 203,
        carbs: 271,
        fat: 90,
      });
    });
  });

  test("getEffectiveGoals estimates BMR and TDEE for onboarding-only users", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "onboarding-goals-user" }, async () => {
      await t.mutation(api.users.onboarding.save, {
        age: 25,
        heightCm: 170,
        goal: "build",
      });

      const goals = await t.query(api.users.users.getEffectiveGoals, {});

      expect(goals!.health).toMatchObject({
        calories: 2136,
        protein: 160,
        carbs: 214,
        fat: 71,
        bmr: 1676,
        tdee: 2076,
        source: "onboarding",
      });
      expect(goals!.effective.calories).toBe(2136);
    });
  });

  test("custom goals override effective goals without erasing health baseline", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "custom-overrides-user" }, async () => {
      await t.mutation(api.logs.calories.setProfile, {
        sex: "female",
        age: 28,
        weightKg: 68,
        heightCm: 166,
        activityLevel: "lightly_active",
        goal: "lose",
      });
      await t.mutation(api.users.users.setCustomGoals, {
        calories: 1900,
        protein: 150,
        carbs: 180,
        fat: 55,
      });

      const goals = await t.query(api.users.users.getEffectiveGoals, {});

      expect(goals!.custom).toEqual({
        calories: 1900,
        protein: 150,
        carbs: 180,
        fat: 55,
      });
      expect(goals!.effective).toEqual({
        calories: 1900,
        protein: 150,
        carbs: 180,
        fat: 55,
      });
      expect(goals!.health).toMatchObject({
        bmr: 1417,
        tdee: 1948,
        source: "healthProfile",
      });
      expect(goals!.health!.calories).not.toBe(goals!.effective.calories);
    });
  });
});
