import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("purgeDeletedUserData", () => {
  test("handles user with no data cleanly", async () => {
    const t = convexTest(schema, modules);
    const userId = "https://example.convex.site|user_empty";

    const result = await t.mutation(internal.users.users.purgeDeletedUserData, { userId });
    expect(result.done).toBe(true);
    expect(result.deleted).toBe(0);
  });

  test("purges onboarding profiles and other user data for deleted user", async () => {
    const t = convexTest(schema, modules);
    const userId = "https://example.convex.site|user_123";

    await t.run(async (ctx) => {
      await ctx.db.insert("onboardingProfiles", {
        userId,
        age: 25,
        heightCm: 175,
        goal: "build",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("userPreferences", {
        userId,
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("repeatMeals", {
        userId,
        name: "Breakfast repeat",
        meal: "breakfast",
        hour: 8,
        minute: 0,
        enabled: true,
        entries: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const before = await t.run(async (ctx) => {
      const profiles = await ctx.db
        .query("onboardingProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const prefs = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const repeats = await ctx.db
        .query("repeatMeals")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      return { profiles, prefs, repeats };
    });
    expect(before.profiles.length).toBe(1);
    expect(before.prefs.length).toBe(1);
    expect(before.repeats.length).toBe(1);

    const result = await t.mutation(internal.users.users.purgeDeletedUserData, { userId });
    expect(result.done).toBe(true);
    expect(result.deleted).toBeGreaterThanOrEqual(3);

    const after = await t.run(async (ctx) => {
      const profiles = await ctx.db
        .query("onboardingProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const prefs = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const repeats = await ctx.db
        .query("repeatMeals")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      return { profiles, prefs, repeats };
    });
    expect(after.profiles.length).toBe(0);
    expect(after.prefs.length).toBe(0);
    expect(after.repeats.length).toBe(0);
  });
});
