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
    expect(
      await t.run((ctx) => ctx.db.query("healthMetrics").collect()),
    ).toEqual([]);
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
    expect(workspace.health).toBeNull();
  });

  test("the coach gets the habit score, not just today's state", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-scored");

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-scored",
      today: TODAY,
    });

    expect(workspace.health).not.toBeNull();
    expect(typeof workspace.health.score).toBe("number");
    expect(workspace.health.windowDays).toBe(7);
    // Only pillars with readings behind them travel; a null score would give
    // the coach a number to reason about that nobody measured.
    expect(
      workspace.health.pillars.every(
        (pillar: { score: number | null }) => pillar.score !== null,
      ),
    ).toBe(true);
    // The prose narrative stays on the page — the coach writes its own.
    expect(workspace.health).not.toHaveProperty("narrative");
  });

  /** One run, in the health store, that OneRep was never told about. */
  async function seedImportedRun(
    t: ReturnType<typeof convexTest>,
    userId: string,
    options: { linked?: boolean; dismissed?: boolean } = {},
  ) {
    await t.run(async (ctx) => {
      const startedAt = Date.parse(`${TODAY}T07:00:00Z`);
      await ctx.db.insert("healthWorkouts", {
        userId,
        provider: "apple_health",
        externalId: `run-${userId}`,
        activityType: "running",
        activityName: "Outdoor Run",
        date: TODAY,
        startedAt,
        endedAt: startedAt + 32 * 60 * 1000,
        durationSeconds: 32 * 60,
        totalDistanceMeters: 6400,
        avgHeartRateBpm: 152,
        activeEnergyKcal: 410,
        ...(options.linked ? { linkedSessionId: "session-1" } : {}),
        ...(options.dismissed ? { dismissedAt: Date.now() } : {}),
        importedAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  }

  test("sessions the watch saw reach the coach as sessions, not as minutes", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-runner");
    await seedImportedRun(t, "user-runner");

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-runner",
      today: TODAY,
    });

    expect(workspace.healthSessions).toHaveLength(1);
    const [run] = workspace.healthSessions;
    expect(run.activity).toBe("Outdoor Run");
    expect(run.minutes).toBe(32);
    expect(run.distanceKm).toBe(6.4);
    expect(run.avgHeartRateBpm).toBe(152);
    // Nothing has promoted it into the training log, so counting it as
    // training is the coach's job rather than a double-count.
    expect(run.inTrainingLog).toBe(false);
    // Provider ids and sync bookkeeping stay on the server.
    expect(run).not.toHaveProperty("externalId");
  });

  test("a session already in the training log says so", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-runner-linked");
    await seedImportedRun(t, "user-runner-linked", { linked: true });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-runner-linked",
      today: TODAY,
    });

    expect(workspace.healthSessions[0].inTrainingLog).toBe(true);
  });

  test("a dismissed import is not quietly resurrected in the coach", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-runner-dismissed");
    await seedImportedRun(t, "user-runner-dismissed", { dismissed: true });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-runner-dismissed",
      today: TODAY,
    });

    expect(workspace.healthSessions).toHaveLength(0);
  });

  test("imported sessions sit behind the same privacy gate", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-runner-private");
    await seedImportedRun(t, "user-runner-private");
    await t.run(async (ctx) => {
      const prefs = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", "user-runner-private"))
        .unique();
      await ctx.db.patch(prefs!._id, {
        privacySettings: {
          analyticsEnabled: true,
          personalizedInsightsEnabled: false,
        },
      });
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-runner-private",
      today: TODAY,
    });

    expect(workspace).not.toHaveProperty("healthSessions");
    expect(workspace.omitted).toContain("healthSessions");
  });

  test("active energy travels as a number, not only as a pillar score", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId: "user-energy",
        lastActiveTimezone: "UTC",
        updatedAt: Date.now(),
      });
      for (let index = 6; index >= 0; index -= 1) {
        const date = new Date(`${TODAY}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - index);
        await ctx.db.insert("healthMetrics", {
          userId: "user-energy",
          date: date.toISOString().slice(0, 10),
          provider: "apple_health",
          sleepMinutes: 430,
          steps: 9000,
          activeEnergyKcal: 500,
          syncedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-energy",
      today: TODAY,
    });

    expect(workspace.health.activeEnergy.avgKcal).toBe(500);
    expect(workspace.health.activeEnergy.days).toBe(7);
  });

  test("the habit score is behind the same privacy gate as recovery", async () => {
    const t = convexTest(schema, modules);
    await seedTiredUser(t, "user-scored-private");
    await t.run(async (ctx) => {
      const prefs = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", "user-scored-private"))
        .unique();
      await ctx.db.patch(prefs!._id, {
        privacySettings: {
          analyticsEnabled: true,
          personalizedInsightsEnabled: false,
        },
      });
    });

    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: "user-scored-private",
      today: TODAY,
    });

    expect(workspace).not.toHaveProperty("health");
  });
});

describe("the health dashboard query", () => {
  /** A fortnight of ordinary days, so the baselines have something to stand on. */
  async function seedWindow(t: ReturnType<typeof convexTest>, userId: string) {
    await t.run(async (ctx) => {
      for (let index = 20; index >= 0; index -= 1) {
        const date = new Date(`${TODAY}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - index);
        await ctx.db.insert("healthMetrics", {
          userId,
          date: date.toISOString().slice(0, 10),
          provider: "apple_health",
          sleepMinutes: 400,
          steps: 6_000,
          activeEnergyKcal: 300,
          restingHeartRateBpm: 55,
          hrvMs: 60,
          syncedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });
  }

  test("scores the window and totals exercise minutes from the health store", async () => {
    const t = convexTest(schema, modules);
    const subject = "user_dashboard";
    await seedWindow(t, subject);

    await t.run(async (ctx) => {
      // Two sessions inside the week, and one a month ago that must not count.
      for (const [offset, minutes] of [
        [1, 45],
        [3, 30],
        [40, 90],
      ] as const) {
        const date = new Date(`${TODAY}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - offset);
        const day = date.toISOString().slice(0, 10);
        await ctx.db.insert("healthWorkouts", {
          userId: subject,
          provider: "apple_health",
          externalId: `session-${offset}`,
          activityType: "running",
          activityName: "Run",
          date: day,
          startedAt: date.getTime(),
          endedAt: date.getTime() + minutes * 60_000,
          durationSeconds: minutes * 60,
          importedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const result = await asUser(t, subject).query(
      api.logs.healthMetrics.dashboard,
      { today: TODAY },
    );

    expect(result).not.toBeNull();
    const exercise = result!.pillars.find((pillar) => pillar.id === "exercise");
    expect(exercise!.value).toBe(75); // 45 + 30, not the 90 from last month
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.days).toHaveLength(7);

    // Steps sit at 6,000 against an 8,000 target, so the page has something
    // concrete to ask for rather than a shrug.
    const titles = result!.recommendations.map((item) => item.title);
    expect(titles).toContain("Walk 2,000 more steps a day");
  });

  test("one user's readings never reach another", async () => {
    const t = convexTest(schema, modules);
    await seedWindow(t, "user_owner");

    const result = await asUser(t, "user_stranger").query(
      api.logs.healthMetrics.dashboard,
      { today: TODAY },
    );

    expect(result!.score).toBeNull();
    expect(result!.days).toEqual([]);
  });

  test("signed-out callers get nothing", async () => {
    const t = convexTest(schema, modules);
    await seedWindow(t, "user_owner");
    expect(
      await t.query(api.logs.healthMetrics.dashboard, { today: TODAY }),
    ).toBeNull();
  });
});

describe("the series query", () => {
  test("returns every metric over the requested range", async () => {
    const t = convexTest(schema, modules);
    const subject = "user_series";

    await t.run(async (ctx) => {
      for (let index = 40; index >= 0; index -= 1) {
        const date = new Date(`${TODAY}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - index);
        await ctx.db.insert("healthMetrics", {
          userId: subject,
          date: date.toISOString().slice(0, 10),
          provider: "apple_health",
          sleepMinutes: 420,
          steps: index < 7 ? 9_000 : 6_000,
          hrvMs: 60,
          restingHeartRateBpm: 55,
          syncedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const week = await asUser(t, subject).query(api.logs.healthMetrics.series, {
      today: TODAY,
      range: "W",
    });

    expect(week!.metrics.steps.points).toHaveLength(7);
    expect(week!.metrics.steps.average).toBe(9_000);
    // The preceding week sat at 6,000, so the trend chip has something true
    // to say rather than a shrug.
    expect(week!.metrics.steps.previousAverage).toBe(6_000);
    expect(week!.metrics.steps.deltaPercent).toBe(50);
    expect(week!.metrics.recovery.points.at(-1)!.value).not.toBeNull();
  });

  test("a year range comes back bucketed rather than as 364 points", async () => {
    const t = convexTest(schema, modules);
    const result = await asUser(t, "user_year").query(
      api.logs.healthMetrics.series,
      { today: TODAY, range: "Y" },
    );

    expect(result!.bucketDays).toBe(7);
    expect(result!.metrics.sleep.points).toHaveLength(52);
  });

  test("signed-out callers get nothing", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.query(api.logs.healthMetrics.series, {
        today: TODAY,
        range: "W",
      }),
    ).toBeNull();
  });
});
