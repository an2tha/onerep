import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { restartNudgeDue, RESTART_GAP_MS } from "../lib/restart";
const modules = import.meta.glob("../**/*.ts");
const identity = {
  tokenIdentifier: "test|restart",
  subject: "restart",
  issuer: "test",
};
const choices = {
  reason: "starting" as const,
  action: "walk" as const,
  anchor: "After school",
};
const args = { clockKey: "2026-10-02" };

describe("restart", () => {
  test("restart plans participate in export and account deletion", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity(identity);
    await user.mutation(api.restart.save, choices);
    const exported = await user.query(api.users.users.exportMyData, {});
    expect(exported.data.restartPlans).toHaveLength(1);
    await user.mutation(api.users.users.deleteMyDataBatch, { batchSize: 100 });
    expect((await user.query(api.restart.get, args)).plan).toBeNull();
  });

  test("fourteen-day boundary, new users, active plans and cooldown", () => {
    const now = 2 * RESTART_GAP_MS;
    expect(restartNudgeDue(null, now, 0, false)).toBe(false);
    expect(restartNudgeDue(now - RESTART_GAP_MS + 1, now, 0, false)).toBe(
      false,
    );
    expect(restartNudgeDue(now - RESTART_GAP_MS, now, 0, false)).toBe(true);
    expect(restartNudgeDue(1, now, now + 1, false)).toBe(false);
    expect(restartNudgeDue(1, now, 0, true)).toBe(false);
  });
  test("authentication, ownership, single plan and idempotent advance", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.restart.save, choices)).rejects.toThrow(
      "Unauthenticated",
    );
    const user = t.withIdentity(identity);
    await user.mutation(api.restart.save, choices);
    await user.mutation(api.restart.save, choices);
    expect(
      await t.run((ctx) => ctx.db.query("restartPlans").collect()),
    ).toHaveLength(1);
    expect((await t.query(api.restart.get, args)).plan).toBeNull();
    const other = t.withIdentity({ tokenIdentifier: "test|other" });
    expect((await other.query(api.restart.get, args)).plan).toBeNull();
    await expect(
      other.mutation(api.restart.advance, { expectedStage: 0 }),
    ).rejects.toThrow();
    await user.mutation(api.restart.advance, { expectedStage: 0 });
    await user.mutation(api.restart.advance, { expectedStage: 0 });
    expect((await user.query(api.restart.get, args)).plan?.stage).toBe(1);
    await user.mutation(api.restart.advance, { expectedStage: 1 });
    await expect(
      user.mutation(api.restart.advance, { expectedStage: 2 }),
    ).rejects.toThrow("another day");
    await user.mutation(api.restart.save, { ...choices, action: "rest" });
    expect((await user.query(api.restart.get, args)).plan?.stage).toBe(2);
    await user.mutation(api.restart.pause, {});
    expect((await user.query(api.restart.get, args)).plan?.status).toBe(
      "paused",
    );
    await user.mutation(api.restart.save, choices);
    expect((await user.query(api.restart.get, args)).plan?.stage).toBe(0);
  });
  test("stale logging nudges, recent backfills and dismissals suppress it", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
      const t = convexTest(schema, modules);
      const user = t.withIdentity(identity);
      await t.run((ctx) =>
        ctx.db.insert("foodLogs", {
          userId: identity.tokenIdentifier,
          date: "2026-09-01",
          entries: [{ name: "Lunch" }],
          updatedAt: Date.now(),
        }),
      );
      vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(true);
      await user.mutation(api.restart.dismissNudge, {});
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(false);
      vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(true);
      await t.run((ctx) =>
        ctx.db.insert("journalEntries", {
          userId: identity.tokenIdentifier,
          date: "2026-08-01",
          mood: 3,
          updatedAt: Date.now(),
        }),
      );
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  test("empty logs and new accounts do not imply a lapse; illness suppresses nudges", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
      const t = convexTest(schema, modules);
      const user = t.withIdentity(identity);
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(false);
      await t.run((ctx) =>
        ctx.db.insert("waterLogs", {
          userId: identity.tokenIdentifier,
          date: "2026-09-01",
          entries: [],
          updatedAt: Date.now(),
        }),
      );
      vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(false);
      await t.run((ctx) =>
        ctx.db.insert("foodLogs", {
          userId: identity.tokenIdentifier,
          date: "2026-10-01",
          entries: [{}],
          updatedAt: Date.now(),
        }),
      );
      vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(true);
      await user.mutation(api.recovery.startFromCoach, {});
      expect((await user.query(api.restart.get, args)).nudgeDue).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  test("repeat on a later day completes without modifying training or nutrition", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
      const t = convexTest(schema, modules);
      const user = t.withIdentity(identity);
      await user.mutation(api.restart.save, choices);
      await user.mutation(api.restart.advance, { expectedStage: 0 });
      await user.mutation(api.restart.advance, { expectedStage: 1 });
      vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
      await user.mutation(api.restart.advance, { expectedStage: 2 });
      expect((await user.query(api.restart.get, args)).plan?.status).toBe(
        "completed",
      );
      expect(
        await t.run((ctx) => ctx.db.query("workoutLogs").collect()),
      ).toEqual([]);
      expect(
        await t.run((ctx) => ctx.db.query("userPreferences").collect()),
      ).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
