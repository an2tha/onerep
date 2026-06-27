import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const metricArgs = {
  subapp: "progress" as const,
  prompt: "bench progress and consistency",
  maxResults: 4,
  metrics: [
    {
      id: "strength.selected_delta",
      title: "Selected lift change",
      group: "Strength",
      description: "Estimated 1RM change for the selected exercise.",
      keywords: ["strength", "progress", "change", "exercise", "pr"],
    },
    {
      id: "training.workouts_30",
      title: "Training days",
      group: "Training",
      description: "Number of days with a completed workout.",
      keywords: ["training", "workouts", "frequency", "consistency"],
    },
  ],
};

describe("AI monthly usage quota", () => {
  test("getMonthlyUsage returns the authenticated user's monthly progress", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-usage-query-user";

    await expect(
      t.query(api.ai.usage.getMonthlyUsage, {}),
    ).resolves.toMatchObject({
      count: 0,
      remaining: 150,
      limit: 150,
    });

    await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
      userId,
      source: "food_snap",
    });
    await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
      userId,
      source: "workout_preset",
    });

    const usage = await t
      .withIdentity({ tokenIdentifier: userId })
      .query(api.ai.usage.getMonthlyUsage, {});

    expect(usage).toMatchObject({
      count: 2,
      remaining: 148,
      limit: 150,
    });
    expect(usage.month).toMatch(/^\d{4}-\d{2}$/);
  });

  test("allows 150 AI requests per authenticated user per month", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-quota-user";

    for (let i = 0; i < 150; i += 1) {
      const quota = await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "progress_metrics",
      });
      expect(quota.allowed).toBe(true);
      expect(quota.count).toBe(i + 1);
      expect(quota.limit).toBe(150);
      expect(quota.remaining).toBe(149 - i);
    }

    await expect(
      t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "workout_preset",
      }),
    ).resolves.toMatchObject({ allowed: false, count: 150, remaining: 0 });
  });

  test("public AI actions reject once the monthly quota is exhausted", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-action-quota-user";

    for (let i = 0; i < 150; i += 1) {
      await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "progress_metrics",
      });
    }

    const authed = t.withIdentity({ tokenIdentifier: userId });

    await expect(
      authed.action(api.ai.metricGeneration.generateMetricSet, metricArgs),
    ).rejects.toThrow("Monthly AI request limit reached");

    await expect(
      authed.action(api.logs.presetAgent.createFromText, {
        text: "Upper day\nBench Press 3x5\nBarbell Row 3x8",
      }),
    ).rejects.toThrow("Monthly AI request limit reached");
  });
});
