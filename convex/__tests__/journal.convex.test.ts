/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
const modules = import.meta.glob("../**/*.ts");

test("journal entries persist by day, merge edits, and stay private", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "journal-owner" });
  const other = t.withIdentity({ name: "journal-other" });
  const range = { start: "2026-09-21", end: "2026-09-27" };
  await owner.mutation(api.logs.journal.save, {
    date: "2026-09-23",
    values: { caffeine: 150, mood: 4 },
  });
  await owner.mutation(api.logs.journal.save, {
    date: "2026-09-23",
    values: { lowCarb: false, notes: "Rest day" },
  });
  await owner.mutation(api.logs.journal.save, {
    date: "2026-09-22",
    values: { alcohol: 0 },
  });
  const week = await owner.query(api.logs.journal.getWeek, range);
  expect(week).toHaveLength(2);
  expect(week.find((entry) => entry.date === "2026-09-23")).toMatchObject({
    caffeine: 150,
    mood: 4,
    lowCarb: false,
    notes: "Rest day",
  });
  expect(await other.query(api.logs.journal.getWeek, range)).toEqual([]);
  await owner.mutation(api.logs.journal.save, {
    date: "2026-09-23",
    values: { lowCarb: null },
  });
  expect(
    (await owner.query(api.logs.journal.getWeek, range))[1].lowCarb,
  ).toBeNull();
});

test("journal rejects unauthenticated writes and malformed values", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.logs.journal.save, {
      date: "2026-09-23",
      values: { mood: 4 },
    }),
  ).rejects.toThrow();
  const owner = t.withIdentity({ name: "journal-validation" });
  for (const values of [
    { caffeine: -1 },
    { alcohol: 101 },
    { mood: 0 },
    { mood: 2.5 },
    { notes: "x".repeat(4001) },
  ]) {
    await expect(
      owner.mutation(api.logs.journal.save, { date: "2026-09-23", values }),
    ).rejects.toThrow();
  }
  await expect(
    owner.mutation(api.logs.journal.save, {
      date: "2026-02-30",
      values: { mood: 4 },
    }),
  ).rejects.toThrow();
});

test("tracker history follows the selected calendar day and remains private", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "tracker-owner" });
  const other = t.withIdentity({ name: "tracker-other" });
  const id = await owner.mutation(api.customProgressMetrics.saveDefinition, {
    title: "Mobility",
    description: "Time moving",
    tab: "training",
    kind: "counter",
    unit: "min",
    step: 5,
    target: 20,
    accent: "workout",
  });
  // Insert in the opposite order to their calendar dates: imports and backfills do this.
  for (const date of ["2026-09-23", "2026-09-14", "2026-09-18"]) {
    await owner.mutation(api.customProgressMetrics.setValue, {
      metricId: id,
      date,
      value: 10,
    });
  }
  const historical = await owner.query(api.logs.journal.trackers, {
    date: "2026-09-20",
  });
  expect(historical[0].entries.map((item) => item.date)).toEqual([
    "2026-09-14",
    "2026-09-18",
  ]);
  expect(
    await other.query(api.logs.journal.trackers, { date: "2026-09-20" }),
  ).toEqual([]);
  await expect(
    other.mutation(api.logs.journal.incrementTracker, {
      metricId: id,
      date: "2026-09-20",
    }),
  ).rejects.toThrow();
  await owner.mutation(api.logs.journal.incrementTracker, {
    metricId: id,
    date: "2026-09-20",
  });
  await owner.mutation(api.logs.journal.incrementTracker, {
    metricId: id,
    date: "2026-09-20",
  });
  const updated = await owner.query(api.logs.journal.trackers, {
    date: "2026-09-20",
  });
  expect(
    updated[0].entries.find((item) => item.date === "2026-09-20"),
  ).toMatchObject({ value: 10, manual: true });
  await owner.mutation(api.customProgressMetrics.clearValue, {
    metricId: id,
    date: "2026-09-20",
  });
  expect(
    (await owner.query(api.logs.journal.trackers, { date: "2026-09-20" }))[0]
      .entries,
  ).toHaveLength(2);
  await owner.mutation(api.customProgressMetrics.updateDefinition, {
    metricId: id,
    title: "Movement breaks",
    target: null,
  });
  const renamed = (
    await owner.query(api.logs.journal.trackers, { date: "2026-09-20" })
  )[0];
  expect(renamed.title).toBe("Movement breaks");
  expect(renamed.target).toBeUndefined();
  expect(renamed.entries).toHaveLength(2);
});

test("quick add rejects invalid dates, non-counters and unauthenticated access", async () => {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ name: "tracker-validation" });
  const id = await owner.mutation(api.customProgressMetrics.saveDefinition, {
    title: "Sleep",
    description: "Rest",
    tab: "body",
    kind: "number",
    unit: "h",
    step: 0.25,
    accent: "progress",
  });
  await expect(
    owner.mutation(api.logs.journal.incrementTracker, {
      metricId: id,
      date: "2026-09-23",
    }),
  ).rejects.toThrow("daily totals");
  await expect(
    owner.mutation(api.logs.journal.incrementTracker, {
      metricId: id,
      date: "2026-02-30",
    }),
  ).rejects.toThrow();
  await expect(
    t.query(api.logs.journal.trackers, { date: "2026-09-23" }),
  ).rejects.toThrow();
});
