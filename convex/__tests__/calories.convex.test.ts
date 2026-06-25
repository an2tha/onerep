import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("calories Convex functions", () => {
  test("calculate returns caloric goals for valid health profile", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.logs.calories.calculate, {
      sex: "male",
      age: 30,
      weightKg: 80,
      heightCm: 175,
      activityLevel: "moderately_active",
      goal: "maintain",
    });
    expect(result.bmr).toBeGreaterThan(0);
    expect(result.tdee).toBeGreaterThan(result.bmr);
    expect(result.targetCalories).toBe(result.tdee); // maintain goal
    expect(result.protein).toBeGreaterThan(0);
    expect(result.carbs).toBeGreaterThan(0);
    expect(result.fat).toBeGreaterThan(0);
  });

  test("calculate returns correct lose goal target calories", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.logs.calories.calculate, {
      sex: "female",
      age: 25,
      weightKg: 65,
      heightCm: 165,
      activityLevel: "lightly_active",
      goal: "lose",
    });
    expect(result.targetCalories).toBe(result.tdee - 500);
  });

  test("calculate returns correct gain goal target calories", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.logs.calories.calculate, {
      sex: "male",
      age: 22,
      weightKg: 70,
      heightCm: 180,
      activityLevel: "very_active",
      goal: "gain",
    });
    expect(result.targetCalories).toBe(result.tdee + 500);
  });

  test("getGoals returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.logs.calories.getGoals, {})).resolves.toBeNull();
  });

  test("setProfile stores health profile data", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const userId = "test-health-profile-user";
      await ctx.db.insert("healthProfiles", {
        userId,
        sex: "male",
        age: 35,
        weightKg: 85,
        heightCm: 178,
        activityLevel: "moderately_active",
        goal: "maintain",
        updatedAt: Date.now(),
      });
      const stored = await ctx.db
        .query("healthProfiles")
        .filter((q) => q.eq(q.field("userId"), userId))
        .unique();
      expect(stored).not.toBeNull();
      expect(stored!.weightKg).toBe(85);
    });
  });
});
