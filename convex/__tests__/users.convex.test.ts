import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("users Convex functions", () => {
  test("getCurrentUser returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.users.users.getCurrentUser, {}),
    ).resolves.toBeNull();
  });

  test("getPreferences returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.users.users.getPreferences, {}),
    ).resolves.toBeNull();
  });

  test("syncTimezone is a no-op when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.syncTimezone, {
        timeZone: "America/New_York",
      }),
    ).resolves.toEqual({ timeZone: "America/New_York" });
  });

  test("syncTimezone normalizes invalid timezone when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.syncTimezone, { timeZone: "Not/A_Zone" }),
    ).resolves.toEqual({ timeZone: "UTC" });
  });

  test("setWeightUnit throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.setWeightUnit, { unit: "kg" }),
    ).rejects.toThrow();
  });

  test("setWaterGoal throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.setWaterGoal, { goalMl: 2000 }),
    ).rejects.toThrow();
  });

  test("setCustomGoals throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.users.setCustomGoals, { calories: 2000 }),
    ).rejects.toThrow();
  });

  test("getEffectiveGoals returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.users.users.getEffectiveGoals, {}),
    ).resolves.toBeNull();
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
        dashboardSettings: { workoutFocus: "strength", simpleMode: true },
        updatedAt: Date.now(),
      });
    });

    const prefs = await t.run(async (ctx) => ctx.db.get(id));
    expect(prefs!.dashboardSettings!.workoutFocus).toBe("strength");
    expect(prefs!.dashboardSettings!.simpleMode).toBe(true);
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

  test("getEffectiveGoals uses onboarding nutrition context to keep targets safe", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "safe-nutrition-user" }, async () => {
      await t.mutation(api.logs.calories.setProfile, {
        sex: "female",
        age: 28,
        weightKg: 68,
        heightCm: 166,
        activityLevel: "lightly_active",
        goal: "lose",
      });
      await t.mutation(api.users.onboarding.save, {
        age: 28,
        heightCm: 166,
        goal: "lose",
        nutritionGoal: "lose_fat",
        safetyMode: "clinician",
        weightTrend: "stable",
        occupationActivity: "mixed",
        dietType: "vegetarian",
        allergies: ["dairy"],
        cookingSkill: "beginner",
        budget: "low",
        mealFrequency: 3,
        trackingMode: "protein_calories",
        loggingFeatures: ["saved_meals"],
        firstNutritionAction: "build_template",
      });

      const goals = await t.query(api.users.users.getEffectiveGoals, {});

      expect(goals!.health).toMatchObject({
        calories: 1948,
        bmr: 1417,
        tdee: 1948,
        source: "healthProfile",
        safetyMode: "clinician",
        trackingMode: "protein_calories",
      });
      expect(goals!.health!.calorieStrategy).toContain("Clinician-guided mode");
      expect(goals!.health!.guidance).toContain(
        "Keep targets conservative and prompt clinician guidance.",
      );
      expect(goals!.effective.calories).toBe(1948);
      expect(goals!.effective.protein).toBeGreaterThan(100);
    });
  });

  test("getNutritionPlan keeps recovery mode non-numeric and protected", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "recovery-plan-user" }, async () => {
      await t.mutation(api.logs.calories.setProfile, {
        sex: "female",
        age: 25,
        weightKg: 65,
        heightCm: 168,
        activityLevel: "lightly_active",
        goal: "lose",
      });
      await t.mutation(api.users.onboarding.save, {
        age: 25,
        heightCm: 168,
        goal: "lose",
        nutritionGoal: "lose_fat",
        safetyMode: "recovery",
        trackingMode: "recovery",
        firstNutritionAction: "skip_habit",
      });

      const plan = await t.query(api.users.users.getNutritionPlan, {
        date: "2026-07-14",
      });

      expect(plan!.safetyMode).toBe("recovery");
      expect(plan!.trackingMode).toBe("recovery");
      expect(plan!.visibleMetrics.calories).toBe(false);
      expect(plan!.visibleMetrics.streaks).toBe(false);
    });
  });

  test("getNutritionPlan points sparse users at the missing input", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "nutrition-plan-sparse-user" }, async () => {
      await t.mutation(api.users.onboarding.save, {
        age: 30,
        heightCm: 180,
        goal: "health",
        nutritionGoal: "maintain",
        safetyMode: "standard",
        trackingMode: "full",
      });

      const plan = await t.query(api.users.users.getNutritionPlan, {
        date: "2026-07-14",
      });

      expect(plan!.nextBestAction.kind).toBe("add_check_in");
    });
  });

  test("meal suggestions carry onboarding diet and allergy constraints", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "meal-suggestion-user" }, async () => {
      await t.mutation(api.users.onboarding.save, {
        age: 29,
        heightCm: 172,
        goal: "health",
        nutritionGoal: "maintain",
        safetyMode: "standard",
        trackingMode: "photo_portion",
        dietType: "vegetarian",
        allergies: ["dairy"],
        cookingSkill: "beginner",
        budget: "low",
        mealFrequency: 3,
      });

      const plan = await t.query(api.users.users.getNutritionPlan, {
        date: "2026-07-14",
      });

      const tags = plan!.mealSuggestions.flatMap(
        (suggestion) => suggestion.tags,
      );
      expect(tags).toContain("vegetarian");
      expect(tags).toContain("no dairy");
      expect(tags).toContain("budget");
      expect(tags).toContain("simple");
      expect(
        plan!.mealSuggestions.some((item) => item.action === "photo_log"),
      ).toBe(true);
    });
  });

  test("workout calories connect training logs to nutrition targets", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "workout-fuel-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: "2026-07-10",
        exercises: [],
        durationSeconds: 3600,
      });

      const fixedTarget = await t.query(api.users.users.getEffectiveGoals, {
        date: "2026-07-10",
      });
      expect(fixedTarget).toMatchObject({
        burnedCalories: 375,
        isTrainingDay: true,
        workoutAdjustmentEnabled: false,
        effective: { calories: 2000 },
      });

      await t.mutation(api.users.users.setWorkoutAdjustment, { enabled: true });
      const adjustedTarget = await t.query(api.users.users.getEffectiveGoals, {
        date: "2026-07-10",
      });
      expect(adjustedTarget).toMatchObject({
        burnedCalories: 375,
        isTrainingDay: true,
        workoutAdjustmentEnabled: true,
        effective: { calories: 2375 },
      });
    });
  });

  test("two daily sessions aggregate into one nutrition adjustment", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "two-session-fuel-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: "2026-07-11",
        sessionId: "strength-am",
        slot: 1,
        exercises: [],
        durationSeconds: 1800,
      });
      await t.mutation(api.logs.workouts.completion, {
        date: "2026-07-11",
        sessionId: "cardio-pm",
        slot: 2,
        exercises: [],
        durationSeconds: 1800,
      });
      await t.mutation(api.users.users.setWorkoutAdjustment, { enabled: true });

      await expect(
        t.query(api.users.users.getEffectiveGoals, { date: "2026-07-11" }),
      ).resolves.toMatchObject({
        isTrainingDay: true,
        burnedCalories: 375,
        effective: { calories: 2375 },
      });
    });
  });

  test("setDashboardTrendMetric accepts the measurements that were previously untrendable", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "trend-metric-user" }, async () => {
      for (const metric of ["neckCm", "hipsCm", "calvesCm"] as const) {
        await t.mutation(api.users.users.setDashboardTrendMetric, { metric });
        await expect(
          t.query(api.users.users.getPreferences, {}),
        ).resolves.toMatchObject({
          dashboardSettings: { trendMetric: metric },
        });
      }
    });
  });

  test("setDashboardTrendMetric preserves workoutFocus and simpleMode", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "trend-metric-preserve-user" }, async () => {
      await t.mutation(api.users.users.setDashboardSettings, {
        workoutFocus: "cardio",
        simpleMode: true,
      });
      await t.mutation(api.users.users.setDashboardTrendMetric, {
        metric: "neckCm",
      });

      await expect(
        t.query(api.users.users.getPreferences, {}),
      ).resolves.toMatchObject({
        dashboardSettings: {
          workoutFocus: "cardio",
          simpleMode: true,
          trendMetric: "neckCm",
        },
      });
    });
  });
});
