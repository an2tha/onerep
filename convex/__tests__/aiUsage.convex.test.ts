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

async function grantPro(t: ReturnType<typeof convexTest>, userId: string) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("billingSubscriptions", {
      userId,
      // Stripe is the only platform that grants Pro; there is no in-app purchase.
      platform: "stripe",
      platformSubscriptionId: `test_subscription:${userId}`,
      productId: "onerep_pro_monthly",
      state: "active",
      autoRenew: true,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      environment: "sandbox",
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("AI monthly usage quota", () => {
  test("getMonthlyUsage reports the free allowance for users without Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-usage-query-user";

    await expect(
      t.query(api.ai.usage.getMonthlyUsage, {}),
    ).resolves.toMatchObject({
      count: 0,
      remaining: 10,
      limit: 10,
      isPro: false,
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
      remaining: 8,
      limit: 10,
      isPro: false,
    });
    expect(usage.month).toMatch(/^\d{4}-\d{2}$/);
  });

  test("getMonthlyUsage reports the Pro allowance for subscribers", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-usage-pro-query-user";
    await grantPro(t, userId);

    await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
      userId,
      source: "food_snap",
    });

    await expect(
      t
        .withIdentity({ tokenIdentifier: userId })
        .query(api.ai.usage.getMonthlyUsage, {}),
    ).resolves.toMatchObject({
      count: 1,
      remaining: 499,
      limit: 500,
      isPro: true,
    });
  });

  test("allows 10 AI requests per month without Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-quota-user";

    for (let i = 0; i < 10; i += 1) {
      const quota = await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "progress_metrics",
      });
      expect(quota.allowed).toBe(true);
      expect(quota.count).toBe(i + 1);
      expect(quota.limit).toBe(10);
      expect(quota.remaining).toBe(9 - i);
    }

    await expect(
      t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "workout_preset",
      }),
    ).resolves.toMatchObject({ allowed: false, count: 10, remaining: 0 });
  });

  test("allows 500 AI requests per month with Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-quota-pro-user";
    await grantPro(t, userId);

    for (let i = 0; i < 500; i += 1) {
      const quota = await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "progress_metrics",
      });
      expect(quota.allowed).toBe(true);
      expect(quota.limit).toBe(500);
    }

    await expect(
      t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "workout_preset",
      }),
    ).resolves.toMatchObject({ allowed: false, count: 500, remaining: 0 });
  });

  test("an exhausted free user is pointed at Pro, a Pro user is not", async () => {
    const t = convexTest(schema, modules);
    const freeUserId = "test|ai-quota-message-free";
    const proUserId = "test|ai-quota-message-pro";
    await grantPro(t, proUserId);

    for (let i = 0; i < 10; i += 1) {
      await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId: freeUserId,
        source: "progress_metrics",
      });
    }
    for (let i = 0; i < 500; i += 1) {
      await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId: proUserId,
        source: "progress_metrics",
      });
    }

    await expect(
      t
        .withIdentity({ tokenIdentifier: freeUserId })
        .action(api.ai.metricGeneration.generateMetricSet, metricArgs),
    ).rejects.toThrow("Upgrade to OneRep Pro for 500 a month");

    await expect(
      t
        .withIdentity({ tokenIdentifier: proUserId })
        .action(api.ai.metricGeneration.generateMetricSet, metricArgs),
    ).rejects.toThrow("(500/month). Try again next month.");
  });

  test("a form analysis spends two requests, not one", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-quota-form-coach";

    await expect(
      t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "form_coach",
      }),
    ).resolves.toMatchObject({ allowed: true, count: 2, remaining: 8 });

    await expect(
      t
        .withIdentity({ tokenIdentifier: userId })
        .query(api.ai.usage.getMonthlyUsage, {}),
    ).resolves.toMatchObject({ count: 2, remaining: 8 });
  });

  test("a request that cannot be paid for in full is refused, not part-charged", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-quota-form-coach-short";

    // Nine of ten spent, so a two-cost analysis no longer fits.
    for (let i = 0; i < 9; i += 1) {
      await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "progress_metrics",
      });
    }

    await expect(
      t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "form_coach",
      }),
    ).resolves.toMatchObject({ allowed: false, count: 9, remaining: 1 });

    // The one request that is left is still usable by a cheaper feature.
    await expect(
      t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "food_snap",
      }),
    ).resolves.toMatchObject({ allowed: true, count: 10, remaining: 0 });
  });

  test("public AI actions reject once the monthly quota is exhausted", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-action-quota-user";

    for (let i = 0; i < 10; i += 1) {
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

describe("one-time AI usage reset", () => {
  test("clears existing counters once and refuses to run twice", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-usage-reset-user";

    for (let i = 0; i < 4; i += 1) {
      await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "progress_metrics",
      });
    }

    await expect(
      t.mutation(internal.ai.usage.resetMonthlyUsageOnce, {}),
    ).resolves.toMatchObject({ alreadyRan: false, cleared: 1 });

    await expect(
      t
        .withIdentity({ tokenIdentifier: userId })
        .query(api.ai.usage.getMonthlyUsage, {}),
    ).resolves.toMatchObject({ count: 0, remaining: 10 });

    // A second run must not hand out another free allowance.
    await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
      userId,
      source: "progress_metrics",
    });
    await expect(
      t.mutation(internal.ai.usage.resetMonthlyUsageOnce, {}),
    ).resolves.toMatchObject({ alreadyRan: true, cleared: 0 });
    await expect(
      t
        .withIdentity({ tokenIdentifier: userId })
        .query(api.ai.usage.getMonthlyUsage, {}),
    ).resolves.toMatchObject({ count: 1 });
  });
});
