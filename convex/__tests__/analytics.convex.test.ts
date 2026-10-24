import { afterEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import betterAuth from "@convex-dev/better-auth/test";
import schema from "../schema";
import { api, components, internal } from "../_generated/api";
import {
  createAnalyticsAccumulator,
  excludedAnalyticsAccount,
} from "../lib/internalAnalytics";

const modules = import.meta.glob("../**/*.ts");
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-24T12:00:00Z");
const SIGNUP = Date.parse("2026-09-07T12:00:00Z");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("internal analytics calculations", () => {
  test("weekly activity deduplicates loggers and rolling comparisons respect window boundaries", () => {
    const a = createAnalyticsAccumulator(NOW);
    for (const [userId, days] of [
      ["a", 7],
      ["b", 14],
      ["c", 30],
      ["d", 60],
    ] as const) {
      a.account({ userId, signupAt: NOW - days * DAY, excluded: false });
    }
    for (const [userId, loggedAt] of [
      ["a", NOW - 7 * DAY],
      ["a", NOW - 7 * DAY - 1],
      ["a", NOW - 30 * DAY],
      ["b", NOW - 60 * DAY],
      ["c", NOW],
      ["a", NOW + DAY],
    ] as const) {
      a.workout({ userId, loggedAt, date: "2026-10-01" });
    }
    const report = a.finish();
    expect(report.comparisons).toEqual({
      signups7: 1,
      signupsPrevious7: 1,
      signups30: 3,
      signupsPrevious30: 1,
      activePrevious7: 1,
      activePrevious30: 1,
    });
    expect(report.totals).toMatchObject({ active7: 2, active30: 2 });
    expect(report.weekly).toHaveLength(26);
    expect(
      report.weekly.find((week) => week.week === "2026-10-12"),
    ).toMatchObject({ signups: 1, activeUsers: 1, partial: false });
    expect(report.weekly.at(-1)).toMatchObject({
      week: "2026-10-19",
      signups: 0,
      activeUsers: 1,
      partial: true,
    });
  });

  test("unknown dates do not become zero in trends or comparisons", () => {
    const a = createAnalyticsAccumulator(NOW);
    a.account({ userId: "unknown", signupAt: null, excluded: false });
    a.workout({ userId: "unknown", loggedAt: NaN, date: "2026-10-01" });
    const report = a.finish();
    expect(Object.values(report.comparisons)).toEqual(Array(6).fill(null));
    expect(
      report.weekly.every(
        (week) => week.signups === null && week.activeUsers === null,
      ),
    ).toBe(true);
    expect(
      createAnalyticsAccumulator(NOW)
        .finish()
        .weekly.every((week) => week.signups === 0 && week.activeUsers === 0),
    ).toBe(true);
  });

  test("deduplicates users and days, uses save times, and retains legacy sessions", () => {
    const a = createAnalyticsAccumulator(NOW);
    for (const userId of ["retained", "no-return", "inactive"])
      a.account({ userId, signupAt: SIGNUP, excluded: false });
    a.account({ userId: "test", signupAt: SIGNUP, excluded: true });
    for (const log of [
      { userId: "retained", loggedAt: SIGNUP, date: "2026-09-07" },
      { userId: "retained", loggedAt: SIGNUP + DAY, date: "2026-09-07" },
      { userId: "retained", loggedAt: SIGNUP + 7 * DAY, date: "2026-09-14" },
      {
        userId: "no-return",
        loggedAt: SIGNUP + 7 * DAY - 1,
        date: "2026-09-07",
      },
      { userId: "retained", loggedAt: NOW - 7 * DAY, date: "2020-01-01" },
      { userId: "no-return", loggedAt: NOW - 30 * DAY, date: "2026-09-07" },
      { userId: "test", loggedAt: NOW, date: "2026-10-24" },
      { userId: "orphan", loggedAt: NOW, date: "2026-10-24" },
    ])
      a.workout(log);
    expect(a.finish()).toMatchObject({
      totals: {
        signups: 3,
        workoutUsers: 2,
        repeatDayUsers: 1,
        active7: 1,
        active30: 2,
      },
      cohorts: [
        {
          week: "2026-09-07",
          signups: 3,
          activated: 2,
          retained: 1,
          activationStatus: "available",
          retentionStatus: "available",
        },
      ],
      quality: { excludedAccounts: 1, unlinkedWorkoutRecords: 1 },
    });
  });

  test("separates zero, missing historical dates, and immature cohorts", () => {
    const a = createAnalyticsAccumulator(NOW);
    a.account({ userId: "zero", signupAt: SIGNUP, excluded: false });
    a.account({ userId: "recent", signupAt: NOW - DAY, excluded: false });
    a.account({ userId: "unknown", signupAt: null, excluded: false });
    expect(a.finish().cohorts).toEqual([
      {
        week: "2026-10-19",
        signups: 1,
        activated: null,
        retained: null,
        activationStatus: "pending",
        retentionStatus: "pending",
      },
      {
        week: "2026-09-07",
        signups: 1,
        activated: 0,
        retained: 0,
        activationStatus: "available",
        retentionStatus: "available",
      },
    ]);
    expect(a.finish().totals).toEqual({
      signups: 3,
      workoutUsers: 0,
      repeatDayUsers: 0,
      active7: 0,
      active30: 0,
    });
    expect(a.finish().quality.unknownSignupAccounts).toBe(1);
    a.workout({ userId: "zero", loggedAt: NaN, date: "2026-02-30" });
    expect(a.finish()).toMatchObject({
      totals: {
        workoutUsers: 1,
        repeatDayUsers: null,
        active7: null,
        active30: null,
      },
      cohorts: [
        expect.anything(),
        {
          activated: null,
          retained: null,
          activationStatus: "unavailable",
          retentionStatus: "unavailable",
        },
      ],
    });
  });

  test("week-2 boundaries exclude day 14 and users who did not activate", () => {
    const a = createAnalyticsAccumulator(NOW);
    for (const userId of ["day14", "no-activation"])
      a.account({ userId, signupAt: SIGNUP, excluded: false });
    a.workout({ userId: "day14", loggedAt: SIGNUP, date: "2026-09-07" });
    a.workout({
      userId: "day14",
      loggedAt: SIGNUP + 14 * DAY,
      date: "2026-09-21",
    });
    a.workout({
      userId: "no-activation",
      loggedAt: SIGNUP + 7 * DAY,
      date: "2026-09-14",
    });
    a.workout({ userId: "day14", loggedAt: NOW + DAY, date: "2026-10-25" });
    expect(a.finish().cohorts[0]).toMatchObject({ activated: 1, retained: 0 });
    expect(a.finish().totals.active7).toBe(0);
  });

  test("excludes reserved domains and explicit accounts without guessing from names", () => {
    const excluded = (email: string, userId = "user") =>
      excludedAnalyticsAccount(
        { email, userId },
        new Set(["explicit"]),
        new Set(["qa@company.org"]),
      );
    for (const email of [
      "demo@onerep.test",
      "test@example.com",
      "TEST@SUB.EXAMPLE.ORG",
      "qa@company.org",
      "dev@localhost",
      "dev@invalid",
    ])
      expect(excluded(email)).toBe(true);
    expect(excluded("real@company.org", "explicit")).toBe(true);
    expect(excluded("contest@company.org")).toBe(false);
  });
});

describe("analytics authorization and data boundary", () => {
  test("email admins require a stored verified address, canonical identity, and live session", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://auth.one");
    vi.stubEnv("ANALYTICS_ADMIN_USER_IDS", "");
    vi.stubEnv("ANALYTICS_ADMIN_EMAILS", "ADMIN@company.org");
    const t = convexTest(schema, modules);
    betterAuth.register(t);
    const { userId, sessionId } = await t.run(async (ctx) => {
      const user = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name: "Admin",
            email: "admin@company.org",
            emailVerified: false,
            createdAt: NOW,
            updatedAt: NOW,
          },
        },
      });
      const session = await ctx.runMutation(
        components.betterAuth.adapter.create,
        {
          input: {
            model: "session",
            data: {
              userId: user._id,
              token: "test-session",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              expiresAt: Date.now() + DAY,
            },
          },
        },
      );
      return { userId: user._id, sessionId: session._id };
    });
    const identity = {
      issuer: "https://auth.one",
      subject: userId,
      tokenIdentifier: `https://auth.one|${userId}`,
      sessionId,
    };
    const admin = t.withIdentity(identity);
    expect(await admin.query(api.analytics.viewer, {})).toEqual({
      canView: false,
    });
    await expect(admin.action(api.analytics.report, {})).rejects.toThrow(
      "restricted",
    );
    await t.run((ctx) =>
      ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "_id", value: userId }],
          update: { emailVerified: true },
        },
      }),
    );
    expect(await admin.query(api.analytics.viewer, {})).toEqual({
      canView: true,
    });
    expect((await admin.action(api.analytics.report, {})).totals.signups).toBe(
      1,
    );
    expect(
      await t
        .withIdentity({
          ...identity,
          tokenIdentifier: `https://other|${userId}`,
        })
        .query(api.analytics.viewer, {}),
    ).toEqual({ canView: false });
    expect(
      await t
        .withIdentity({
          ...identity,
          email: "admin@company.org",
          sessionId: undefined,
        })
        .query(api.analytics.viewer, {}),
    ).toEqual({ canView: false });
    await t.run((ctx) =>
      ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "_id", value: userId }],
          update: { email: "member@company.org" },
        },
      }),
    );
    expect(
      await t
        .withIdentity({ ...identity, email: "admin@company.org" })
        .query(api.analytics.viewer, {}),
    ).toEqual({ canView: false });
  });

  test("denies anonymous, ordinary, and wrong-issuer users even with an admin email", async () => {
    vi.stubEnv("ANALYTICS_ADMIN_USER_IDS", "https://auth.one|admin");
    const t = convexTest(schema, modules);
    for (const client of [
      t,
      t.withIdentity({ tokenIdentifier: "https://auth.one|member" }),
      t.withIdentity({
        tokenIdentifier: "https://other|admin",
        email: "admin@company.org",
      }),
    ]) {
      expect(await client.query(api.analytics.viewer, {})).toEqual({
        canView: false,
      });
      await expect(client.action(api.analytics.report, {})).rejects.toThrow(
        "restricted",
      );
      await expect(
        client.query(internal.analytics.accountPage, {
          cursor: null,
          asOf: NOW,
        }),
      ).rejects.toThrow("restricted");
      await expect(
        client.query(internal.analytics.workoutPage, {
          cursor: null,
          asOf: NOW,
        }),
      ).rejects.toThrow("restricted");
    }
    vi.stubEnv("ANALYTICS_ADMIN_USER_IDS", "");
    expect(
      await t
        .withIdentity({ tokenIdentifier: "https://auth.one|admin" })
        .query(api.analytics.viewer, {}),
    ).toEqual({ canView: false });
  });

  test("reads paginated historical auth and legacy workout records, exposing aggregates only", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://auth.one");
    vi.stubEnv("ANALYTICS_ADMIN_USER_IDS", "https://auth.one|admin");
    vi.stubEnv("ANALYTICS_EXCLUDED_EMAILS", "qa@company.org");
    const t = convexTest(schema, modules);
    betterAuth.register(t);
    const admin = t.withIdentity({ tokenIdentifier: "https://auth.one|admin" });
    const create = async (email: string) =>
      t.run(async (ctx) => {
        const user = await ctx.runMutation(
          components.betterAuth.adapter.create,
          {
            input: {
              model: "user",
              data: {
                name: "Private name",
                email,
                emailVerified: false,
                createdAt: SIGNUP,
                updatedAt: SIGNUP,
              },
            },
          },
        );
        return `https://auth.one|${user._id}`;
      });
    const real = await create("private@company.org");
    const test = await create("probe@onerep.test");
    const qa = await create("qa@company.org");
    // More than one page verifies totals are never just a first-page count.
    for (let i = 0; i < 129; i++) await create(`member${i}@company.org`);
    for (const userId of [real, test, qa, "old-issuer|unknown"])
      await t.run((ctx) =>
        ctx.db.insert("workoutLogs", {
          userId,
          date: "2026-09-01",
          exercises: [{ name: "Private exercise", weight: 99 }],
          durationSeconds: 300,
          completedAt: SIGNUP,
        }),
      );
    for (let i = 0; i < 129; i++)
      await t.run((ctx) =>
        ctx.db.insert("workoutLogs", {
          userId: real,
          date: "2026-09-02",
          exercises: [],
          durationSeconds: 300,
          completedAt: SIGNUP,
        }),
      );
    const report = await admin.action(api.analytics.report, {});
    expect(report.totals).toEqual({
      signups: 130,
      workoutUsers: 1,
      repeatDayUsers: 1,
      active7: 1,
      active30: 1,
    });
    expect(report.quality).toMatchObject({
      excludedAccounts: 2,
      unlinkedWorkoutRecords: 1,
    });
    const serialized = JSON.stringify(report);
    for (const privateValue of [
      "Private name",
      "Private exercise",
      "private@company.org",
      real,
      "durationSeconds",
      "completedAt",
      "exercises",
    ])
      expect(serialized).not.toContain(privateValue);
    const page = await admin.query(internal.analytics.workoutPage, {
      cursor: null,
      asOf: Date.now(),
    });
    expect(Object.keys(page.page[0]).sort()).toEqual([
      "date",
      "loggedAt",
      "userId",
    ]);
  });
});
