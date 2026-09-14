import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { AI_SHARING_VERSION } from "../lib/aiSharing";
const modules = import.meta.glob("../**/*.ts");

describe("AI data sharing consent", () => {
  test("missing, stale, and revoked consent block requests without spending quota", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|ai-consent";
    const user = t.withIdentity({ tokenIdentifier: userId });
    const consume = () =>
      t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId,
        source: "food_snap",
      });
    await expect(consume()).rejects.toThrow("Allow AI data sharing");
    await user.mutation(api.ai.usage.setSharingConsent, {
      granted: true,
      version: AI_SHARING_VERSION,
    });
    await expect(consume()).resolves.toMatchObject({ allowed: true, count: 1 });
    await user.mutation(api.ai.usage.setSharingConsent, {
      granted: false,
      version: AI_SHARING_VERSION,
    });
    await expect(consume()).rejects.toThrow("Allow AI data sharing");
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.patch(row!._id, {
        aiSharingConsent: { granted: true, version: 0, updatedAt: Date.now() },
      });
    });
    await expect(consume()).rejects.toThrow("Allow AI data sharing");
    await expect(
      user.query(api.ai.usage.getMonthlyUsage, {}),
    ).resolves.toMatchObject({ count: 1 });
  });

  test("permission belongs to the authenticated account and requires the current disclosure", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.ai.usage.setSharingConsent, {
        granted: true,
        version: AI_SHARING_VERSION,
      }),
    ).rejects.toThrow("Unauthenticated");
    const user = t.withIdentity({ tokenIdentifier: "test|consenting" });
    await expect(
      user.mutation(api.ai.usage.setSharingConsent, {
        granted: true,
        version: 0,
      }),
    ).rejects.toThrow("current AI sharing disclosure");
    await user.mutation(api.ai.usage.setSharingConsent, {
      granted: true,
      version: AI_SHARING_VERSION,
    });
    await expect(
      t.query(internal.ai.usage.isSharingAllowed, {
        userId: "test|consenting",
      }),
    ).resolves.toBe(true);
    await expect(
      t.query(internal.ai.usage.isSharingAllowed, { userId: "test|other" }),
    ).resolves.toBe(false);
  });

  test("general consent and a personal API key do not opt users into AI", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|legacy-ai-consent";
    await t.run(async (ctx) => {
      await ctx.db.insert("onboardingProfiles", {
        userId, age: 28, heightCm: 172, goal: "build", updatedAt: Date.now(),
        consent: { dataUse: true, weightData: true, foodLogging: true, wearableIntegrations: true },
      });
      await ctx.db.insert("aiKeys", { userId, key: "test-key", last4: "-key", updatedAt: Date.now() });
    });
    await expect(t.mutation(internal.ai.usage.consumeMonthlyQuota, { userId, source: "progress_metrics" }))
      .rejects.toThrow("Allow AI data sharing");
  });

  test("scheduled reviews stop before contacting providers without permission", async () => {
    const t = convexTest(schema, modules);
    const previous = process.env.COACH_PROACTIVE_ENABLED;
    process.env.COACH_PROACTIVE_ENABLED = "true";
    try {
      await expect(t.action(internal.ai.weeklyReview.generateForUser, {
        userId: "test|no-review-consent", today: "2026-09-14",
      })).resolves.toEqual({ generated: false });
    } finally {
      if (previous === undefined) delete process.env.COACH_PROACTIVE_ENABLED;
      else process.env.COACH_PROACTIVE_ENABLED = previous;
    }
  });

});
