import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const USER = "user_outreach";

async function seedPreferences(
  t: ReturnType<typeof convexTest>,
  userId: string,
  coachOutreach?: {
    enabled: boolean;
    weeklyReview: boolean;
    nudges: boolean;
    quietHours?: { startMinutes: number; endMinutes: number };
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("userPreferences", {
      userId,
      lastActiveTimezone: "UTC",
      updatedAt: Date.now(),
      ...(coachOutreach ? { coachOutreach } : {}),
    });
  });
}

describe("the outreach gate", () => {
  test("reports the defaults when a user has never touched the setting", async () => {
    const t = convexTest(schema, modules);
    await seedPreferences(t, USER);

    const gate = await t.query(internal.push.send.loadGateState, {
      userId: USER,
      kind: "weekly_review",
      dedupeKey: "2026-W32",
    });

    expect(gate.settings).toEqual({
      enabled: true,
      weeklyReview: true,
      nudges: true,
      quietHours: { startMinutes: 21 * 60 + 30, endMinutes: 8 * 60 },
    });
    expect(gate.alreadySent).toBe(false);
    expect(gate.recentTouchCount).toBe(0);
  });

  test("recognises a touch it has already sent", async () => {
    const t = convexTest(schema, modules);
    await seedPreferences(t, USER);
    await t.mutation(internal.push.send.recordTouch, {
      userId: USER,
      kind: "weekly_review",
      dedupeKey: "2026-W32",
      delivered: 1,
    });

    const same = await t.query(internal.push.send.loadGateState, {
      userId: USER,
      kind: "weekly_review",
      dedupeKey: "2026-W32",
    });
    const nextWeek = await t.query(internal.push.send.loadGateState, {
      userId: USER,
      kind: "weekly_review",
      dedupeKey: "2026-W33",
    });

    expect(same.alreadySent).toBe(true);
    expect(nextWeek.alreadySent).toBe(false);
  });

  test("counts only capped kinds toward the weekly allowance", async () => {
    const t = convexTest(schema, modules);
    await seedPreferences(t, USER);

    for (const [kind, key] of [
      ["missed_log", "2026-08-03"],
      ["training_lapse", "2026-07-30:0"],
      ["weekly_review", "2026-W31"],
    ] as const) {
      await t.mutation(internal.push.send.recordTouch, {
        userId: USER,
        kind,
        dedupeKey: key,
        delivered: 1,
      });
    }

    const gate = await t.query(internal.push.send.loadGateState, {
      userId: USER,
      kind: "missed_log",
      dedupeKey: "2026-08-04",
    });

    // Two nudges spend from the cap; the review the user asked for does not.
    expect(gate.recentTouchCount).toBe(2);
  });

  test("a touch outside the rolling window no longer counts", async () => {
    const t = convexTest(schema, modules);
    await seedPreferences(t, USER);
    await t.run(async (ctx) => {
      await ctx.db.insert("coachTouches", {
        userId: USER,
        kind: "missed_log",
        dedupeKey: "old",
        sentAt: Date.now() - 8 * 86_400_000,
        delivered: 1,
      });
    });

    const gate = await t.query(internal.push.send.loadGateState, {
      userId: USER,
      kind: "missed_log",
      dedupeKey: "2026-08-04",
    });
    expect(gate.recentTouchCount).toBe(0);
  });

  test("one user's history never leaks into another's allowance", async () => {
    const t = convexTest(schema, modules);
    await seedPreferences(t, USER);
    await seedPreferences(t, "user_other");
    await t.mutation(internal.push.send.recordTouch, {
      userId: "user_other",
      kind: "missed_log",
      dedupeKey: "2026-08-03",
      delivered: 1,
    });

    const gate = await t.query(internal.push.send.loadGateState, {
      userId: USER,
      kind: "missed_log",
      dedupeKey: "2026-08-03",
    });
    expect(gate.alreadySent).toBe(false);
    expect(gate.recentTouchCount).toBe(0);
  });
});

describe("sending without credentials", () => {
  test("declines quietly rather than throwing", async () => {
    const t = convexTest(schema, modules);
    await seedPreferences(t, USER);

    const outcome = await t.action(internal.push.send.sendCoachTouch, {
      userId: USER,
      kind: "weekly_review",
      dedupeKey: "2026-W32",
      title: "Your week, reviewed",
      body: "Four sessions, up from two.",
    });

    // A deployment with no FCM keys must behave like one with no push, not
    // like a broken one — and must not burn the dedupe key on a send that
    // never happened.
    expect(outcome.sent).toBe(false);
    expect(outcome.delivered).toBe(0);
    const gate = await t.query(internal.push.send.loadGateState, {
      userId: USER,
      kind: "weekly_review",
      dedupeKey: "2026-W32",
    });
    expect(gate.alreadySent).toBe(false);
  });

  test("respects the master switch before it looks at anything else", async () => {
    const t = convexTest(schema, modules);
    await seedPreferences(t, USER, {
      enabled: false,
      weeklyReview: true,
      nudges: true,
    });

    const outcome = await t.action(internal.push.send.sendCoachTouch, {
      userId: USER,
      kind: "weekly_review",
      dedupeKey: "2026-W32",
      title: "Your week, reviewed",
      body: "Four sessions, up from two.",
    });
    expect(outcome).toEqual({
      sent: false,
      reason: "outreach disabled",
      delivered: 0,
    });
  });
});

describe("saving a review", () => {
  const base = {
    userId: USER,
    weekKey: "2026-W32",
    headline: "Four sessions, up from two.",
    summary: ["Protein averaged 138g."],
    proposedOperations: [],
    requestId: "weekly-review-user_outreach-2026-W32",
  };

  test("one week yields exactly one review, however many sweeps race", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.ai.weeklyReview.saveReview, {
      ...base,
      weekStart: "2026-08-03",
    });
    const second = await t.mutation(internal.ai.weeklyReview.saveReview, {
      ...base,
      weekStart: "2026-08-03",
      headline: "A different reading of the same week.",
    });

    expect(second).toEqual(first);
    const rows = await t.run((ctx) => ctx.db.query("coachReviews").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].headline).toBe(base.headline);
  });

  test("a new review supersedes the one nobody answered", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ai.weeklyReview.saveReview, {
      ...base,
      weekStart: "2026-08-03",
    });
    await t.mutation(internal.ai.weeklyReview.saveReview, {
      ...base,
      weekStart: "2026-08-10",
      weekKey: "2026-W33",
      requestId: "weekly-review-user_outreach-2026-W33",
    });

    const rows = await t.run((ctx) => ctx.db.query("coachReviews").collect());
    const byWeek = Object.fromEntries(
      rows.map((row) => [row.weekStart, row.status]),
    );
    expect(byWeek).toEqual({
      "2026-08-03": "expired",
      "2026-08-10": "pending",
    });
  });

  test("expiry leaves an answered review alone", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ai.weeklyReview.saveReview, {
      ...base,
      weekStart: "2026-08-03",
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("coachReviews").first();
      await ctx.db.patch(row!._id, {
        status: "approved",
        createdAt: Date.now() - 30 * 86_400_000,
      });
    });

    const result = await t.mutation(internal.ai.weeklyReview.expireStale, {});
    expect(result.expired).toBe(0);
  });

  test("expiry retires a pending review once it is stale", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ai.weeklyReview.saveReview, {
      ...base,
      weekStart: "2026-08-03",
    });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("coachReviews").first();
      await ctx.db.patch(row!._id, {
        createdAt: Date.now() - 8 * 86_400_000,
      });
    });

    const result = await t.mutation(internal.ai.weeklyReview.expireStale, {});
    expect(result.expired).toBe(1);
  });
});

describe("selecting who is due", () => {
  test("picks Sunday evening in the user's own timezone", async () => {
    const t = convexTest(schema, modules);
    // 2026-08-10T02:30:00Z is Sunday 19:30 in Los Angeles — past the 18:00
    // close — while London and Tokyo have both already rolled into Monday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T02:30:00Z"));

    await t.run(async (ctx) => {
      for (const [userId, zone] of [
        ["user_la", "America/Los_Angeles"],
        ["user_london", "Europe/London"],
        ["user_tokyo", "Asia/Tokyo"],
        // Right timezone, right hour — but nothing logged in a fortnight. The
        // selection must not spend a workspace build on an empty account.
        ["user_la_dormant", "America/Los_Angeles"],
      ]) {
        await ctx.db.insert("userPreferences", {
          userId,
          lastActiveTimezone: zone,
          updatedAt: Date.now(),
        });
      }
      // A pulse for everyone except the dormant account.
      for (const userId of ["user_la", "user_london", "user_tokyo"]) {
        await ctx.db.insert("workoutLogs", {
          userId,
          date: "2026-08-07",
          exercises: [],
          durationSeconds: 1800,
          completedAt: Date.now(),
        });
      }
    });

    const batch = await t.query(internal.ai.weeklyReview.selectDueBatch, {
      cursor: null,
    });
    const due = batch.due.map((row) => row.userId).sort();

    // London has already rolled into Monday; Tokyo is mid-Monday-morning.
    // Only Los Angeles is in its Sunday evening — and only the one with a
    // pulse.
    expect(due).toEqual(["user_la"]);
    expect(batch.due[0].weekStart).toBe("2026-08-03");

    vi.useRealTimers();
  });
});
