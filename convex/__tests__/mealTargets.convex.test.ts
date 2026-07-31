import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const sumCalories = (targets: { calories: number }[]) =>
  targets.reduce((total, target) => total + target.calories, 0);

describe("per-meal calorie targets", () => {
  test("targets are off by default but still resolved for the editor", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "meal-targets-default" }, async () => {
      const goals = await t.query(api.users.users.getEffectiveGoals, {});
      expect(goals?.mealTargetsEnabled).toBe(false);
      expect(goals?.mealTargets.length).toBeGreaterThan(0);
      expect(sumCalories(goals!.mealTargets)).toBe(goals!.effective.calories);
    });
  });

  test("the split always adds up to the day's effective calories", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "meal-targets-sum" }, async () => {
      await t.mutation(api.users.users.setCustomGoals, { calories: 2317 });
      await t.mutation(api.users.users.setMealCalorieTargets, {
        enabled: true,
        shares: [
          { meal: "breakfast", percent: 25 },
          { meal: "lunch", percent: 35 },
          { meal: "dinner", percent: 30 },
          { meal: "snack", percent: 10 },
        ],
      });

      const goals = await t.query(api.users.users.getEffectiveGoals, {});
      expect(goals?.mealTargetsEnabled).toBe(true);
      expect(goals!.effective.calories).toBe(2317);
      // Largest-remainder rounding must not lose or invent a calorie.
      expect(sumCalories(goals!.mealTargets)).toBe(2317);
    });
  });

  test("shares that do not add to 100 are rescaled on write", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "meal-targets-rescale" }, async () => {
      await t.mutation(api.users.users.setMealCalorieTargets, {
        enabled: true,
        // Sums to 50, not 100.
        shares: [
          { meal: "breakfast", percent: 10 },
          { meal: "lunch", percent: 20 },
          { meal: "dinner", percent: 20 },
        ],
      });

      const prefs = await t.query(api.users.users.getPreferences, {});
      const total = (prefs?.mealCalorieTargets?.shares ?? []).reduce(
        (sum, share) => sum + share.percent,
        0,
      );
      expect(total).toBeCloseTo(100, 6);
      // "snack" was omitted by the caller but is a known meal, so it joins at 0.
      expect(
        prefs?.mealCalorieTargets?.shares.find((s) => s.meal === "snack")
          ?.percent,
      ).toBe(0);
    });
  });

  test("a custom meal category gets a share and keeps the sum exact", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "meal-targets-custom" }, async () => {
      await t.mutation(api.users.users.setCustomMealCategories, {
        categories: [
          {
            id: "post_workout_1730000000",
            label: "Post workout",
            color: "c",
            bg: "b",
          },
        ],
      });
      await t.mutation(api.users.users.setMealCalorieTargets, {
        enabled: true,
        shares: [
          { meal: "breakfast", percent: 20 },
          { meal: "lunch", percent: 30 },
          { meal: "dinner", percent: 30 },
          { meal: "snack", percent: 10 },
          { meal: "post_workout_1730000000", percent: 10 },
        ],
      });

      const goals = await t.query(api.users.users.getEffectiveGoals, {});
      expect(goals!.mealTargets.map((target) => target.meal)).toContain(
        "post_workout_1730000000",
      );
      expect(sumCalories(goals!.mealTargets)).toBe(goals!.effective.calories);
    });
  });

  test("deleting a category re-normalises the stored budget", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "meal-targets-delete" }, async () => {
      const custom = {
        id: "second_dinner_1",
        label: "Second dinner",
        color: "c",
        bg: "b",
      };
      await t.mutation(api.users.users.setCustomMealCategories, {
        categories: [custom],
      });
      await t.mutation(api.users.users.setMealCalorieTargets, {
        enabled: true,
        shares: [
          { meal: "breakfast", percent: 25 },
          { meal: "lunch", percent: 25 },
          { meal: "dinner", percent: 25 },
          { meal: "snack", percent: 0 },
          { meal: custom.id, percent: 25 },
        ],
      });

      // Removing the category is the one place stored shares can go stale.
      await t.mutation(api.users.users.setCustomMealCategories, {
        categories: [],
      });

      const prefs = await t.query(api.users.users.getPreferences, {});
      const shares = prefs?.mealCalorieTargets?.shares ?? [];
      expect(shares.find((s) => s.meal === custom.id)).toBeUndefined();
      expect(shares.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 6);

      const goals = await t.query(api.users.users.getEffectiveGoals, {});
      expect(sumCalories(goals!.mealTargets)).toBe(goals!.effective.calories);
    });
  });

  test("targets follow the workout-adjusted calorie budget", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "meal-targets-workout" }, async () => {
      await t.mutation(api.users.users.setCustomGoals, { calories: 2000 });
      await t.mutation(api.users.users.setMealCalorieTargets, {
        enabled: true,
        shares: [{ meal: "breakfast", percent: 100 }],
      });
      await t.mutation(api.users.users.setWorkoutAdjustment, { enabled: true });

      const plain = await t.query(api.users.users.getEffectiveGoals, {});
      // Resolved against the final calorie number, whatever adjustments applied.
      expect(sumCalories(plain!.mealTargets)).toBe(plain!.effective.calories);
    });
  });
});
