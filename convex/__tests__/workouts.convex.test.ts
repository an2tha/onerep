import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("workoutLogs Convex functions", () => {
  test("getLog returns an empty session list when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.workouts.getLog, { date: "2024-01-15" }),
    ).resolves.toEqual([]);
  });

  test("getHistory returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.logs.workouts.getHistory, {})).resolves.toEqual(
      [],
    );
  });

  test("completion throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.workouts.completion, {
        date: "2024-01-15",
        exercises: [],
        durationSeconds: 3600,
      }),
    ).rejects.toThrow();
  });

  test("remove throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.workouts.remove, {
        id: "jd7f4z1y2s3d4t5v6w7x8" as any,
      }),
    ).rejects.toThrow();
  });

  test("inserts a workout log with correct data", async () => {
    const t = convexTest(schema, modules);
    const exercises = [
      { name: "Squat", sets: [{ reps: 5, weight: 100 }] },
      { name: "Bench Press", sets: [{ reps: 5, weight: 80 }] },
    ];

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("workoutLogs", {
        userId: "workout-test-user",
        date: "2024-01-15",
        exercises,
        durationSeconds: 3600,
        completedAt: Date.now(),
      });
    });

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored).not.toBeNull();
    expect(stored!.exercises).toHaveLength(2);
    expect(stored!.durationSeconds).toBe(3600);
    expect(stored!.date).toBe("2024-01-15");
  });

  test("updates existing workout log (upsert pattern)", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("workoutLogs", {
        userId: "workout-upsert-user",
        date: "2024-01-20",
        exercises: [{ name: "Old exercise" }],
        durationSeconds: 1800,
        completedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        exercises: [{ name: "Updated exercise" }],
        durationSeconds: 3600,
        completedAt: Date.now(),
      });
    });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.exercises[0].name).toBe("Updated exercise");
    expect(updated!.durationSeconds).toBe(3600);
  });

  test("deletes a workout log", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("workoutLogs", {
        userId: "workout-delete-user",
        date: "2024-02-01",
        exercises: [],
        durationSeconds: 0,
        completedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => ctx.db.delete(id));

    const deleted = await t.run(async (ctx) => ctx.db.get(id));
    expect(deleted).toBeNull();
  });

  test("removeBySlot throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.workouts.removeBySlot, {
        date: "2024-01-15",
        slot: 1,
      }),
    ).rejects.toThrow();
  });

  test("completion persists cardio workout details", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "cardio-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-01",
        durationSeconds: 1800,
        exercises: [
          {
            id: "zone-2-run",
            name: "Zone 2 Run",
            category: "cardio",
            sets: [],
            cardio: {
              distanceMeters: 5000,
              distanceUnit: "km",
              durationSeconds: 1800,
              paceSecondsPerKm: 360,
              avgHeartRateBpm: 142,
              maxHeartRateBpm: 168,
              heartRateZones: {
                zone2Seconds: 1200,
                zone3Seconds: 600,
              },
              route: {
                name: "Park loop",
                url: "https://example.com/routes/park-loop",
              },
              source: {
                provider: "strava",
                name: "Morning Run",
                externalId: "strava-123",
              },
            },
          },
        ],
      });

      const logs = await t.query(api.logs.workouts.getLog, {
        date: "2024-03-01",
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]!.exercises[0]).toMatchObject({
        id: "zone-2-run",
        category: "cardio",
        cardio: {
          distanceMeters: 5000,
          durationSeconds: 1800,
          paceSecondsPerKm: 360,
          avgHeartRateBpm: 142,
          route: { name: "Park loop" },
          source: { provider: "strava", externalId: "strava-123" },
        },
      });
    });
  });

  test("keeps two daily sessions separate and retries each session idempotently", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "two-session-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-02",
        sessionId: "morning-strength",
        slot: 1,
        durationSeconds: 1800,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
      });
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-02",
        sessionId: "evening-cardio",
        slot: 2,
        durationSeconds: 1200,
        exercises: [{ id: "run", name: "Run", sets: [] }],
      });
      // An offline retry updates only the matching session.
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-02",
        sessionId: "morning-strength",
        slot: 1,
        durationSeconds: 1900,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
      });

      const logs = await t.query(api.logs.workouts.getLog, {
        date: "2024-03-02",
      });
      expect(logs).toHaveLength(2);
      expect(logs.map((log) => log.sessionId)).toEqual([
        "morning-strength",
        "evening-cardio",
      ]);
      expect(logs.map((log) => log.durationSeconds)).toEqual([1900, 1200]);
    });
  });
  // ── Reconstructing a past session ──────────────────────────────────────────

  test("clamps a backdated completedAt into its calendar day", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "retro-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-05",
        sessionId: "retro-1",
        slot: 1,
        durationSeconds: 3600,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
        // Two weeks after the date it claims to belong to.
        completedAt: Date.parse("2024-03-19T10:00:00Z"),
      });

      const [log] = await t.query(api.logs.workouts.getLog, {
        date: "2024-03-05",
      });
      // Widest instant that date can mean in any timezone: UTC midnight + 38h.
      expect(log.completedAt).toBe(
        Date.parse("2024-03-05T00:00:00Z") + 38 * 3_600_000,
      );
    });
  });

  test("never records a completion in the future", async () => {
    const t = convexTest(schema, modules);
    const today = new Date().toISOString().slice(0, 10);

    await t.withIdentity({ name: "future-user" }, async () => {
      const before = Date.now();
      await t.mutation(api.logs.workouts.completion, {
        date: today,
        sessionId: "retro-future",
        slot: 1,
        durationSeconds: 600,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
        completedAt: Date.now() + 86_400_000,
      });

      const [log] = await t.query(api.logs.workouts.getLog, { date: today });
      expect(log.completedAt).toBeGreaterThanOrEqual(before);
      expect(log.completedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  test("editing a saved log preserves when it happened", async () => {
    const t = convexTest(schema, modules);
    const completedAt = Date.parse("2024-03-06T18:30:00Z");

    await t.withIdentity({ name: "edit-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-06",
        sessionId: "retro-edit",
        slot: 1,
        durationSeconds: 3600,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
        completedAt,
      });

      // Adding an exercise later must not restamp the session with "now".
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-06",
        sessionId: "retro-edit",
        slot: 1,
        durationSeconds: 4200,
        exercises: [
          { id: "squat", name: "Squat", sets: [] },
          { id: "row", name: "Row", sets: [] },
        ],
      });

      const [log] = await t.query(api.logs.workouts.getLog, {
        date: "2024-03-06",
      });
      expect(log.completedAt).toBe(completedAt);
      expect(log.exercises).toHaveLength(2);
      expect(log.durationSeconds).toBe(4200);
    });
  });

  test("freeSlot reports the next open slot and null when the day is full", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "slot-user" }, async () => {
      expect(
        await t.query(api.logs.workouts.freeSlot, { date: "2024-03-07" }),
      ).toBe(1);

      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-07",
        sessionId: "s1",
        slot: 1,
        durationSeconds: 600,
        exercises: [],
      });
      expect(
        await t.query(api.logs.workouts.freeSlot, { date: "2024-03-07" }),
      ).toBe(2);

      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-07",
        sessionId: "s2",
        slot: 2,
        durationSeconds: 600,
        exercises: [],
      });
      expect(
        await t.query(api.logs.workouts.freeSlot, { date: "2024-03-07" }),
      ).toBeNull();

      // Editing an existing session still has its own slot available.
      expect(
        await t.query(api.logs.workouts.freeSlot, {
          date: "2024-03-07",
          sessionId: "s1",
        }),
      ).toBe(1);
    });
  });

  test("rejects a third session rather than writing an invisible log", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "third-session-user" }, async () => {
      for (const sessionId of ["a", "b"]) {
        await t.mutation(api.logs.workouts.completion, {
          date: "2024-03-08",
          sessionId,
          slot: sessionId === "a" ? 1 : 2,
          durationSeconds: 600,
          exercises: [],
        });
      }

      await expect(
        t.mutation(api.logs.workouts.completion, {
          date: "2024-03-08",
          sessionId: "c",
          durationSeconds: 600,
          exercises: [],
        }),
      ).rejects.toThrow(/two sessions/i);

      expect(
        await t.query(api.logs.workouts.getLog, { date: "2024-03-08" }),
      ).toHaveLength(2);
    });
  });

  test("a legacy client without a session id still writes one log per day", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "legacy-user" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-09",
        durationSeconds: 600,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
      });
      await t.mutation(api.logs.workouts.completion, {
        date: "2024-03-09",
        durationSeconds: 900,
        exercises: [{ id: "squat", name: "Squat", sets: [] }],
      });

      const logs = await t.query(api.logs.workouts.getLog, {
        date: "2024-03-09",
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].durationSeconds).toBe(900);
    });
  });
});
