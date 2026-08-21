import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const TODAY = "2026-08-01";

/**
 * Seeds one user with every source `loadForModel` reads, so the assertions
 * distinguish "loaded and empty" from "never loaded at all".
 */
async function seedUser(
  t: ReturnType<typeof convexTest>,
  userId: string,
  options: { personalizedInsights?: boolean } = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("userPreferences", {
      userId,
      lastActiveTimezone: "UTC",
      updatedAt: Date.now(),
      ...(options.personalizedInsights === undefined
        ? {}
        : {
            privacySettings: {
              analyticsEnabled: true,
              personalizedInsightsEnabled: options.personalizedInsights,
            },
          }),
    });

    await ctx.db.insert("onboardingProfiles", {
      userId,
      age: 31,
      heightCm: 178,
      goal: "build",
      experienceLevel: "intermediate",
      nutritionGoal: "gain_muscle",
      dietType: "omnivore",
      allergies: ["peanut", "shellfish"],
      cookingSkill: "confident",
      budget: "moderate",
      mealFrequency: 4,
      safetyFlags: ["knee_rehab"],
      consent: {
        dataUse: true,
        weightData: true,
        foodLogging: true,
        wearableIntegrations: false,
      },
      updatedAt: Date.now(),
    });

    await ctx.db.insert("healthProfiles", {
      userId,
      sex: "male",
      age: 31,
      weightKg: 82,
      heightCm: 178,
      activityLevel: "moderately_active",
      goal: "maintain",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("bodyMeasurements", {
      userId,
      clientId: "cm-1",
      loggedAt: "2026-07-30",
      weightKg: 82.4,
      neckCm: 39,
      hipsCm: 98,
      notes: "felt good",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("waterLogs", {
      userId,
      date: "2026-07-31",
      entries: [
        { id: "w1", amountMl: 750 },
        { id: "w2", amountMl: 500 },
      ],
      updatedAt: Date.now(),
    });

    await ctx.db.insert("fastingSessions", {
      userId,
      startDate: "2026-07-30",
      startedAt: Date.parse("2026-07-30T20:00:00Z"),
      endedAt: Date.parse("2026-07-31T12:00:00Z"),
      targetMinutes: 960,
      protocol: "16:8",
      endedEarly: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const supplementId = await ctx.db.insert("supplementItems", {
      userId,
      name: "Creatine",
      category: "creatine",
      form: "powder",
      servingLabel: "5 g",
      defaultServingQuantity: 1,
      active: true,
      schedule: { type: "daily" },
      nutrientsPerServing: { creatine: 5 },
      source: "manual",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (const [date, status] of [
      ["2026-07-30", "taken"],
      ["2026-07-31", "skipped"],
    ] as const) {
      await ctx.db.insert("supplementIntakeLogs", {
        userId,
        supplementId,
        date,
        status,
        servingMultiplier: 1,
        servingLabel: "5 g",
        name: "Creatine",
        category: "creatine",
        nutrients: { creatine: 5 },
        loggedAt: `${date}T08:00:00.000Z`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const metricId = await ctx.db.insert("customProgressMetrics", {
      userId,
      title: "Morning readiness",
      description: "1-10 self report",
      tab: "body",
      kind: "number",
      unit: "score",
      step: 1,
      accent: "progress",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("customProgressMetricEntries", {
      userId,
      metricId,
      date: "2026-07-31",
      value: 8,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("workoutLogs", {
      userId,
      date: "2026-07-31",
      exercises: [
        {
          id: "ex-1",
          name: "Back Squat",
          sets: [
            { reps: 5, weight: 100, completed: true },
            { reps: 5, weight: 120, completed: true },
            { reps: 5, weight: 130, completed: false },
          ],
        },
      ],
      durationSeconds: 3600,
      completedAt: Date.now(),
    });
  });
}

describe("coachWorkspace.loadForModel", () => {
  test("loads every source the coach used to be blind to", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "user-full");

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-full",
      today: TODAY,
    });

    expect(workspace.personalized).toBe(true);
    expect(workspace.omitted).toEqual([]);

    expect(workspace.bodyMeasurements).toHaveLength(1);
    expect(workspace.bodyMeasurements[0]).toMatchObject({
      date: "2026-07-30",
      weightKg: 82.4,
      neckCm: 39,
      hipsCm: 98,
    });
    // Notes and photos are never worth the tokens.
    expect(workspace.bodyMeasurements[0]).not.toHaveProperty("notes");

    expect(workspace.water).toEqual([
      { date: "2026-07-31", totalMl: 1250, entryCount: 2 },
    ]);

    expect(workspace.fasting).toHaveLength(1);
    expect(workspace.fasting[0]).toMatchObject({
      protocol: "16:8",
      completed: true,
      hours: 16,
    });

    expect(workspace.supplementAdherence.days).toEqual([
      { date: "2026-07-31", taken: 0, skipped: 1 },
      { date: "2026-07-30", taken: 1, skipped: 0 },
    ]);
    expect(workspace.supplementAdherence.bySupplement[0]).toMatchObject({
      name: "Creatine",
      taken: 1,
      skipped: 1,
      lastTaken: "2026-07-30",
    });

    // Definitions were always loaded; the values are the new part.
    expect(workspace.progressMetrics[0]).toMatchObject({
      title: "Morning readiness",
      latest: { date: "2026-07-31", value: 8 },
    });

    expect(workspace.profile).toMatchObject({
      source: "healthProfile",
      sex: "male",
      heightCm: 178,
      dietType: "omnivore",
      cookingSkill: "confident",
      budget: "moderate",
      mealFrequency: 4,
      allergies: ["peanut", "shellfish"],
      safetyFlags: ["knee_rehab"],
    });
  });

  test("projects logged workouts instead of shipping every set", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "user-workouts");

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-workouts",
      today: TODAY,
    });

    expect(workspace.recentWorkouts[0].exercises).toEqual([
      { name: "Back Squat", setCount: 2, topSet: { reps: 5, weight: 120 } },
    ]);
  });

  test("reads a stall from history the two-week window cannot show", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "user-stalled");

    // Four sessions at the same numbers, spread across ten weeks — entirely
    // outside the 14-day window `recentWorkouts` covers.
    await t.run(async (ctx) => {
      for (const date of [
        "2026-05-26",
        "2026-06-16",
        "2026-07-07",
        "2026-07-28",
      ]) {
        await ctx.db.insert("workoutLogs", {
          userId: "user-stalled",
          date,
          exercises: [
            {
              id: "ex-bench",
              name: "Bench Press",
              sets: [
                { type: "warmup", reps: 5, weight: 200, completed: true },
                { type: "normal", reps: 5, weight: 80, completed: true },
                { type: "normal", reps: 5, weight: 80, completed: true },
              ],
            },
          ],
          durationSeconds: 3000,
          completedAt: Date.now(),
        });
      }
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-stalled",
      today: TODAY,
    });

    const bench = workspace.programming!.lifts.find(
      (lift: { name: string }) => lift.name === "Bench Press",
    );
    expect(bench.status).toBe("stalled");
    expect(bench.sessions).toBe(4);
    // The 200kg warm-up must not become this user's best-ever bench.
    expect(bench.bestE1rm).toBeLessThan(100);
  });

  test("a user with no logged training gets null, not an empty verdict", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId: "user-untrained",
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
      });
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-untrained",
      today: TODAY,
    });
    expect(workspace.programming).toBeNull();
  });

  test("the privacy gate drops behaviour but never allergies or safety flags", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "user-private", { personalizedInsights: false });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-private",
      today: TODAY,
    });

    expect(workspace.personalized).toBe(false);
    for (const dropped of [
      "foodEntries",
      "checkIns",
      "recentWorkouts",
      "recentActions",
      "bodyMeasurements",
      "water",
      "fasting",
      "supplementAdherence",
      // The most pointed inference in the workspace goes with the rest of it.
      "programming",
    ]) {
      expect(workspace).not.toHaveProperty(dropped);
      expect(workspace.omitted).toContain(dropped);
    }

    // Safety constraints are not personalization — withholding them would let
    // the model recommend food that can hurt someone.
    expect(workspace.profile.allergies).toEqual(["peanut", "shellfish"]);
    expect(workspace.profile.safetyFlags).toEqual(["knee_rehab"]);
    // ...but the rest of the profile is gone.
    expect(workspace.profile).not.toHaveProperty("sex");
    expect(workspace.profile).not.toHaveProperty("dietType");

    // Authored content survives, so the coach can still act on request.
    expect(workspace.supplements).toHaveLength(1);
    expect(workspace.progressMetrics[0]).not.toHaveProperty("latest");
    expect(workspace.progressMetrics[0]).not.toHaveProperty("entries");
    expect(workspace.progressMetrics[0].title).toBe("Morning readiness");
  });

  test("defaults to personalized when no privacy settings were ever saved", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "user-default");

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-default",
      today: TODAY,
    });

    // An implicit opt-out would silently degrade every existing user's coach.
    expect(workspace.personalized).toBe(true);
  });

  test("never leaks another user's data", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "user-a");
    await seedUser(t, "user-b");

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-a",
      today: TODAY,
    });

    expect(workspace.bodyMeasurements).toHaveLength(1);
    expect(workspace.supplements).toHaveLength(1);
    expect(workspace.supplementAdherence.bySupplement).toHaveLength(1);
    expect(workspace.progressMetrics).toHaveLength(1);
  });

  test("is reachable through the public API surface it feeds", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, "user-public");

    // bodyProgress.list now goes through the same extracted helper.
    await t.run(async () => {});
    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-public",
      today: TODAY,
    });
    expect(workspace.truncated).toEqual([]);
    expect(api.users.users.getPreferences).toBeDefined();
  });
});
