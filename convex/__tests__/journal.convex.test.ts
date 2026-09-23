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
