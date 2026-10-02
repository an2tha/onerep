/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { localProgrammeTime } from "../lib/nutritionProgramme";
const modules = import.meta.glob("../**/*.ts");
const input = {
  goal: "step_down" as const,
  weeks: 6,
  baselineCalories: 2400,
  changePercent: 10,
  protein: 150,
  fat: 65,
  fastingHours: 14,
  eatingStart: "09:00",
  timezone: "Europe/Berlin",
  screeningConfirmed: true,
};
test("programme owns today's goals, is isolated, and ending restores prior targets", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "programme-owner" });
  const other = t.withIdentity({ name: "programme-other" });
  await owner.mutation(api.users.users.setNutritionTargets, { calories: 2200 });
  const id = await owner.mutation(api.nutritionProgrammes.start, input);
  expect(await other.query(api.nutritionProgrammes.getCurrent, {})).toBeNull();
  await expect(
    other.mutation(api.nutritionProgrammes.end, { id }),
  ).rejects.toThrow();
  const date = localProgrammeTime(input.timezone).date;
  expect(
    (await owner.query(api.users.users.getEffectiveGoals, { date }))?.effective
      .calories,
  ).toBe(2400);
  await expect(
    owner.mutation(api.nutritionProgrammes.start, input),
  ).rejects.toThrow("current programme");
  await owner.mutation(api.nutritionProgrammes.end, { id });
  expect(
    (await owner.query(api.users.users.getEffectiveGoals, { date }))?.effective
      .calories,
  ).toBe(2200);
});
test("rejects unsafe or malformed self-serve inputs", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "programme-invalid" });
  for (const patch of [
    { screeningConfirmed: false },
    { fastingHours: 48 },
    { changePercent: 40 },
    { baselineCalories: 1000 },
    { eatingStart: "25:00" },
    { weeks: 5 },
    { timezone: "invalid" },
  ]) {
    await expect(
      owner.mutation(api.nutritionProgrammes.start, { ...input, ...patch }),
    ).rejects.toThrow();
  }
});

test("historical targets survive a newer programme", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "programme-history" });
  const id = await owner.mutation(api.nutritionProgrammes.start, input);
  await t.run(async (ctx) => {
    const programme = (await ctx.db.get(id))!;
    await ctx.db.patch(id, {
      startDate: "2025-01-01",
      endedDate: "2025-02-01",
    });
    const { _id, _creationTime, ...body } = programme;
    await ctx.db.insert("nutritionProgrammes", {
      ...body,
      startDate: "2025-03-01",
      baselineCalories: 2800,
    });
  });
  expect(
    (
      await owner.query(api.users.users.getEffectiveGoals, {
        date: "2025-01-08",
      })
    )?.effective.calories,
  ).toBe(2340);
  expect(
    (
      await owner.query(api.users.users.getEffectiveGoals, {
        date: "2025-03-01",
      })
    )?.effective.calories,
  ).toBe(2800);
});

test("a changed safety profile pauses programme targets and guidance", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "programme-safety-change" });
  const id = await owner.mutation(api.nutritionProgrammes.start, input);
  await t.run(async (ctx) => {
    const programme = (await ctx.db.get(id))!;
    await ctx.db.insert("onboardingProfiles", {
      userId: programme.userId,
      age: 30,
      heightCm: 175,
      goal: "health",
      safetyMode: "recovery",
      updatedAt: Date.now(),
    });
  });
  expect(
    (await owner.query(api.nutritionProgrammes.getCurrent, {}))?.requiresCare,
  ).toBe(true);
  const goals = await owner.query(api.users.users.getEffectiveGoals, {});
  expect(goals?.effective.calories).toBe(goals?.health?.calories);
});

test("a legacy none flag is eligible, while real restrictions are surfaced before setup", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "programme-legacy-none" });
  const id = await owner.mutation(api.nutritionProgrammes.start, input);
  const profileId = await t.run(async (ctx) => {
    const programme = (await ctx.db.get(id))!;
    return await ctx.db.insert("onboardingProfiles", {
      userId: programme.userId,
      age: 30,
      heightCm: 175,
      goal: "health",
      safetyMode: "standard",
      safetyFlags: ["none"],
      updatedAt: Date.now(),
    });
  });
  expect(
    (await owner.query(api.nutritionProgrammes.getEligibility, {})).eligible,
  ).toBe(true);
  await owner.mutation(api.nutritionProgrammes.end, { id });
  await owner.mutation(api.nutritionProgrammes.start, input);
  await t.run((ctx) =>
    ctx.db.patch(profileId, { safetyFlags: ["eating_disorder_history"] }),
  );
  const eligibility = await owner.query(
    api.nutritionProgrammes.getEligibility,
    {},
  );
  expect(eligibility.eligible).toBe(false);
  expect(eligibility.reason).toContain("saved profile");
  await expect(
    owner.mutation(api.nutritionProgrammes.start, input),
  ).rejects.toThrow("individual plan");
});

test("goal recommendations use maintenance rather than an existing deficit and stay private", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "goal-recommendations" });
  const other = t.withIdentity({ name: "other-goal-recommendations" });
  const goalPlan = {
    focus: "hypertrophy" as const,
    muscle: "chest",
    minimumSets: 8,
    maximumSets: 12,
  };
  await owner.mutation(api.users.users.saveGoalPlan, { plan: goalPlan });
  const prefs = await owner.query(api.users.users.getPreferences, {});
  await t.run((ctx) =>
    ctx.db.insert("healthProfiles", {
      userId: prefs!.userId,
      sex: "male",
      age: 30,
      weightKg: 80,
      heightCm: 180,
      activityLevel: "moderately_active",
      goal: "lose",
      updatedAt: Date.now(),
    }),
  );
  await owner.mutation(api.users.users.setNutritionTargets, { calories: 1800 });
  const recommendation = await owner.query(
    api.nutritionProgrammes.getGoalRecommendation,
    {},
  );
  const goals = await owner.query(api.users.users.getEffectiveGoals, {});
  expect(recommendation?.baselineCalories).toBe(goals?.health?.tdee);
  expect(recommendation?.baselineCalories).not.toBe(goals?.effective.calories);
  expect(recommendation).toMatchObject({
    goal: "step_up",
    changePercent: 5,
    protein: 144,
    fastingHours: 0,
  });
  expect(
    await other.query(api.nutritionProgrammes.getGoalRecommendation, {}),
  ).toBeNull();
  expect(
    await t.query(api.nutritionProgrammes.getGoalRecommendation, {}),
  ).toBeNull();
  for (const [focus, direction, change, protein] of [
    ["deficit", "step_down", 10, 160],
    ["recomp", "maintain", 0, 144],
    ["endurance", "maintain", 0, 128],
  ] as const) {
    await owner.mutation(api.users.users.saveGoalPlan, {
      plan: { ...goalPlan, focus },
    });
    expect(
      await owner.query(api.nutritionProgrammes.getGoalRecommendation, {}),
    ).toMatchObject({
      goal: direction,
      changePercent: change,
      protein,
      fastingHours: 0,
    });
  }
});

test("missing health data is explicit and protected profiles receive no recommendation", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "goal-missing-profile" });
  await owner.mutation(api.users.users.saveGoalPlan, {
    plan: {
      focus: "deficit",
      muscle: "chest",
      minimumSets: 8,
      maximumSets: 12,
    },
  });
  expect(
    await owner.query(api.nutritionProgrammes.getGoalRecommendation, {}),
  ).toMatchObject({ baselineCalories: null, protein: null, fat: null });
  const prefs = await owner.query(api.users.users.getPreferences, {});
  await t.run((ctx) =>
    ctx.db.insert("onboardingProfiles", {
      userId: prefs!.userId,
      age: 30,
      heightCm: 180,
      goal: "health",
      safetyMode: "recovery",
      updatedAt: Date.now(),
    }),
  );
  expect(
    await owner.query(api.nutritionProgrammes.getGoalRecommendation, {}),
  ).toBeNull();
});

test("replacing a programme preserves prior days and rejects stale or foreign replacements", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "goal-replacement" });
  const other = t.withIdentity({ name: "goal-replacement-other" });
  const oldId = await owner.mutation(api.nutritionProgrammes.start, input);
  const date = localProgrammeTime(input.timezone).date;
  const yesterday = new Date(Date.parse(date) - 86400000)
    .toISOString()
    .slice(0, 10);
  await t.run((ctx) => ctx.db.patch(oldId, { startDate: yesterday }));
  const plan = {
    focus: "hypertrophy" as const,
    muscle: "chest",
    minimumSets: 8,
    maximumSets: 12,
  };
  await owner.mutation(api.users.users.saveGoalPlan, { plan });
  // Saving a goal alone does not change the active programme.
  expect((await owner.query(api.nutritionProgrammes.getCurrent, {}))?._id).toBe(
    oldId,
  );
  const replacement = {
    ...input,
    goal: "step_up" as const,
    goalFocus: "hypertrophy" as const,
    changePercent: 5,
    baselineCalories: 2600,
    replaceProgrammeId: oldId,
  };
  await expect(
    other.mutation(api.nutritionProgrammes.start, {
      ...input,
      replaceProgrammeId: oldId,
    }),
  ).rejects.toThrow();
  await expect(
    owner.mutation(api.nutritionProgrammes.start, {
      ...replacement,
      baselineCalories: 1000,
    }),
  ).rejects.toThrow();
  expect(
    (await owner.query(api.nutritionProgrammes.getCurrent, {}))?.endedDate,
  ).toBeUndefined();
  const newId = await owner.mutation(
    api.nutritionProgrammes.start,
    replacement,
  );
  expect(newId).not.toBe(oldId);
  expect(
    (await owner.query(api.users.users.getEffectiveGoals, { date: yesterday }))
      ?.effective.calories,
  ).toBe(2400);
  expect(
    (await owner.query(api.users.users.getEffectiveGoals, { date }))?.effective
      .calories,
  ).toBe(2600);
  expect(
    (await owner.query(api.nutritionProgrammes.getCurrent, {}))?.goalFocus,
  ).toBe("hypertrophy");
  await expect(
    owner.mutation(api.nutritionProgrammes.start, replacement),
  ).rejects.toThrow("changed");
  await owner.mutation(api.users.users.saveGoalPlan, {
    plan: { ...plan, focus: "endurance" },
  });
  await expect(
    owner.mutation(api.nutritionProgrammes.start, {
      ...replacement,
      replaceProgrammeId: newId,
    }),
  ).rejects.toThrow("goal changed");
});
