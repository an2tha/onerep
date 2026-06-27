import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";

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
