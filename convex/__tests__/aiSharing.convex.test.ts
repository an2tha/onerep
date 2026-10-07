import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { AI_SHARING_VERSION, isAiSharingEnabled } from "../lib/aiSharing";
const modules = import.meta.glob("../**/*.ts");

describe("AI data sharing consent", () => {
  test("AI is on by default without writing a consent record", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|default-ai";
    const user = t.withIdentity({ tokenIdentifier: userId });
    expect(isAiSharingEnabled()).toBe(true);
    expect(isAiSharingEnabled(null)).toBe(true);
    await expect(t.query(internal.ai.usage.isSharingAllowed, { userId })).resolves.toBe(true);
    for (const provider of [undefined, "typesafe"] as const) {
      await expect(t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId, source: "workout_preset", ...(provider ? { provider } : {}),
      })).resolves.toMatchObject({ allowed: true });
    }
    await expect(user.query(api.users.users.getPreferences, {})).resolves.toBe(null);
    await expect(user.query(api.ai.usage.getMonthlyUsage, {})).resolves.toMatchObject({ count: 2 });
  });

  test.each([0, 1, 2, 3, AI_SHARING_VERSION, 5])("version %i opt-outs block both providers without spending quota", async (version) => {
    const t = convexTest(schema, modules);
    const userId = `test|opt-out-${version}`;
    const user = t.withIdentity({ tokenIdentifier: userId });
    await user.mutation(api.ai.usage.setSharingConsent, { granted: false, version });
    expect(isAiSharingEnabled({ granted: false, version })).toBe(false);
    await expect(t.query(internal.ai.usage.isSharingAllowed, { userId })).resolves.toBe(false);
    for (const provider of [undefined, "typesafe"] as const) {
      await expect(t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId, source: "workout_preset", ...(provider ? { provider } : {}),
      })).rejects.toThrow("Allow AI data sharing");
    }
    await expect(user.query(api.ai.usage.getMonthlyUsage, {})).resolves.toMatchObject({ count: 0 });
    await user.mutation(api.ai.usage.setSharingConsent, { granted: true, version });
    expect(isAiSharingEnabled({ granted: true, version })).toBe(true);
    for (const provider of [undefined, "typesafe"] as const) {
      await expect(t.mutation(internal.ai.usage.consumeMonthlyQuota, {
        userId, source: "workout_preset", ...(provider ? { provider } : {}),
      })).resolves.toMatchObject({ allowed: true });
    }
  });

  test("the setting belongs to the authenticated account", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.ai.usage.setSharingConsent, {
      granted: false, version: AI_SHARING_VERSION,
    })).rejects.toThrow("Unauthenticated");
    const userId = "test|off";
    await t.withIdentity({ tokenIdentifier: userId }).mutation(api.ai.usage.setSharingConsent, {
      granted: false, version: AI_SHARING_VERSION,
    });
    await expect(t.query(internal.ai.usage.isSharingAllowed, { userId })).resolves.toBe(false);
    await expect(t.query(internal.ai.usage.isSharingAllowed, { userId: "test|other" })).resolves.toBe(true);
  });

  test("a preference row without an AI choice uses the default", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|existing-account";
    await t.run(async ctx => {
      await ctx.db.insert("userPreferences", { userId, lastActiveTimezone: "Europe/Berlin", updatedAt: 1 });
    });
    await expect(t.query(internal.ai.usage.isSharingAllowed, { userId })).resolves.toBe(true);
    const user = t.withIdentity({ tokenIdentifier: userId });
    await user.mutation(api.ai.usage.setSharingConsent, { granted: false, version: 2 });
    await expect(user.query(api.users.users.getPreferences, {})).resolves.toMatchObject({
      lastActiveTimezone: "Europe/Berlin", aiSharingConsent: { granted: false, version: 2 },
    });
  });

  test("general consent and a personal API key do not override an opt-out", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|legacy-ai-consent";
    await t.run(async (ctx) => {
      await ctx.db.insert("onboardingProfiles", {
        userId, age: 28, heightCm: 172, goal: "build", updatedAt: Date.now(),
        consent: { dataUse: true, weightData: true, foodLogging: true, wearableIntegrations: true },
      });
      await ctx.db.insert("aiKeys", { userId, key: "test-key", last4: "-key", updatedAt: Date.now() });
    });
    await t.withIdentity({ tokenIdentifier: userId }).mutation(api.ai.usage.setSharingConsent, {
      granted: false, version: AI_SHARING_VERSION,
    });
    await expect(t.mutation(internal.ai.usage.consumeMonthlyQuota, { userId, source: "progress_metrics" }))
      .rejects.toThrow("Allow AI data sharing");
  });

  test("temporary permission rollback preserves live preferences and subsequent consent choices", async () => {
    const t = convexTest(schema, modules);
    const temporary = { granted: true, version: AI_SHARING_VERSION, updatedAt: 200 };
    const previous = { granted: true, version: 2, updatedAt: 100 };
    const ids = await t.run(async ctx => Promise.all([
      ctx.db.insert("userPreferences", { userId: "test|unchanged", lastActiveTimezone: "UTC", aiSharingConsent: temporary, updatedAt: 200 }),
      ctx.db.insert("userPreferences", { userId: "test|live-edit", lastActiveTimezone: "Europe/Berlin", aiSharingConsent: temporary, updatedAt: 300 }),
      ctx.db.insert("userPreferences", { userId: "test|revoked", lastActiveTimezone: "UTC", aiSharingConsent: { ...temporary, granted: false, updatedAt: 300 }, updatedAt: 300 }),
      ctx.db.insert("userPreferences", { userId: "test|reconsented", lastActiveTimezone: "UTC", aiSharingConsent: { ...temporary, updatedAt: 300 }, updatedAt: 300 }),
      ctx.db.insert("userPreferences", { userId: "test|created", lastActiveTimezone: "UTC", aiSharingConsent: temporary, updatedAt: 200 }),
      ctx.db.insert("userPreferences", { userId: "test|created-edited", lastActiveTimezone: "Europe/Berlin", aiSharingConsent: temporary, updatedAt: 300 }),
    ]));
    const result = await t.mutation(internal.ai.usage.restoreTemporarySharingConsent, {
      entries: ids.map((preferenceId, index) => ({ preferenceId, expectedConsent: temporary,
        ...(index === 0 ? { previousConsent: previous } : {}),
        ...(index < 4 ? { previousUpdatedAt: 100 } : {}), createdByRepair: index >= 4 })),
    });
    expect(result).toEqual({ restored: 4, deleted: 1, skipped: 2 });
    const rows = await t.run(async ctx => Promise.all(ids.map(id => ctx.db.get("userPreferences", id))));
    expect(rows[0]).toMatchObject({ aiSharingConsent: previous, updatedAt: 100 });
    expect(rows[1]).toMatchObject({ lastActiveTimezone: "Europe/Berlin", updatedAt: 300 });
    expect(rows[1]?.aiSharingConsent).toBeUndefined();
    expect(rows[2]?.aiSharingConsent).toMatchObject({ granted: false, updatedAt: 300 });
    expect(rows[3]?.aiSharingConsent).toMatchObject({ granted: true, updatedAt: 300 });
    expect(rows[4]).toBeNull();
    expect(rows[5]).toMatchObject({ lastActiveTimezone: "Europe/Berlin", updatedAt: 300 });
    expect(rows[5]?.aiSharingConsent).toBeUndefined();
  });

  test("scheduled reviews stop before contacting providers after an opt-out", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ tokenIdentifier: "test|no-review-consent" }).mutation(api.ai.usage.setSharingConsent, {
      granted: false, version: AI_SHARING_VERSION,
    });
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
