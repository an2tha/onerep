import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("moments Convex functions", () => {
  test("listRecent returns nothing when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.users.moments.listRecent, {})).resolves.toEqual(
      [],
    );
  });

  test("record throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.users.moments.record, {
        eventId: "moment.missed-log",
        key: "2026-04-15",
        outcome: "shown",
      }),
    ).rejects.toThrow();
  });

  test("a shown moment is recorded once and answered in place", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "moment-user" }, async () => {
      await t.mutation(api.users.moments.record, {
        eventId: "moment.missed-log",
        key: "2026-04-15",
        outcome: "shown",
      });
      await t.mutation(api.users.moments.record, {
        eventId: "moment.missed-log",
        key: "2026-04-15",
        outcome: "resolved",
      });

      const rows = await t.query(api.users.moments.listRecent, {});
      expect(rows).toHaveLength(1);
      expect(rows[0].outcome).toBe("resolved");
    });
  });

  test("a late 'shown' write cannot un-answer a moment", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "moment-late-user" }, async () => {
      await t.mutation(api.users.moments.record, {
        eventId: "moment.weekly-report",
        key: "2026-W16",
        outcome: "dismissed",
      });
      await t.mutation(api.users.moments.record, {
        eventId: "moment.weekly-report",
        key: "2026-W16",
        outcome: "shown",
      });

      const rows = await t.query(api.users.moments.listRecent, {});
      expect(rows[0].outcome).toBe("dismissed");
    });
  });

  test("history stays bounded per event", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "moment-prune-user" }, async () => {
      for (let day = 1; day <= 20; day++) {
        await t.mutation(api.users.moments.record, {
          eventId: "moment.missed-log",
          key: `2026-04-${String(day).padStart(2, "0")}`,
          outcome: "shown",
        });
      }

      const rows = await t.query(api.users.moments.listRecent, {});
      expect(rows).toHaveLength(12);
      // The oldest keys are the ones dropped.
      expect(rows.map((row) => row.key)).toContain("2026-04-20");
      expect(rows.map((row) => row.key)).not.toContain("2026-04-01");
    });
  });

  test("clearHistory forgets one event or all of them", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "moment-clear-user" }, async () => {
      await t.mutation(api.users.moments.record, {
        eventId: "moment.missed-log",
        key: "2026-04-15",
        outcome: "shown",
      });
      await t.mutation(api.users.moments.record, {
        eventId: "moment.weekly-report",
        key: "2026-W16",
        outcome: "shown",
      });

      await t.mutation(api.users.moments.clearHistory, {
        eventId: "moment.missed-log",
      });
      const remaining = await t.query(api.users.moments.listRecent, {});
      expect(remaining.map((row) => row.eventId)).toEqual([
        "moment.weekly-report",
      ]);

      await t.mutation(api.users.moments.clearHistory, {});
      await expect(t.query(api.users.moments.listRecent, {})).resolves.toEqual(
        [],
      );
    });
  });

  test("one user cannot see another's moments", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "moment-owner" }, async () => {
      await t.mutation(api.users.moments.record, {
        eventId: "moment.training-lapse",
        key: "2026-04-10:0",
        outcome: "shown",
      });
    });

    await t.withIdentity({ name: "moment-stranger" }, async () => {
      await expect(t.query(api.users.moments.listRecent, {})).resolves.toEqual(
        [],
      );
    });
  });
});
