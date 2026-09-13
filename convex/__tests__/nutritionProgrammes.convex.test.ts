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
