import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const HOUR = 3_600_000;

describe("fasting sessions", () => {
  test("starting records an active fast", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "faster" }, async () => {
      await t.mutation(api.logs.fasting.start, {
        targetMinutes: 16 * 60,
        protocol: "16:8",
        startDate: "2026-07-31",
      });

      const active = await t.query(api.logs.fasting.getActive, {});
      expect(active).not.toBeNull();
      expect(active?.protocol).toBe("16:8");
      expect(active?.endedAt).toBeUndefined();
    });
  });

  test("a second concurrent fast is rejected", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "double-faster" }, async () => {
      await t.mutation(api.logs.fasting.start, {
        targetMinutes: 960,
        protocol: "16:8",
        startDate: "2026-07-31",
      });

      await expect(
        t.mutation(api.logs.fasting.start, {
          targetMinutes: 960,
          protocol: "16:8",
          startDate: "2026-07-31",
        }),
      ).rejects.toThrow(/already running/i);
    });
  });

  test("stopping closes the fast and records the end date", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "stopper" }, async () => {
      const id = await t.mutation(api.logs.fasting.start, {
        startedAt: Date.now() - 17 * HOUR,
        targetMinutes: 16 * 60,
        protocol: "16:8",
        startDate: "2026-07-30",
      });

      await t.mutation(api.logs.fasting.stop, {
        id,
        endedAt: Date.now(),
        endDate: "2026-07-31",
      });

      expect(await t.query(api.logs.fasting.getActive, {})).toBeNull();
      const history = await t.query(api.logs.fasting.getRecent, {});
      expect(history).toHaveLength(1);
      expect(history[0].endDate).toBe("2026-07-31");
      // 17h against a 16h target is a completed fast, not an early exit.
      expect(history[0].endedEarly).toBe(false);
    });
  });

  test("ending before the target flags the fast as ended early", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "early-stopper" }, async () => {
      const id = await t.mutation(api.logs.fasting.start, {
        startedAt: Date.now() - 2 * HOUR,
        targetMinutes: 16 * 60,
        protocol: "16:8",
        startDate: "2026-07-31",
      });
      await t.mutation(api.logs.fasting.stop, {
        id,
        endedAt: Date.now(),
        endDate: "2026-07-31",
      });

      const history = await t.query(api.logs.fasting.getRecent, {});
      expect(history[0].endedEarly).toBe(true);
    });
  });

  test("a fast cannot be stopped twice", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "twice-stopper" }, async () => {
      const id = await t.mutation(api.logs.fasting.start, {
        targetMinutes: 960,
        protocol: "16:8",
        startDate: "2026-07-31",
      });
      await t.mutation(api.logs.fasting.stop, { id, endDate: "2026-07-31" });

      await expect(
        t.mutation(api.logs.fasting.stop, { id, endDate: "2026-07-31" }),
      ).rejects.toThrow(/already ended/i);
    });
  });

  test("a future start time is clamped to now", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "time-traveller" }, async () => {
      const before = Date.now();
      await t.mutation(api.logs.fasting.start, {
        startedAt: before + 10 * HOUR,
        targetMinutes: 960,
        protocol: "custom",
        startDate: "2026-07-31",
      });

      const active = await t.query(api.logs.fasting.getActive, {});
      // Otherwise the elapsed timer would count backwards from a future point.
      expect(active!.startedAt).toBeLessThanOrEqual(Date.now());
      expect(active!.startedAt).toBeGreaterThanOrEqual(before - 1000);
    });
  });

  test("a start more than a week back is clamped", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "ancient-faster" }, async () => {
      await t.mutation(api.logs.fasting.start, {
        startedAt: Date.now() - 400 * 24 * HOUR,
        targetMinutes: 960,
        protocol: "custom",
        startDate: "2026-07-31",
      });

      const active = await t.query(api.logs.fasting.getActive, {});
      const daysBack = (Date.now() - active!.startedAt) / (24 * HOUR);
      expect(daysBack).toBeLessThanOrEqual(7.01);
    });
  });

  test("another user cannot stop or delete your fast", async () => {
    const t = convexTest(schema, modules);
    let id!: string;
    await t.withIdentity({ name: "owner" }, async () => {
      id = await t.mutation(api.logs.fasting.start, {
        targetMinutes: 960,
        protocol: "16:8",
        startDate: "2026-07-31",
      });
    });

    await t.withIdentity({ name: "intruder" }, async () => {
      await expect(
        t.mutation(api.logs.fasting.stop, {
          id: id as never,
          endDate: "2026-07-31",
        }),
      ).rejects.toThrow(/not found or access denied/i);
      await expect(
        t.mutation(api.logs.fasting.remove, { id: id as never }),
      ).rejects.toThrow(/not found or access denied/i);
    });

    // The owner's fast is untouched.
    await t.withIdentity({ name: "owner" }, async () => {
      expect(await t.query(api.logs.fasting.getActive, {})).not.toBeNull();
    });
  });

  test("history is scoped to the caller", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "user-a" }, async () => {
      const id = await t.mutation(api.logs.fasting.start, {
        targetMinutes: 960,
        protocol: "16:8",
        startDate: "2026-07-31",
      });
      await t.mutation(api.logs.fasting.stop, { id, endDate: "2026-07-31" });
    });

    await t.withIdentity({ name: "user-b" }, async () => {
      expect(await t.query(api.logs.fasting.getRecent, {})).toHaveLength(0);
      expect(await t.query(api.logs.fasting.getActive, {})).toBeNull();
    });
  });

  test("a malformed date key is rejected", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "bad-date" }, async () => {
      await expect(
        t.mutation(api.logs.fasting.start, {
          targetMinutes: 960,
          protocol: "16:8",
          startDate: "31/07/2026",
        }),
      ).rejects.toThrow(/YYYY-MM-DD/);
    });
  });

  test("getRange filters to the requested window", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "ranger" }, async () => {
      for (const date of ["2026-07-20", "2026-07-28", "2026-07-31"]) {
        const id = await t.mutation(api.logs.fasting.start, {
          targetMinutes: 960,
          protocol: "16:8",
          startDate: date,
        });
        await t.mutation(api.logs.fasting.stop, { id, endDate: date });
      }

      const range = await t.query(api.logs.fasting.getRange, {
        start: "2026-07-25",
        end: "2026-07-31",
      });
      expect(range.map((s) => s.startDate)).toEqual([
        "2026-07-28",
        "2026-07-31",
      ]);
    });
  });
});
