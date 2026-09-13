/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
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
