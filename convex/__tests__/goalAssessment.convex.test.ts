/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { assessmentFixture } from "../../apps/mobile/tests/goals/assessment-fixture";
const modules = import.meta.glob("../**/*.ts");

test("assessment requires a saved goal and isolates account data", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "assessment-owner" });
  const other = t.withIdentity({ name: "assessment-other" });
  const input = assessmentFixture();
  expect(
    await t.query(api.progressInsights.goals, { today: input.today }),
  ).toBeNull();
  expect(
    await owner.query(api.progressInsights.goals, { today: input.today }),
  ).toBeNull();
  await owner.mutation(api.users.users.saveGoalPlan, { plan: input.plan });
  await other.mutation(api.users.users.saveGoalPlan, { plan: input.plan });
  const prefs = await owner.query(api.users.users.getPreferences, {});
  await t.run(async (ctx) => {
    for (const [exerciseId, meta] of Object.entries(input.catalog))
      await ctx.db.insert("exercises", {
        userId: "__global__",
        exerciseId,
        name: exerciseId,
        category: "strength",
        level: "beginner",
        instructions: [],
        ...meta,
      });
    for (const workout of input.workouts)
      await ctx.db.insert("workoutLogs", {
        ...workout,
        userId: prefs!.userId,
        completedAt: 1,
      });
    for (const health of input.health)
      await ctx.db.insert("healthMetrics", {
        ...health,
        provider: "apple_health",
        userId: prefs!.userId,
        syncedAt: 1,
        updatedAt: 1,
      });
  });
  const result = await owner.query(api.progressInsights.goals, {
    today: input.today,
  });
  expect(result?.score).toBeGreaterThanOrEqual(95);
  expect(result?.context.workingSets).toBe(24);
  const isolated = await other.query(api.progressInsights.goals, {
    today: input.today,
  });
  expect(isolated?.score).toBeNull();
  expect(isolated?.context.workingSets).toBe(0);
  await expect(
    owner.query(api.progressInsights.goals, { today: "2026-02-31" }),
  ).rejects.toThrow();
});

test("custom muscle metadata is owner-only and oversized windows withhold training", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "assessment-custom-owner" });
  const other = t.withIdentity({ name: "assessment-custom-other" });
  const input = assessmentFixture();
  await owner.mutation(api.users.users.saveGoalPlan, { plan: input.plan });
  await other.mutation(api.users.users.saveGoalPlan, { plan: input.plan });
  const prefs = await owner.query(api.users.users.getPreferences, {});
  const otherPrefs = await other.query(api.users.users.getPreferences, {});
  await t.run(async (ctx) => {
    const id = await ctx.db.insert("customExercises", {
      userId: otherPrefs!.userId,
      name: "Private movement",
      category: "strength",
      primaryMuscles: ["chest"],
      secondaryMuscles: [],
      instructions: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("workoutLogs", {
      userId: prefs!.userId,
      date: input.today,
      exercises: [{ id: `custom:${id}`, sets: [{ completed: true }] }],
      durationSeconds: 60,
      completedAt: 1,
    });
  });
  let result = await owner.query(api.progressInsights.goals, {
    today: input.today,
  });
  expect(result?.context.workingSets).toBe(1);
  expect(result?.context.mappedSets).toBe(0);
  await t.run(async (ctx) => {
    for (let i = 0; i < 241; i++)
      await ctx.db.insert("workoutLogs", {
        userId: prefs!.userId,
        date: input.today,
        exercises: [],
        durationSeconds: 60,
        completedAt: 1,
      });
  });
  result = await owner.query(api.progressInsights.goals, {
    today: input.today,
  });
  expect(result?.context.truncated).toBe(true);
  expect(result?.score).toBeNull();
});
