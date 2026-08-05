import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const RUN = {
  uuid: "hk-run-1",
  activityType: "running",
  activityName: "Outdoor Run",
  date: "2026-07-30",
  startedAt: "2026-07-30T17:00:00.000Z",
  endedAt: "2026-07-30T17:45:00.000Z",
  durationSeconds: 2700,
  totalDistanceMeters: 8000,
  avgHeartRateBpm: 152,
  maxHeartRateBpm: 178,
  activeEnergyKcal: 600,
  sourceName: "Apple Watch",
  hasRoute: true,
  routeName: "River loop",
};

const LIFT = {
  uuid: "hk-lift-1",
  activityType: "traditionalStrengthTraining",
  activityName: "Strength Training",
  date: "2026-07-30",
  startedAt: "2026-07-30T07:00:00.000Z",
  endedAt: "2026-07-30T08:00:00.000Z",
  durationSeconds: 3600,
};

/** Health sync is consent-gated, so every test needs a profile that grants it. */
async function grantConsent(
  t: ReturnType<typeof convexTest>,
  granted = true,
) {
  await t.mutation(api.users.onboarding.save, {
    age: 30,
    heightCm: 180,
    goal: "build",
    consent: {
      dataUse: true,
      weightData: true,
      foodLogging: true,
      wearableIntegrations: granted,
    },
  });
}

describe("healthWorkouts", () => {
  test("import rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
        provider: "apple_health",
        workouts: [RUN],
      }),
    ).rejects.toThrow(/Not authenticated|Unauthenticated/);
  });

  test("list returns [] when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.healthWorkouts.list, {}),
    ).resolves.toEqual([]);
  });

  test("import refuses without wearable consent, even if the client asked", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|no-consent" });
    await grantConsent(user, false);

    await expect(
      user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
        provider: "apple_health",
        workouts: [RUN],
      }),
    ).rejects.toThrow(/not enabled/i);
  });

  test("importing the same uuid twice yields one row", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|dedupe" });
    await grantConsent(user);

    await expect(
      user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
        provider: "apple_health",
        workouts: [RUN],
      }),
    ).resolves.toEqual({ imported: 1, updated: 0, skipped: 0 });

    await expect(
      user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
        provider: "apple_health",
        workouts: [RUN],
      }),
    ).resolves.toEqual({ imported: 0, updated: 1, skipped: 0 });

    await expect(
      user.query(api.logs.healthWorkouts.list, {}),
    ).resolves.toHaveLength(1);
  });

  test("re-import patches metrics HealthKit revised after the fact", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|revise" });
    await grantConsent(user);

    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [{ ...RUN, activeEnergyKcal: 655, maxHeartRateBpm: 181 }],
    });

    const rows = await user.query(api.logs.healthWorkouts.list, {});
    expect(rows[0]).toMatchObject({
      activeEnergyKcal: 655,
      maxHeartRateBpm: 181,
    });
  });

  test("skips a workout with unparseable timestamps rather than failing the batch", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|bad-dates" });
    await grantConsent(user);

    await expect(
      user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
        provider: "apple_health",
        workouts: [RUN, { ...LIFT, startedAt: "not-a-date" }],
      }),
    ).resolves.toEqual({ imported: 1, updated: 0, skipped: 1 });
  });

  test("rejects a batch larger than one sync", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|big-batch" });
    await grantConsent(user);

    await expect(
      user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
        provider: "apple_health",
        workouts: Array.from({ length: 51 }, (_, index) => ({
          ...RUN,
          uuid: `hk-${index}`,
        })),
      }),
    ).rejects.toThrow(/At most 50/);
  });

  test("linkToTrainingLog writes a namespaced session into slot 1", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|link" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });

    const [row] = await user.query(api.logs.healthWorkouts.list, {});
    const result = await user.mutation(
      api.logs.healthWorkouts.linkToTrainingLog,
      { id: row._id },
    );

    expect(result).toEqual({ sessionId: "apple-health:hk-run-1", slot: 1 });

    const logs = await user.query(api.logs.workouts.getLog, {
      date: "2026-07-30",
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].sessionId).toBe("apple-health:hk-run-1");
    expect(logs[0].exercises[0]).toMatchObject({
      name: "Outdoor Run",
      category: "cardio",
      cardio: {
        distanceMeters: 8000,
        avgHeartRateBpm: 152,
        route: { name: "River loop" },
        source: { provider: "apple_health", externalId: "hk-run-1" },
      },
    });
  });

  test("linking twice stays idempotent", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|link-twice" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});

    await user.mutation(api.logs.healthWorkouts.linkToTrainingLog, {
      id: row._id,
    });
    await user.mutation(api.logs.healthWorkouts.linkToTrainingLog, {
      id: row._id,
    });

    await expect(
      user.query(api.logs.workouts.getLog, { date: "2026-07-30" }),
    ).resolves.toHaveLength(1);
  });

  test("takes slot 2 when a manual session already holds slot 1", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|slot-2" });
    await grantConsent(user);
    await user.mutation(api.logs.workouts.completion, {
      date: "2026-07-30",
      sessionId: "manual-session",
      slot: 1,
      exercises: [],
      durationSeconds: 1800,
    });
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});

    const result = await user.mutation(
      api.logs.healthWorkouts.linkToTrainingLog,
      { id: row._id },
    );
    expect(result.slot).toBe(2);

    const logs = await user.query(api.logs.workouts.getLog, {
      date: "2026-07-30",
    });
    expect(logs).toHaveLength(2);
    // The manually logged session is untouched.
    expect(logs[0].sessionId).toBe("manual-session");
  });

  test("refuses to displace anything when both slots are taken", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|slots-full" });
    await grantConsent(user);
    for (const [sessionId, slot] of [
      ["manual-am", 1],
      ["manual-pm", 2],
    ] as const) {
      await user.mutation(api.logs.workouts.completion, {
        date: "2026-07-30",
        sessionId,
        slot,
        exercises: [],
        durationSeconds: 1800,
      });
    }
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});

    await expect(
      user.mutation(api.logs.healthWorkouts.linkToTrainingLog, { id: row._id }),
    ).rejects.toThrow(/two sessions/i);

    // Both manual logs survive intact.
    const logs = await user.query(api.logs.workouts.getLog, {
      date: "2026-07-30",
    });
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.sessionId)).toEqual([
      "manual-am",
      "manual-pm",
    ]);
  });

  test("strength training imports but cannot be promoted to a cardio row", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|lift" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [LIFT],
    });

    const [row] = await user.query(api.logs.healthWorkouts.list, {});
    expect(row.linkable).toBe(false);
    await expect(
      user.mutation(api.logs.healthWorkouts.linkToTrainingLog, { id: row._id }),
    ).rejects.toThrow(/cannot be added/i);
  });

  test("unlink removes the training log it created", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|unlink" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});
    await user.mutation(api.logs.healthWorkouts.linkToTrainingLog, {
      id: row._id,
    });

    await user.mutation(api.logs.healthWorkouts.unlink, { id: row._id });

    await expect(
      user.query(api.logs.workouts.getLog, { date: "2026-07-30" }),
    ).resolves.toEqual([]);
    const [after] = await user.query(api.logs.healthWorkouts.list, {});
    expect(after.linked).toBe(false);
  });

  test("dismiss hides a row from the list", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|dismiss" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});

    await user.mutation(api.logs.healthWorkouts.dismiss, { id: row._id });
    await expect(
      user.query(api.logs.healthWorkouts.list, {}),
    ).resolves.toEqual([]);
  });

  test("never crosses user boundaries", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ tokenIdentifier: "test|hw-owner" });
    const stranger = t.withIdentity({ tokenIdentifier: "test|hw-stranger" });
    await grantConsent(owner);
    await grantConsent(stranger);
    await owner.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    const [row] = await owner.query(api.logs.healthWorkouts.list, {});

    await expect(
      stranger.query(api.logs.healthWorkouts.list, {}),
    ).resolves.toEqual([]);
    await expect(
      stranger.mutation(api.logs.healthWorkouts.linkToTrainingLog, {
        id: row._id,
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      stranger.mutation(api.logs.healthWorkouts.dismiss, { id: row._id }),
    ).rejects.toThrow(/not found/i);
  });

  test("a manual completion does not clobber a linked Apple Health log", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|coexist" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});
    await user.mutation(api.logs.healthWorkouts.linkToTrainingLog, {
      id: row._id,
    });

    await user.mutation(api.logs.workouts.completion, {
      date: "2026-07-30",
      sessionId: "manual-after",
      slot: 2,
      exercises: [],
      durationSeconds: 1200,
    });

    const logs = await user.query(api.logs.workouts.getLog, {
      date: "2026-07-30",
    });
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.sessionId)).toEqual([
      "apple-health:hk-run-1",
      "manual-after",
    ]);
  });
  // ── Recorded lifting the user still has to describe ────────────────────────

  test("a recorded lift is flagged as needing exercises, not as linkable", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|needs-exercises" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [LIFT],
    });

    const [row] = await user.query(api.logs.healthWorkouts.list, {});
    expect(row.needsExercises).toBe(true);
    expect(row.linkable).toBe(false);
  });

  test("unlogged offers recorded lifts and drops them once handled", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|unlogged" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [LIFT, RUN],
    });

    // A run is promotable on its own, so it is not something to describe.
    const pending = await user.query(api.logs.healthWorkouts.unlogged, {});
    expect(pending).toHaveLength(1);
    expect(pending[0].externalId).toBe("hk-lift-1");
    expect(pending[0].durationSeconds).toBe(3600);

    await user.mutation(api.logs.healthWorkouts.dismiss, {
      id: pending[0]._id,
    });
    expect(await user.query(api.logs.healthWorkouts.unlogged, {})).toEqual([]);
  });

  test("unlogged skips a date that already holds two sessions", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|unlogged-full" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [LIFT],
    });

    for (const sessionId of ["one", "two"]) {
      await user.mutation(api.logs.workouts.completion, {
        date: LIFT.date,
        sessionId,
        slot: sessionId === "one" ? 1 : 2,
        durationSeconds: 600,
        exercises: [],
      });
    }

    expect(await user.query(api.logs.healthWorkouts.unlogged, {})).toEqual([]);
  });

  test("a hand-written log attaches to its recorded workout and stays idempotent", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|attach" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [LIFT],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});
    const seed = await user.query(api.logs.healthWorkouts.getById, {
      id: row._id,
    });
    expect(seed?.sessionId).toBe("apple-health:hk-lift-1");

    await user.mutation(api.logs.workouts.completion, {
      date: LIFT.date,
      sessionId: seed!.sessionId,
      slot: 1,
      durationSeconds: seed!.durationSeconds,
      exercises: [{ id: "squat", name: "Squat", sets: [] }],
      completedAt: seed!.endedAt,
    });
    await user.mutation(api.logs.healthWorkouts.attachToLog, {
      id: row._id,
      sessionId: seed!.sessionId,
      date: LIFT.date,
    });

    expect(await user.query(api.logs.healthWorkouts.unlogged, {})).toEqual([]);

    // A re-sync followed by a re-save must not create a second log.
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [LIFT],
    });
    await user.mutation(api.logs.workouts.completion, {
      date: LIFT.date,
      sessionId: seed!.sessionId,
      slot: 1,
      durationSeconds: seed!.durationSeconds,
      exercises: [
        { id: "squat", name: "Squat", sets: [] },
        { id: "row", name: "Row", sets: [] },
      ],
      completedAt: seed!.endedAt,
    });

    const logs = await user.query(api.logs.workouts.getLog, {
      date: LIFT.date,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].exercises).toHaveLength(2);
  });

  test("attachToLog refuses to link a workout that was never logged", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|attach-missing" });
    await grantConsent(user);
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [LIFT],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});

    await expect(
      user.mutation(api.logs.healthWorkouts.attachToLog, {
        id: row._id,
        sessionId: "apple-health:hk-lift-1",
        date: LIFT.date,
      }),
    ).rejects.toThrow(/no workout log/i);
  });

  test("Health Connect imports land with their own provider", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|health-connect" });
    await grantConsent(user);

    await expect(
      user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
        provider: "health_connect",
        workouts: [RUN],
      }),
    ).resolves.toEqual({ imported: 1, updated: 0, skipped: 0 });

    const [row] = await user.query(api.logs.healthWorkouts.list, {});
    expect(row.provider).toBe("health_connect");
    expect(row.linkable).toBe(true);
  });

  test("the same external id from two providers stays two rows", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|two-providers" });
    await grantConsent(user);

    // Record ids come from different namespaces, so an id collision across
    // stores is possible and must not silently merge two real workouts.
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "apple_health",
      workouts: [RUN],
    });
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "health_connect",
      workouts: [RUN],
    });

    await expect(
      user.query(api.logs.healthWorkouts.list, {}),
    ).resolves.toHaveLength(2);
  });

  test("promotion namespaces the session id per provider", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ tokenIdentifier: "test|hc-link" });
    await grantConsent(user);
    // No sourceName, so the provider label is what has to fill in.
    const { sourceName: _ignored, ...anonymousRun } = RUN;
    await user.mutation(api.logs.healthWorkouts.importHealthWorkouts, {
      provider: "health_connect",
      workouts: [anonymousRun],
    });
    const [row] = await user.query(api.logs.healthWorkouts.list, {});

    const result = await user.mutation(
      api.logs.healthWorkouts.linkToTrainingLog,
      { id: row._id },
    );
    expect(result.sessionId).toBe("health-connect:hk-run-1");

    const logs = await user.query(api.logs.workouts.getHistory, {});
    expect(logs[0].exercises[0].cardio?.source?.provider).toBe(
      "health_connect",
    );
    expect(logs[0].exercises[0].cardio?.source?.name).toBe("Health Connect");
  });
});
