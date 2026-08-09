import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("restDays Convex functions", () => {
  test("listSince returns nothing when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.logs.restDays.listSince, { since: "2026-01-01" }),
    ).resolves.toEqual([]);
  });

  test("mark throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.logs.restDays.mark, { dates: ["2026-04-15"] }),
    ).rejects.toThrow();
  });

  test("marks a stretch of days once", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ name: "rest-user" });

    const first = await asUser.mutation(api.logs.restDays.mark, {
      dates: ["2026-04-13", "2026-04-14", "2026-04-14"],
      source: "moment",
    });
    expect(first.marked).toBe(2);

    // Marking the same days again is a no-op, not a duplicate row.
    const second = await asUser.mutation(api.logs.restDays.mark, {
      dates: ["2026-04-13", "2026-04-15"],
    });
    expect(second.marked).toBe(1);

    const dates = await asUser.query(api.logs.restDays.listSince, {
      since: "2026-04-01",
    });
    expect([...dates].sort()).toEqual([
      "2026-04-13",
      "2026-04-14",
      "2026-04-15",
    ]);
  });

  test("listSince ignores anything older than the cutoff", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ name: "rest-cutoff-user" });

    await asUser.mutation(api.logs.restDays.mark, {
      dates: ["2026-01-02", "2026-04-14"],
    });

    await expect(
      asUser.query(api.logs.restDays.listSince, { since: "2026-04-01" }),
    ).resolves.toEqual(["2026-04-14"]);
  });

  test("unmark takes the whole stretch back", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ name: "rest-undo-user" });

    await asUser.mutation(api.logs.restDays.mark, {
      dates: ["2026-04-13", "2026-04-14"],
    });
    const { removed } = await asUser.mutation(api.logs.restDays.unmark, {
      dates: ["2026-04-13", "2026-04-14", "2026-04-20"],
    });
    expect(removed).toBe(2);

    await expect(
      asUser.query(api.logs.restDays.listSince, { since: "2026-04-01" }),
    ).resolves.toEqual([]);
  });

  test("one user cannot see another's rest days", async () => {
    const t = convexTest(schema, modules);

    await t
      .withIdentity({ name: "rest-owner" })
      .mutation(api.logs.restDays.mark, { dates: ["2026-04-14"] });

    await expect(
      t
        .withIdentity({ name: "rest-stranger" })
        .query(api.logs.restDays.listSince, { since: "2026-04-01" }),
    ).resolves.toEqual([]);
  });
});
