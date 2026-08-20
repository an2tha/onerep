import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

/**
 * The daily target sheet, written by the three surfaces that can write it.
 *
 * The interesting case is undo: a user who had no calorie override before must
 * get no calorie override back, not the figure the calculator happened to
 * suggest on the day the coach was asked.
 */
describe("nutrition targets", () => {
  test("Coach sets calories, macros and water, and undo restores the absence", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "targets-owner" });

    const before = await as.query(api.users.users.getEffectiveGoals, {});
    expect(before.custom).toBeNull();

    const results = (await as.action(api.ai.coachOperations.applyApproved, {
      requestId: "targets-run-1",
      operations: [
        {
          type: "set_nutrition_targets",
          confirmation: "confirm",
          summary: "Apply the dietitian's numbers",
          assumptions: ["Fluids start at the achievable figure"],
          warnings: [],
          calories: 1800,
          protein: 130,
          carbs: 180,
          fat: 60,
          waterMl: 2400,
        },
      ],
    })) as Array<{ label: string; actionId: string }>;

    expect(results[0].label).toContain("1800 kcal");
    expect(results[0].label).toContain("2400 ml water");

    const after = await as.query(api.users.users.getEffectiveGoals, {});
    expect(after.custom).toMatchObject({
      calories: 1800,
      protein: 130,
      carbs: 180,
      fat: 60,
    });
    const prefs = await as.query(api.users.users.getPreferences, {});
    expect(prefs?.waterGoalMl).toBe(2400);

    await as.mutation(api.ai.coachState.undoAction, {
      id: results[0].actionId as Id<"coachActionEvents">,
    });

    const undone = await as.query(api.users.users.getEffectiveGoals, {});
    expect(undone.custom).toBeNull();
    const undonePrefs = await as.query(api.users.users.getPreferences, {});
    expect(undonePrefs?.waterGoalMl).toBeUndefined();
  });

  test("a partial write leaves the other targets alone", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "targets-partial" });

    await as.mutation(api.users.users.setNutritionTargets, {
      calories: 2400,
      protein: 180,
      carbs: 240,
      fat: 80,
    });
    await as.mutation(api.users.users.setNutritionTargets, { waterMl: 3000 });

    const goals = await as.query(api.users.users.getEffectiveGoals, {});
    expect(goals.custom).toMatchObject({ calories: 2400, protein: 180 });
    const prefs = await as.query(api.users.users.getPreferences, {});
    expect(prefs?.waterGoalMl).toBe(3000);
  });

  test("null clears one override and hands the field back to the calculator", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "targets-clear" });

    await as.mutation(api.users.users.setNutritionTargets, {
      calories: 2400,
      protein: 180,
    });
    await as.mutation(api.users.users.setNutritionTargets, { calories: null });

    const goals = await as.query(api.users.users.getEffectiveGoals, {});
    expect(goals.custom?.calories).toBeUndefined();
    expect(goals.custom?.protein).toBe(180);
  });

  test("a slipped decimal is refused rather than stored", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "targets-bounds" });

    await expect(
      as.mutation(api.users.users.setNutritionTargets, { calories: 18000 }),
    ).rejects.toThrow(/between 800 and 8000/);
    await expect(
      as.mutation(api.users.users.setNutritionTargets, {}),
    ).rejects.toThrow(/No nutrition target/);
  });

  test("macros that do not add up to the calorie target are rejected before the write", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "targets-incoherent" });

    await expect(
      as.action(api.ai.coachOperations.applyApproved, {
        requestId: "targets-run-2",
        operations: [
          {
            type: "set_nutrition_targets",
            confirmation: "confirm",
            summary: "Incoherent targets",
            assumptions: [],
            warnings: [],
            calories: 1800,
            protein: 300,
            carbs: 300,
            fat: 120,
          },
        ],
      }),
    ).rejects.toThrow(/do not add up/);
  });

  test("a planned meal whose macros miss its calories is refused", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "plan-macros" });

    await expect(
      as.action(api.ai.coachOperations.applyApproved, {
        requestId: "plan-run-1",
        operations: [
          {
            type: "save_weekly_plan",
            confirmation: "confirm",
            summary: "Week of prescribed meals",
            assumptions: [],
            warnings: [],
            weekStart: "2026-07-13",
            title: "Prescribed week",
            planAssumptions: [],
            days: [
              {
                day: "Mon",
                meals: [
                  {
                    label: "Protein oats",
                    calories: 520,
                    protein: 40,
                    carbs: 200,
                    fat: 14,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/miss its calories/);
  });

  test("a coherent planned meal is saved with its numbers", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ name: "plan-macros-ok" });

    await as.action(api.ai.coachOperations.applyApproved, {
      requestId: "plan-run-2",
      operations: [
        {
          type: "save_weekly_plan",
          confirmation: "confirm",
          summary: "Week of prescribed meals",
          assumptions: [],
          warnings: [],
          weekStart: "2026-07-13",
          title: "Prescribed week",
          planAssumptions: [],
          days: [
            {
              day: "Mon",
              meals: [
                {
                  label: "Protein oats",
                  calories: 520,
                  protein: 40,
                  carbs: 55,
                  fat: 14,
                },
              ],
            },
          ],
        },
      ],
    });

    const plan = await as.query(api.ai.coachState.getWeeklyPlan, {
      weekStart: "2026-07-13",
    });
    expect((plan!.days as Array<{ meals: unknown[] }>)[0].meals[0]).toEqual({
      label: "Protein oats",
      calories: 520,
      protein: 40,
      carbs: 55,
      fat: 14,
    });
  });
});
