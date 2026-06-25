import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("onboarding Convex functions", () => {
  test("get throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.onboarding.get, {})).rejects.toThrow();
  });

  test("save throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.onboarding.save, {
        age: 25,
        heightCm: 170,
        goal: "lose",
      }),
    ).rejects.toThrow();
  });

  test("clear throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.onboarding.clear, {})).rejects.toThrow();
  });

  test("stores onboarding profile correctly", async () => {
    const t = convexTest(schema, modules);
    const userId = "onboarding-test-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("onboardingProfiles", {
        userId,
        age: 28,
        heightCm: 172,
        goal: "build",
        updatedAt: Date.now(),
      });
    });

    const profile = await t.run(async (ctx) => {
      return ctx.db
        .query("onboardingProfiles")
        .filter((q) => q.eq(q.field("userId"), userId))
        .unique();
    });

    expect(profile).not.toBeNull();
    expect(profile!.age).toBe(28);
    expect(profile!.heightCm).toBe(172);
    expect(profile!.goal).toBe("build");
  });

  test("updates onboarding profile (upsert pattern)", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("onboardingProfiles", {
        userId: "onboarding-update-user",
        age: 25,
        heightCm: 168,
        goal: "health",
        updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, { age: 26, goal: "lose", updatedAt: Date.now() });
    });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.age).toBe(26);
    expect(updated!.goal).toBe("lose");
    expect(updated!.heightCm).toBe(168);
  });

  test("get tolerates duplicate onboarding profiles", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "duplicate-onboarding-user" }, async () => {
      const user = await t.query(api.users.users.getCurrentUser, {});
      expect(user).not.toBeNull();

      await t.run(async (ctx) => {
        await ctx.db.insert("onboardingProfiles", {
          userId: user!._id,
          age: 31,
          heightCm: 171,
          goal: "health",
          updatedAt: Date.now() - 1_000,
        });
        await ctx.db.insert("onboardingProfiles", {
          userId: user!._id,
          age: 32,
          heightCm: 172,
          goal: "performance",
          updatedAt: Date.now(),
        });
      });

      const profile = await t.query(api.users.onboarding.get, {});

      expect(profile).not.toBeNull();
      expect(profile!.age).toBe(32);
      expect(profile!.heightCm).toBe(172);
      expect(profile!.goal).toBe("performance");
    });
  });

  test("save updates the newest onboarding profile and removes duplicates", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "dedupe-onboarding-user" }, async () => {
      const user = await t.query(api.users.users.getCurrentUser, {});
      expect(user).not.toBeNull();

      await t.run(async (ctx) => {
        await ctx.db.insert("onboardingProfiles", {
          userId: user!._id,
          age: 24,
          heightCm: 168,
          goal: "health",
          updatedAt: Date.now() - 1_000,
        });
        await ctx.db.insert("onboardingProfiles", {
          userId: user!._id,
          age: 25,
          heightCm: 169,
          goal: "build",
          updatedAt: Date.now(),
        });
      });

      await t.mutation(api.users.onboarding.save, {
        age: 26,
        heightCm: 170,
        goal: "lose",
      });

      const profiles = await t.run(async (ctx) => {
        return await ctx.db
          .query("onboardingProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", user!._id))
          .collect();
      });

      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toMatchObject({
        userId: user!._id,
        age: 26,
        heightCm: 170,
        goal: "lose",
      });
    });
  });

  test("deletes onboarding profile", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("onboardingProfiles", {
        userId: "onboarding-delete-user",
        age: 22,
        heightCm: 175,
        goal: "performance",
        updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => ctx.db.delete(id));
    const deleted = await t.run(async (ctx) => ctx.db.get(id));
    expect(deleted).toBeNull();
  });

  test("all accepted goal values are stored correctly", async () => {
    const t = convexTest(schema, modules);
    const goals = ["lose", "build", "health", "performance"];

    for (const goal of goals) {
      const id = await t.run(async (ctx) => {
        return ctx.db.insert("onboardingProfiles", {
          userId: `user-goal-${goal}`,
          age: 25,
          heightCm: 170,
          goal,
          updatedAt: Date.now(),
        });
      });

      const stored = await t.run(async (ctx) => ctx.db.get(id));
      expect(stored!.goal).toBe(goal);
      await t.run(async (ctx) => ctx.db.delete(id));
    }
  });
});
