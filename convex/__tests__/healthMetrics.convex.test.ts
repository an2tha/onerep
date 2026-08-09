import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const TODAY = "2026-08-09";

function asUser(t: ReturnType<typeof convexTest>, subject = "user_metrics") {
  return t.withIdentity({ subject, issuer: "test", tokenIdentifier: subject });
}

describe("syncing daily metrics", () => {
  test("writes one row per day and upserts on re-sync", async () => {
    const t = convexTest(schema, modules);
    const user = asUser(t);

    await user.mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [
        { date: "2026-08-08", sleepMinutes: 400, steps: 8000 },
        { date: TODAY, sleepMinutes: 420 },
      ],
    });

    // A watch writes last night's sleep hours late, so the same day is read
    // again with a fuller picture. The second read must win, not duplicate.
    const second = await user.mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [{ date: TODAY, sleepMinutes: 455, restingHeartRateBpm: 54 }],
    });
    expect(second.written).toBe(1);

    const rows = await t.run((ctx) => ctx.db.query("healthMetrics").collect());
    expect(rows).toHaveLength(2);
    const today = rows.find((row) => row.date === TODAY);
    expect(today!.sleepMinutes).toBe(455);
    expect(today!.restingHeartRateBpm).toBe(54);
  });

  test("drops implausible readings without losing the rest of the day", async () => {
    const t = convexTest(schema, modules);
    const user = asUser(t);

    await user.mutation(api.logs.healthMetrics.sync, {
      provider: "health_connect",
      days: [
        {
          date: TODAY,
          sleepMinutes: 430,
          // A badly-behaved third-party app writing nonsense would otherwise
          // poison this user's baseline for a month.
          restingHeartRateBpm: 400,
          steps: 9000,
        },
      ],
    });

    const row = await t.run((ctx) => ctx.db.query("healthMetrics").first());
    expect(row!.restingHeartRateBpm).toBeUndefined();
    expect(row!.sleepMinutes).toBe(430);
    expect(row!.steps).toBe(9000);
  });

  test("a day with nothing usable is not worth a document", async () => {
    const t = convexTest(schema, modules);
    const user = asUser(t);

    const result = await user.mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [
        { date: TODAY, sleepMinutes: 0 },
        { date: "not-a-date", sleepMinutes: 400 },
      ],
    });

    expect(result.written).toBe(0);
    expect(await t.run((ctx) => ctx.db.query("healthMetrics").collect())).toEqual(
      [],
    );
  });

  test("one user's readings never reach another's baseline", async () => {
    const t = convexTest(schema, modules);
    await asUser(t, "user_a").mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [{ date: TODAY, sleepMinutes: 400 }],
    });

    const other = await asUser(t, "user_b").query(
      api.logs.healthMetrics.recovery,
      { today: TODAY },
    );
    expect(other).toBeNull();
  });

  test("signing out means no readings, not somebody else's", async () => {
    const t = convexTest(schema, modules);
    await asUser(t).mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [{ date: TODAY, sleepMinutes: 400 }],
    });

    expect(
      await t.query(api.logs.healthMetrics.recovery, { today: TODAY }),
    ).toBeNull();
  });
});

describe("recovery reaching the coach", () => {
  /** Three weeks of steady nights, with the last three cut short. */
  async function seedTiredUser(
    t: ReturnType<typeof convexTest>,
    userId: string,
  ) {
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId,
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
      });

      for (let index = 20; index >= 0; index -= 1) {
        const date = new Date(`${TODAY}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - index);
        const tired = index < 3;
        await ctx.db.insert("healthMetrics", {
          userId,
          date: date.toISOString().slice(0, 10),
          provider: "apple_health",
          sleepMinutes: tired ? 360 : 450,
          restingHeartRateBpm: tired ? 61 : 55,
          syncedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });
  }

  test("the workspace carries the verdict and the sentences", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-tired");

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-tired",
      today: TODAY,
    });

    expect(workspace.recovery.status).toBe("compromised");
    expect(workspace.recovery.notes.length).toBeGreaterThan(0);
    expect(workspace.recovery.sleep.baseline).toBe(450);
  });

  test("recovery is behind the privacy gate with the rest of the inference", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-tired-private");
    await t.run(async (ctx) => {
      const prefs = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", "user-tired-private"))
        .unique();
      await ctx.db.patch(prefs!._id, {
        privacySettings: {
          analyticsEnabled: true,
          personalizedInsightsEnabled: false,
        },
      });
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-tired-private",
      today: TODAY,
    });

    expect(workspace).not.toHaveProperty("recovery");
    expect(workspace.omitted).toContain("recovery");
  });

  test("a user with no watch gets null rather than a shrug", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId: "user-nowatch",
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
      });
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-nowatch",
      today: TODAY,
    });
    expect(workspace.recovery).toBeNull();
  });
});
