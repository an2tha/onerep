import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { recoveryDates } from "../lib/illnessRecovery";
const modules = import.meta.glob("../**/*.ts");
const today = new Date().toISOString().slice(0, 10);
const options = {
  deferTraining: true,
  quietTraining: true,
  simpleFood: true,
  checkInFrequency: "daily" as const,
};
const setup = {
  startedOn: today,
  symptoms: "Sore throat",
  energy: "low" as const,
  manageable: "Easy meals",
  ...options,
};
const identity = {
  tokenIdentifier: "test|recovery",
  subject: "recovery",
  issuer: "test",
};

describe("illness recovery", () => {
  test("requires authentication and never exposes another user's symptoms", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.recovery.start, setup)).rejects.toThrow(
      "Unauthenticated",
    );
    const user = t.withIdentity(identity);
    await user.mutation(api.recovery.start, setup);
    expect((await t.query(api.recovery.get, {})).active).toBeNull();
    const other = t.withIdentity({ tokenIdentifier: "test|other" });
    expect((await other.query(api.recovery.get, {})).episodes).toEqual([]);
    await expect(
      other.mutation(api.recovery.update, {
        episodeId: (await user.query(api.recovery.get, {})).active!._id,
        phase: "easing_back",
        ...options,
      }),
    ).rejects.toThrow("no longer active");
  });
  test("start is unique, phases are reversible, check-ins upsert, finish preserves history and goals", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await t.run(async (ctx) => {
      await ctx.db.insert("userPreferences", {
        userId: identity.tokenIdentifier,
        updatedAt: Date.now(),
        lastActiveTimezone: "UTC",
        customGoals: { calories: 2100, protein: 130 },
      });
    });
    await user.mutation(api.recovery.start, setup);
    await expect(user.mutation(api.recovery.start, setup)).rejects.toThrow(
      "already active",
    );
    await user.mutation(api.recovery.update, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      phase: "easing_back",
      ...options,
    });
    expect((await user.query(api.recovery.get, {})).active?.phase).toBe(
      "easing_back",
    );
    await user.mutation(api.recovery.update, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      phase: "resting",
      ...options,
      checkInFrequency: "off",
    });
    await user.mutation(api.recovery.checkIn, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      date: today,
      trend: "better",
      symptoms: "Improving",
      energy: "okay",
      manageable: "Rest",
    });
    await user.mutation(api.recovery.checkIn, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      date: today,
      trend: "worse",
      symptoms: "More tired",
      energy: "low",
      manageable: "Fewer prompts",
    });
    const active = await user.query(api.recovery.get, {});
    expect(active.checkIns).toHaveLength(1);
    expect(active.active).toMatchObject({
      lastTrend: "worse",
      symptoms: "More tired",
      checkInFrequency: "off",
    });
    await user.mutation(api.recovery.finish, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      endedOn: today,
    });
    const ended = await user.query(api.recovery.get, {});
    expect(ended.active).toBeNull();
    expect(ended.episodes).toHaveLength(1);
    expect(ended.episodes[0].endedOn).toBe(today);
    expect(
      (await user.query(api.users.users.getPreferences, {}))?.customGoals,
    ).toEqual({ calories: 2100, protein: 130 });
    expect(
      await user.query(api.logs.restDays.listSince, { since: today }),
    ).toContain(today);
  });
  test("both push gates follow choices and recover after finishing", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await user.mutation(api.recovery.start, setup);
    const gate = (kind: "training_lapse" | "missed_log" | "weekly_review") =>
      t.query(internal.push.send.loadGateState, {
        userId: identity.tokenIdentifier,
        kind,
        dedupeKey: "test",
      });
    expect((await gate("training_lapse")).recoveryPaused).toBe(true);
    expect((await gate("missed_log")).recoveryPaused).toBe(true);
    expect((await gate("weekly_review")).recoveryPaused).toBe(false);
    await user.mutation(api.recovery.update, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      phase: "resting",
      ...options,
      quietTraining: false,
      simpleFood: false,
    });
    expect((await gate("training_lapse")).recoveryPaused).toBe(true); // Deferred workouts must stay quiet.
    expect((await gate("missed_log")).recoveryPaused).toBe(false);
    await user.mutation(api.recovery.finish, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      endedOn: today,
    });
    expect((await gate("training_lapse")).recoveryPaused).toBe(false);
  });
  test("recovery context reaches Coach and workout coaching", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await user.mutation(api.recovery.start, setup);
    const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
      userId: identity.tokenIdentifier,
      today,
    });
    expect(workspace.illnessRecovery?.symptoms).toBe("Sore throat");
    const workout = await t.query(internal.ai.inWorkout.loadContext, {
      userId: identity.tokenIdentifier,
      today,
    });
    expect(workout.illnessRecovery?.phase).toBe("resting");
  });
  test("recovery notes participate in account export and deletion", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await user.mutation(api.recovery.start, setup);
    await user.mutation(api.recovery.checkIn, {
      episodeId: (await user.query(api.recovery.get, {})).active!._id,
      date: today,
      trend: "same",
      symptoms: "Tired",
      energy: "low",
      manageable: "Rest",
    });
    const exported = await user.query(api.users.users.exportMyData, {});
    expect(exported.data.recoveryEpisodes).toHaveLength(1);
    expect(exported.data.recoveryCheckIns).toHaveLength(1);
    await user.mutation(api.users.users.deleteMyDataBatch, { batchSize: 100 });
    expect((await user.query(api.recovery.get, {})).episodes).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("recoveryCheckIns").take(1)),
    ).toEqual([]);
  });
  test("invalid dates and oversized notes cannot be stored", async () => {
    const user = convexTest(schema, modules).withIdentity(identity);
    await expect(
      user.mutation(api.recovery.start, { ...setup, startedOn: "2026-02-30" }),
    ).rejects.toThrow("valid date");
    await expect(
      user.mutation(api.recovery.start, {
        ...setup,
        symptoms: "x".repeat(601),
      }),
    ).rejects.toThrow("600");
  });
  test("recovery dates are clipped and deduplicated across a daylight-saving boundary", () => {
    expect(
      recoveryDates(
        [
          { startedOn: "2026-03-27", endedOn: "2026-03-30" },
          { startedOn: "2026-03-29" },
        ],
        "2026-03-28",
        "2026-03-31",
      ),
    ).toEqual(["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
  });
});

test("pending reviews written before recovery are withheld during and after that recovery week", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity(identity);
  await t.run((ctx) =>
    ctx.db.insert("coachReviews", {
      userId: identity.tokenIdentifier,
      weekStart: today,
      weekKey: "test-week",
      status: "pending",
      headline: "Train harder",
      summary: ["Old expectations"],
      proposedOperations: [],
      appliedOperations: [],
      requestId: "old-review",
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 10000,
    }),
  );
  expect(await user.query(api.ai.coachReviews.latest, {})).not.toBeNull();
  await user.mutation(api.recovery.start, setup);
  expect(await user.query(api.ai.coachReviews.latest, {})).toBeNull();
  await user.mutation(api.recovery.finish, {
    episodeId: (await user.query(api.recovery.get, {})).active!._id,
    endedOn: today,
  });
  expect(await user.query(api.ai.coachReviews.latest, {})).toBeNull();
});

test("recovery safety context survives disabled personalization", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity(identity);
  await t.run((ctx) =>
    ctx.db.insert("userPreferences", {
      userId: identity.tokenIdentifier,
      lastActiveTimezone: "UTC",
      updatedAt: Date.now(),
      privacySettings: {
        analyticsEnabled: false,
        personalizedInsightsEnabled: false,
      },
    }),
  );
  await user.mutation(api.recovery.start, setup);
  const workspace = await t.query(internal.ai.coachWorkspace.loadForModel, {
    userId: identity.tokenIdentifier,
    today,
  });
  expect(workspace.illnessRecovery?.symptoms).toBe(setup.symptoms);
});

test("a stale tab cannot edit, check in to, or finish a replacement episode", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity(identity);
  const oldId = await user.mutation(api.recovery.start, setup);
  await user.mutation(api.recovery.finish, {
    episodeId: oldId,
    endedOn: today,
  });
  const currentId = await user.mutation(api.recovery.start, setup);
  await expect(
    user.mutation(api.recovery.update, {
      episodeId: oldId,
      phase: "easing_back",
      ...options,
    }),
  ).rejects.toThrow("no longer active");
  await expect(
    user.mutation(api.recovery.checkIn, {
      episodeId: oldId,
      date: today,
      trend: "better",
      symptoms: "",
      energy: "good",
      manageable: "",
    }),
  ).rejects.toThrow();
  await expect(
    user.mutation(api.recovery.finish, { episodeId: oldId, endedOn: today }),
  ).rejects.toThrow("no longer active");
  expect((await user.query(api.recovery.get, {})).active?._id).toBe(currentId);
});

test("backfilled check-ins preserve the latest coach context and cannot be excluded by finishing early", async () => {
  const user = convexTest(schema, modules).withIdentity(identity);
  const yesterday = new Date(Date.parse(today) - 86400000)
    .toISOString()
    .slice(0, 10);
  const episodeId = await user.mutation(api.recovery.start, {
    ...setup,
    startedOn: yesterday,
  });
  await user.mutation(api.recovery.checkIn, {
    episodeId,
    date: today,
    trend: "better",
    symptoms: "Improved today",
    energy: "good",
    manageable: "Easy meals",
  });
  await user.mutation(api.recovery.checkIn, {
    episodeId,
    date: yesterday,
    trend: "worse",
    symptoms: "Felt worse yesterday",
    energy: "low",
    manageable: "Rest",
  });
  const result = await user.query(api.recovery.get, {});
  expect(result.checkIns).toHaveLength(2);
  expect(result.active).toMatchObject({
    lastCheckInOn: today,
    symptoms: "Improved today",
    energy: "good",
  });
  await expect(
    user.mutation(api.recovery.finish, { episodeId, endedOn: yesterday }),
  ).rejects.toThrow("latest check-in");
});

test("dates use the user's timezone and reject tomorrow", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
  try {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await expect(
      user.mutation(api.recovery.start, { ...setup, startedOn: "2026-09-22" }),
    ).rejects.toThrow("future");
    await t.run((ctx) =>
      ctx.db.insert("userPreferences", {
        userId: identity.tokenIdentifier,
        lastActiveTimezone: "Pacific/Kiritimati",
        updatedAt: Date.now(),
      }),
    );
    const episodeId = await user.mutation(api.recovery.start, {
      ...setup,
      startedOn: "2026-09-22",
    });
    await expect(
      user.mutation(api.recovery.checkIn, {
        episodeId,
        date: "2026-09-23",
        trend: "better",
        symptoms: "",
        energy: "good",
        manageable: "",
      }),
    ).rejects.toThrow("future");
    await expect(
      user.mutation(api.recovery.finish, { episodeId, endedOn: "2026-09-23" }),
    ).rejects.toThrow("future");
    await user.mutation(api.recovery.finish, {
      episodeId,
      endedOn: "2026-09-22",
    });
  } finally {
    vi.useRealTimers();
  }
});

describe("Coach recovery activation", () => {
  const operation = {
    type: "start_recovery",
    confirmation: "auto",
    summary: "Start recovery mode",
    assumptions: [],
    warnings: [],
    symptoms: "Tired",
    energy: "low",
  };

  test("approved Coach operation activates recovery and preserves an existing plan on retry", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await expect(
      t.action(api.ai.coachOperations.applyApproved, {
        requestId: "recovery-unauthenticated",
        operations: [operation],
      }),
    ).rejects.toThrow("Unauthenticated");
    const result = await user.action(api.ai.coachOperations.applyApproved, {
      requestId: "recovery-coach",
      operations: [operation],
    });
    expect(result).toMatchObject([
      { type: "start_recovery", label: "Recovery mode is active" },
    ]);
    const first = (await user.query(api.recovery.get, {})).active!;
    expect(first).toMatchObject({
      symptoms: "Tired",
      energy: "low",
      deferTraining: true,
      quietTraining: true,
      simpleFood: true,
      checkInFrequency: "off",
    });
    await user.mutation(api.recovery.update, {
      episodeId: first._id,
      phase: "easing_back",
      ...options,
      deferTraining: false,
    });
    await user.action(api.ai.coachOperations.applyApproved, {
      requestId: "recovery-coach-again",
      operations: [operation],
    });
    const after = await user.query(api.recovery.get, {});
    expect(after.episodes).toHaveLength(1);
    expect(after.active).toMatchObject({
      _id: first._id,
      phase: "easing_back",
      deferTraining: false,
    });
    await user.mutation(api.recovery.finish, {
      episodeId: first._id,
      endedOn: first.startedOn,
    });
    expect((await user.query(api.recovery.get, {})).active).toBeNull();
  });

  test("Coach activation starts on the account's local date and validates details", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T23:30:00Z"));
    try {
      const t = convexTest(schema, modules);
      const user = t.withIdentity(identity);
      await t.run((ctx) =>
        ctx.db.insert("userPreferences", {
          userId: identity.tokenIdentifier,
          lastActiveTimezone: "Europe/Berlin",
          updatedAt: Date.now(),
        }),
      );
      await expect(
        user.mutation(api.recovery.startFromCoach, {
          symptoms: "x".repeat(601),
        }),
      ).rejects.toThrow("600");
      await user.mutation(api.recovery.startFromCoach, {});
      expect((await user.query(api.recovery.get, {})).active?.startedOn).toBe(
        "2026-09-22",
      );
      const other = t.withIdentity({ tokenIdentifier: "test|other" });
      expect((await other.query(api.recovery.get, {})).active).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
