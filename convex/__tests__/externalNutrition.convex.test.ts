import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
const modules = import.meta.glob("../**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ tokenIdentifier: "test|pr96-review" });
  await owner.mutation(api.logs.externalIntake.sync, {
    provider: "health_connect",
    days: [
      {
        date: "2026-10-26",
        nutrients: { dietaryEnergyKcal: 800 },
        sources: ["Food app"],
      },
    ],
    windowStart: "2026-10-26",
  });
  return { t, owner };
}
test("account export includes imported nutrition", async () => {
  const { owner } = await setup();
  const exported = await owner.query(api.users.users.exportMyData, {});
  expect((exported.data as Record<string, unknown>).externalNutrition).toEqual(
    expect.arrayContaining([expect.objectContaining({ date: "2026-10-26" })]),
  );
});
test("account deletion removes imported nutrition", async () => {
  const { t, owner } = await setup();
  await expect(
    owner.mutation(api.users.users.deleteMyDataBatch, { batchSize: 50 }),
  ).resolves.toMatchObject({ remaining: false });
  expect(
    await t.run((ctx) => ctx.db.query("externalNutrition").collect()),
  ).toEqual([]);
});

test("a day emptied in the other app stops being shown", async () => {
  const { t, owner } = await setup();
  await owner.mutation(api.logs.externalIntake.sync, {
    provider: "health_connect",
    days: [{ date: "2026-10-26", nutrients: {}, sources: [] }],
    windowStart: "2026-10-26",
  });
  expect(
    await t.run((ctx) => ctx.db.query("externalNutrition").collect()),
  ).toEqual([]);
});

test("the sync write cap preserves stored days that were not processed", async () => {
  const { t, owner } = await setup();
  const days = Array.from({ length: 46 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, 11 + index)).toISOString().slice(0, 10),
    nutrients: { dietaryEnergyKcal: 400 },
    sources: ["Food app"],
  }));
  // The last submitted day is already stored but sits outside the write budget.
  expect(days[45].date).toBe("2026-10-26");
  const result = await owner.mutation(api.logs.externalIntake.sync, {
    provider: "health_connect",
    days,
    windowStart: days[0].date,
  });
  expect(result).toEqual({ written: 45, removed: 0 });
  const stored = await t.run((ctx) =>
    ctx.db.query("externalNutrition").collect(),
  );
  expect(stored).toHaveLength(46);
  expect(stored.find((row) => row.date === "2026-10-26")?.nutrients).toEqual({
    dietaryEnergyKcal: 800,
  });
});

test("export and bounded deletion isolate each account's imported nutrition", async () => {
  const { t, owner } = await setup();
  const other = t.withIdentity({ tokenIdentifier: "test|other-nutrition" });
  await other.mutation(api.logs.externalIntake.sync, {
    provider: "apple_health",
    days: [
      {
        date: "2026-10-26",
        nutrients: { hydrationMl: 250 },
        sources: ["Other app"],
      },
    ],
  });
  await owner.mutation(api.logs.externalIntake.sync, {
    provider: "health_connect",
    days: ["2026-10-24", "2026-10-25"].map((date) => ({
      date,
      nutrients: { dietaryEnergyKcal: 900 },
      sources: ["Food app"],
    })),
  });
  const exported = await owner.query(api.users.users.exportMyData, {});
  expect(exported.data.externalNutrition).toHaveLength(3);
  expect(
    exported.data.externalNutrition.every(
      (row) => row.userId === "test|pr96-review",
    ),
  ).toBe(true);
  let remaining = true;
  for (let attempt = 0; attempt < 10 && remaining; attempt++) {
    ({ remaining } = await owner.mutation(api.users.users.deleteMyDataBatch, {
      batchSize: 1,
    }));
  }
  expect(remaining).toBe(false);
  expect(
    await t.run((ctx) => ctx.db.query("externalNutrition").collect()),
  ).toEqual([
    expect.objectContaining({
      userId: "test|other-nutrition",
      nutrients: { hydrationMl: 250 },
    }),
  ]);
});
