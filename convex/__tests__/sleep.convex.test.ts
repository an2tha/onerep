/// <reference types="vite/client" />
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
const modules = import.meta.glob("../**/*.ts");
const date = "2026-09-10";
const identity = {
  subject: "sleep-test",
  issuer: "test",
  tokenIdentifier: "sleep-test",
};
describe("sleep and strain data", () => {
  test("stage sync survives without custom metrics and updates nightly data", async () => {
    const t = convexTest(schema, modules),
      user = t.withIdentity(identity);
    await user.mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [
        {
          date,
          sleepMinutes: 500,
          readings: {
            sleepDeepMinutes: 80,
            sleepRemMinutes: 110,
            sleepLightMinutes: 290,
            mainSleepMinutes: 480,
            napMinutes: 20,
            sleepAwakeMinutes: 30,
          },
        },
      ],
    });
    const data = await user.query(api.logs.sleep.dashboard, { date });
    expect(data?.sleep?.minutes).toBe(480);
    expect(data?.sleep?.napMinutes).toBe(20);
    expect(data?.sleep?.stages).toHaveLength(3);
    expect(data?.preferences.automaticReview).toBe(false);
    expect(
      await t
        .withIdentity({
          subject: "other",
          issuer: "test",
          tokenIdentifier: "other",
        })
        .query(api.logs.sleep.dashboard, { date }),
    ).toMatchObject({ sleep: null });
  });
  test("linked imported workouts are counted once", async () => {
    const t = convexTest(schema, modules),
      user = t.withIdentity(identity);
    await t.run(async (ctx) => {
      await ctx.db.insert("workoutLogs", {
        userId: identity.subject,
        date,
        sessionId: "s1",
        exercises: [],
        durationSeconds: 3600,
        completedAt: 1,
      });
      await ctx.db.insert("healthWorkouts", {
        userId: identity.subject,
        date,
        provider: "apple_health",
        externalId: "external",
        activityType: "running",
        activityName: "Run",
        startedAt: 1,
        endedAt: 3600001,
        durationSeconds: 3600,
        linkedSessionId: "s1",
        linkedDate: date,
        activeEnergyKcal: 500,
        importedAt: 1,
        updatedAt: 1,
      });
    });
    expect(
      (await user.query(api.logs.sleep.dashboard, { date }))?.strain.workouts,
    ).toHaveLength(1);
  });
  test("review claims deduplicate concurrent sync jobs and reject stale completion", async () => {
    const t = convexTest(schema, modules);
    const args = {
      userId: identity.subject,
      date,
      fingerprint: "v1",
      force: false,
    };
    const id = await t.mutation(internal.logs.sleep.claimReview, args);
    expect(id).not.toBeNull();
    expect(await t.mutation(internal.logs.sleep.claimReview, args)).toBeNull();
    await t.mutation(internal.logs.sleep.finishReview, {
      id: id!,
      fingerprint: "wrong",
      review: "stale",
    });
    expect(await t.run((ctx) => ctx.db.get(id!))).toMatchObject({
      status: "pending",
    });
    await t.mutation(internal.logs.sleep.finishReview, {
      id: id!,
      fingerprint: "v1",
      review: "Your review",
    });
    expect(await t.run((ctx) => ctx.db.get(id!))).toMatchObject({
      status: "ready",
      review: "Your review",
    });
  });
  test("sleep review history is private, newest first, and excludes failed reviews", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const row of [
        {
          userId: identity.subject,
          date: "2026-09-08",
          status: "ready" as const,
          review: "Earlier advice",
        },
        {
          userId: identity.subject,
          date: "2026-09-09",
          status: "error" as const,
          error: "failed",
        },
        {
          userId: identity.subject,
          date: "2026-09-10",
          status: "ready" as const,
          review: "Newest advice",
        },
        {
          userId: "other",
          date: "2026-09-11",
          status: "ready" as const,
          review: "Private advice",
        },
      ]) {
        await ctx.db.insert("sleepReviews", {
          ...row,
          fingerprint: row.date,
          updatedAt: Date.now(),
        });
      }
    });

    const reviews = await t
      .withIdentity(identity)
      .query(api.logs.sleep.reviewHistory, { limit: 30 });
    expect(reviews.map((review) => review.review)).toEqual([
      "Newest advice",
      "Earlier advice",
    ]);
  });
  test("invalid dates and goals are rejected", async () => {
    const t = convexTest(schema, modules),
      user = t.withIdentity(identity);
    await expect(
      user.query(api.logs.sleep.dashboard, { date: "2026-02-31" }),
    ).rejects.toThrow();
    await expect(
      user.mutation(api.logs.sleep.preferences, {
        automaticReview: true,
        targetMinutes: 60,
      }),
    ).rejects.toThrow();
  });
  test("manual sleep correction cannot retain contradictory stage data", async () => {
    const t = convexTest(schema, modules),
      user = t.withIdentity(identity);
    await user.mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [
        {
          date,
          sleepMinutes: 500,
          readings: { mainSleepMinutes: 480, sleepDeepMinutes: 80 },
        },
      ],
    });
    await user.mutation(api.logs.healthMetrics.setDailyMetric, {
      date,
      field: "sleepMinutes",
      value: 360,
    });
    await user.mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [
        {
          date,
          sleepMinutes: 500,
          readings: { mainSleepMinutes: 480, sleepDeepMinutes: 80 },
        },
      ],
    });
    const data = await user.query(api.logs.sleep.dashboard, { date });
    expect(data?.sleep?.minutes).toBe(360);
    expect(data?.sleep?.stages).toEqual([]);
  });
});

describe("dated goals and summary preferences", () => {
  test("changing a goal takes effect tomorrow and cannot regrade earlier nights", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
    try {
      const t = convexTest(schema, modules),
        user = t.withIdentity(identity);
      await t.run(async (ctx) => {
        await ctx.db.insert("sleepPreferences", {
          userId: identity.subject,
          automaticReview: false,
          targetMinutes: 510,
        });
        for (const date of ["2026-09-09", "2026-09-10", "2026-09-11"])
          await ctx.db.insert("healthMetrics", {
            userId: identity.subject,
            date,
            provider: "apple_health",
            sleepMinutes: 480,
            syncedAt: Date.now(),
            updatedAt: Date.now(),
          });
      });
      const before = await user.query(api.logs.sleep.dashboard, { date });
      const result = await user.mutation(api.logs.sleep.preferences, {
        targetMinutes: 540,
        automaticReview: false,
        bedtimeMinutes: 1380,
        wakeMinutes: 480,
      });
      expect(result.effectiveDate).toBe("2026-09-11");
      const after = await user.query(api.logs.sleep.dashboard, { date });
      expect(after?.sleep?.score).toBe(before?.sleep?.score);
      expect(after?.sleep?.target).toBe(510);
      expect(
        after?.history.find((d) => d.date === "2026-09-09")?.sleep?.target,
      ).toBe(510);
      expect(
        (await user.query(api.logs.sleep.dashboard, { date: "2026-09-11" }))
          ?.sleep?.target,
      ).toBe(540);
      // Editing the pending goal on the same day replaces one event.
      await user.mutation(api.logs.sleep.preferences, {
        targetMinutes: 450,
        automaticReview: true,
      });
      expect(
        (await t.run((ctx) => ctx.db.query("sleepGoalHistory").take(10)))
          .length,
      ).toBe(1);
      expect(
        (await user.query(api.logs.sleep.dashboard, { date: "2026-09-11" }))
          ?.sleep?.target,
      ).toBe(450);
      expect(
        (await user.query(api.logs.sleep.dashboard, { date }))?.preferences
          .bedtimeMinutes,
      ).toBe(1380);
      const other = t.withIdentity({
        subject: "other",
        issuer: "test",
        tokenIdentifier: "other",
      });
      expect(
        (
          await other.query(api.logs.sleep.dashboard, { date: "2026-09-11" })
        )?.history.at(-1)?.target,
      ).toBe(480);
    } finally {
      vi.useRealTimers();
    }
  });
  test("goal effective date follows the user's timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T23:30:00Z"));
    try {
      const t = convexTest(schema, modules),
        user = t.withIdentity(identity);
      await t.run((ctx) =>
        ctx.db.insert("userPreferences", {
          userId: identity.subject,
          lastActiveTimezone: "Europe/Berlin",
          updatedAt: Date.now(),
        }),
      );
      expect(
        (
          await user.mutation(api.logs.sleep.preferences, {
            targetMinutes: 510,
            automaticReview: false,
          })
        ).effectiveDate,
      ).toBe("2026-09-12");
    } finally {
      vi.useRealTimers();
    }
  });
  test("summary controls persist and reject duplicate or incomplete order", async () => {
    const t = convexTest(schema, modules),
      user = t.withIdentity(identity);
    const settings = {
      order: ["nutrition", "sleep", "checkIn", "training"] as const,
      hidden: ["training"] as const,
    };
    await user.mutation(api.logs.sleep.setTodayInsights, {
      order: [...settings.order],
      hidden: [...settings.hidden],
    });
    expect(
      (await user.query(api.users.users.getPreferences, {}))?.todayInsights,
    ).toEqual(settings);
    await expect(
      user.mutation(api.logs.sleep.setTodayInsights, {
        order: ["sleep", "sleep", "nutrition", "training"],
        hidden: [],
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.logs.sleep.setTodayInsights, {
        order: [...settings.order],
        hidden: [],
      }),
    ).rejects.toThrow();
  });
});

describe("Sleep and Today alongside hydration and imported nutrition", () => {
  test("summary customization and hydration settings preserve each other", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    const settings = {
      order: ["nutrition", "sleep", "checkIn", "training"] as const,
      hidden: ["training"] as const,
    };
    await user.mutation(api.users.users.setHydrationEnabled, {
      enabled: false,
    });
    await user.mutation(api.logs.sleep.setTodayInsights, {
      order: [...settings.order],
      hidden: [...settings.hidden],
    });
    expect(await user.query(api.users.users.getPreferences, {})).toMatchObject({
      hydrationEnabled: false,
      todayInsights: settings,
    });
    await user.mutation(api.users.users.setHydrationEnabled, { enabled: true });
    expect(await user.query(api.users.users.getPreferences, {})).toMatchObject({
      hydrationEnabled: true,
      todayInsights: settings,
    });
  });

  test("external intake stays separate while logged drinks count as a food day", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await user.mutation(api.logs.healthMetrics.sync, {
      provider: "health_connect",
      days: [{ date, sleepMinutes: 390 }],
    });
    const before = await user.query(api.logs.sleep.dashboard, { date });
    await user.mutation(api.logs.externalIntake.sync, {
      provider: "health_connect",
      days: [
        {
          date,
          nutrients: { dietaryEnergyKcal: 800, hydrationMl: 1000 },
          sources: ["Other app"],
        },
      ],
    });
    const imported = await user.query(api.logs.sleep.dashboard, { date });
    expect(imported?.sleep?.score).toBe(before?.sleep?.score);
    expect(imported?.sleep?.minutes).toBe(390);
    expect(imported?.connectedReview.foodDays).toBe(0);
    await user.mutation(api.logs.foodLogs.addEntry, {
      date,
      entry: {
        id: "coffee",
        name: "Coffee",
        meal: "breakfast",
        loggedAt: `${date}T08:00:00Z`,
        calories: 20,
        protein: 1,
        carbs: 2,
        fat: 1,
        hydrationMl: 330,
      },
    });
    const logged = await user.query(api.logs.sleep.dashboard, { date });
    expect(logged?.connectedReview.foodDays).toBe(1);
    expect(logged?.sleep?.score).toBe(before?.sleep?.score);
    expect(
      await user.query(api.logs.externalIntake.forDate, { date }),
    ).toMatchObject({
      nutrients: { dietaryEnergyKcal: 800, hydrationMl: 1000 },
    });
  });
});
