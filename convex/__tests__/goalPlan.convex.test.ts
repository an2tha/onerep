/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
const modules = import.meta.glob("../**/*.ts");
const plan = { focus: "hypertrophy" as const };

test("goal preferences persist per account without changing calorie targets", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "goals-owner" });
  const other = t.withIdentity({ name: "goals-other" });
  await owner.mutation(api.users.users.setNutritionTargets, { calories: 2200 });
  await owner.mutation(api.users.users.saveGoalPlan, { plan });
  const saved = await owner.query(api.users.users.getPreferences, {});
  expect(saved?.goalPlan).toEqual(plan);
  expect(saved?.goalsIntroducedAt).toBeGreaterThan(0);
  expect((await other.query(api.users.users.getPreferences, {}))?.goalPlan).toBeUndefined();
  await owner.mutation(api.users.users.saveGoalPlan, {});
  expect((await owner.query(api.users.users.getPreferences, {}))?.goalPlan).toEqual(plan);
  expect((await owner.query(api.users.users.getEffectiveGoals, {}))?.effective.calories).toBe(2200);
});

test("skip is durable, legacy muscle targets are dropped, and anonymous writes fail", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.users.users.saveGoalPlan, { plan })).rejects.toThrow();
  const owner = t.withIdentity({ name: "goals-skip" });
  await owner.mutation(api.users.users.saveGoalPlan, {});
  expect((await owner.query(api.users.users.getPreferences, {}))?.goalsIntroducedAt).toBeGreaterThan(0);
  await owner.mutation(api.users.users.saveGoalPlan, { plan });
  await owner.mutation(api.users.users.saveGoalPlan, { plan: { ...plan, muscle: "chest", minimumSets: 8, maximumSets: 12 } });
  expect((await owner.query(api.users.users.getPreferences, {}))?.goalPlan).toEqual(plan);
});
