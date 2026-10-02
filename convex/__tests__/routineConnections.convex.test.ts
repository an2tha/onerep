import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import schema from "../schema";
import { api, internal } from "../_generated/api";
const modules = import.meta.glob("../**/*.ts");
const identity = { tokenIdentifier: "test|routine" };
const choices = {
  reason: "energy" as const,
  action: "gym" as const,
  anchor: "After school",
};
const exercises = [
  {
    id: "squat",
    name: "Squat",
    sets: [{ type: "normal", reps: 5, weight: 10, completed: true }],
  },
];

test("fresh workouts connect to Restart, edits and backfills do not, repetition needs another day", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await user.mutation(api.restart.save, choices);
    await user.mutation(api.restart.advance, { expectedStage: 0 });
    const state = () => user.query(api.restart.get, { clockKey: "now" });
    await user.mutation(api.logs.workouts.completion, {
      date: "2026-10-01",
      sessionId: "old",
      exercises,
      durationSeconds: 120,
    });
    expect((await state()).plan?.stage).toBe(1);
    await user.mutation(api.logs.workouts.completion, {
      date: "2026-10-02",
      sessionId: "one",
      exercises,
      durationSeconds: 120,
    });
    expect((await state()).plan?.stage).toBe(2);
    await user.mutation(api.logs.workouts.completion, {
      date: "2026-10-02",
      sessionId: "one",
      exercises,
      durationSeconds: 140,
    });
    expect((await state()).plan?.stage).toBe(2);
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    await user.mutation(api.logs.workouts.completion, {
      date: "2026-10-03",
      sessionId: "two",
      exercises,
      durationSeconds: 120,
    });
    expect((await state()).plan?.status).toBe("completed");
  } finally {
    vi.useRealTimers();
  }
});

test("rest flows both ways without creating a workout", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity(identity);
  await user.mutation(api.restart.save, { ...choices, action: "rest" });
  await user.mutation(api.restart.advance, { expectedStage: 0 });
  await user.mutation(api.restart.advance, { expectedStage: 1 });
  expect(await t.run((ctx) => ctx.db.query("restDays").collect())).toHaveLength(
    1,
  );
  expect(
    await t.run((ctx) => ctx.db.query("workoutLogs").collect()),
  ).toHaveLength(0);
  await user.mutation(api.restart.pause, {});
  await user.mutation(api.restart.save, { ...choices, action: "rest" });
  await user.mutation(api.restart.advance, { expectedStage: 0 });
  const today = new Date().toISOString().slice(0, 10);
  await user.mutation(api.logs.restDays.unmark, { dates: [today] });
  await user.mutation(api.logs.restDays.mark, { dates: [today] });
  expect(
    (await user.query(api.restart.get, { clockKey: today })).plan?.stage,
  ).toBe(2);
});

test("Coach receives commitments, journal and check-in notes with privacy respected", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity(identity);
  await user.mutation(api.restart.save, choices);
  await user.mutation(api.users.weeklyTargets.set, {
    weekKey: "2026-W40",
    sessions: 2,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("journalEntries", {
      userId: identity.tokenIdentifier,
      date: "2026-10-02",
      notes: "School was tiring",
      mood: 2,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("coachCheckIns", {
      userId: identity.tokenIdentifier,
      date: "2026-10-02",
      kind: "daily",
      energy: 2,
      soreness: 2,
      sleepQuality: 2,
      mood: 2,
      note: "Need a quiet day",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  const context = () =>
    t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: identity.tokenIdentifier,
      today: "2026-10-02",
    });
  const first = await context();
  expect(first.commitments.restart?.anchor).toBe("After school");
  const spotter = await t.query(internal.ai.inWorkout.loadContext, {
    userId: identity.tokenIdentifier, today: "2026-10-02",
  });
  expect(spotter.commitments.restart?.anchor).toBe("After school");
  expect(spotter.commitments.weeklyCommitment?.sessions).toBe(2);
  expect(first.commitments.weeklyCommitment?.sessions).toBe(2);
  expect(first).toHaveProperty("journal.0.notes", "School was tiring");
  expect(first).toHaveProperty("checkIns.0.note", "Need a quiet day");
  await t.run((ctx) =>
    ctx.db.insert("userPreferences", {
      lastActiveTimezone: "UTC",
      userId: identity.tokenIdentifier,
      updatedAt: Date.now(),
      privacySettings: {
        analyticsEnabled: false,
        personalizedInsightsEnabled: false,
      },
    }),
  );
  const privateContext = await context();
  expect(privateContext.commitments.restart?.anchor).toBe("After school");
  expect(privateContext).not.toHaveProperty("journal");
  expect(privateContext).not.toHaveProperty("checkIns");
});
