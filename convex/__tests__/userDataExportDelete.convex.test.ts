import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { defaultProgrammeSettings } from "../../packages/models/src/guided-programme";
import { api, internal } from "../_generated/api";
import { AI_SHARING_VERSION } from "../lib/aiSharing";

const modules = import.meta.glob("../**/*.ts");

const mealPresetArgs = {
  name: "Usual Breakfast",
  meal: "breakfast",
  signature: "oats|coffee",
  entries: [
    {
      name: "Oats",
      calories: 230,
      protein: 8,
      carbs: 38,
      fat: 4,
    },
  ],
};

describe("user data export and deletion", () => {
  test("exports and deletes meal presets and AI usage", async () => {
    const t = convexTest(schema, modules);
    const userId = "test|data-export-delete-user";
    const authed = t.withIdentity({ tokenIdentifier: userId });

    await authed.mutation(api.logs.mealPresets.create, mealPresetArgs);
    await authed.mutation(api.ai.usage.setSharingConsent, {
      granted: true,
      version: AI_SHARING_VERSION,
    });
    await t.mutation(internal.ai.usage.consumeMonthlyQuota, {
      userId,
      source: "progress_metrics",
    });

    const exported = await authed.query(api.users.users.exportMyData, {});
    expect(exported.data.mealPresets).toHaveLength(1);
    expect(exported.data.mealPresets[0]).toMatchObject({
      name: "Usual Breakfast",
      signature: "oats|coffee",
    });
    expect(exported.data.aiUsage).toHaveLength(1);
    expect(exported.data.aiUsage[0]).toMatchObject({ count: 1 });

    await expect(
      authed.mutation(api.users.users.deleteMyDataBatch, { batchSize: 50 }),
    ).resolves.toMatchObject({ remaining: false });

    await t.run(async (ctx) => {
      const [mealPresets, aiUsage] = await Promise.all([
        ctx.db
          .query("mealPresets")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("aiUsage")
          .withIndex("by_userId_month", (q) => q.eq("userId", userId))
          .collect(),
      ]);

      expect(mealPresets).toEqual([]);
      expect(aiUsage).toEqual([]);
    });
  });
});


test("programme drafts, generations, and check-ins export and delete only for their owner", async () => {
  const t = convexTest(schema, modules);
  const ownerId = "test|programmes-data-owner";
  const otherId = "test|programmes-data-other";
  const owner = t.withIdentity({ tokenIdentifier: ownerId });
  await t.run(async ctx => {
    for (const userId of [ownerId, otherId]) {
      const programmeId = await ctx.db.insert("guidedProgrammes", {
        userId, track: "training", status: "draft",
        settings: { ...defaultProgrammeSettings(), name: "My training" },
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      await ctx.db.insert("guidedProgrammeGenerations", {
        userId, programmeId, requestId: `request-${userId}`, status: "failed",
        month: "2026-10", settingsFingerprint: JSON.stringify(defaultProgrammeSettings()), attempt: 1, createdAt: Date.now(), updatedAt: Date.now(),
      });
      await ctx.db.insert("guidedProgrammeCheckIns", {
        userId, programmeId, adherence: 3, difficulty: 3, enjoyment: 4,
        scheduleFits: true, notes: "Keep this routine",
        suggestion: { title: "Keep going", reason: "The schedule fits", kind: "keep" },
        status: "pending", planUpdatedAt: Date.now(), createdAt: Date.now(),
      });
    }
  });
  const exported = await owner.query(api.users.users.exportMyData, {});
  for (const rows of [exported.data.guidedProgrammes, exported.data.guidedProgrammeGenerations, exported.data.guidedProgrammeCheckIns]) {
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(ownerId);
  }
  await owner.mutation(api.users.users.deleteMyDataBatch, { batchSize: 50 });
  await t.run(async ctx => {
    for (const table of ["guidedProgrammes", "guidedProgrammeGenerations", "guidedProgrammeCheckIns"] as const) {
      expect(await ctx.db.query(table).withIndex("by_userId", q => q.eq("userId", ownerId)).take(10)).toHaveLength(0);
      expect(await ctx.db.query(table).withIndex("by_userId", q => q.eq("userId", otherId)).take(10)).toHaveLength(1);
    }
  });
});
