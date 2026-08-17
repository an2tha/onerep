import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { localClock } from "../logs/repeatMeals";

const modules = import.meta.glob("../**/*.ts");

// NOTE: convex-test's `withIdentity(identity)` takes no callback — it returns
// an identity-bound accessor. Passing a callback silently does nothing, so
// every call here goes through the accessor.
const USER = { name: "Eater", email: "eater@example.com" };
const INTRUDER = { name: "Intruder", email: "intruder@example.com" };

type Test = ReturnType<typeof convexTest>;

const OATS = {
  id: "template-1",
  name: "Overnight oats",
  calories: 420,
  protein: 24,
  carbs: 60,
  fat: 9,
  meal: "breakfast",
  loggedAt: "2026-01-01T00:00:00.000Z",
};

/** A user whose local clock is plain UTC, so test times read literally. */
async function saveMeal(t: Test, hour = 7, minute = 0, name = "Breakfast oats") {
  const asUser = t.withIdentity(USER);
  // Establishes the userPreferences row holding the timezone.
  await asUser.mutation(api.users.users.syncTimezone, { timeZone: "UTC" });
  await asUser.mutation(api.logs.repeatMeals.save, {
    name,
    meal: "breakfast",
    hour,
    minute,
    entries: [OATS],
  });
  return asUser;
}

/** UTC ms for a wall-clock time on 2026-08-17. */
function at(hour: number, minute = 0) {
  return Date.UTC(2026, 7, 17, hour, minute);
}

async function dayEntries(t: Test, date = "2026-08-17") {
  return (await t
    .withIdentity(USER)
    .query(api.logs.foodLogs.getDay, { date })) as Array<{
    id: string;
    name: string;
    meal: string;
    calories: number;
  }>;
}

describe("repeat meals", () => {
  test("saving and listing round-trips, ordered by time of day", async () => {
    const t = convexTest(schema, modules);
    const asUser = await saveMeal(t, 19, 30, "Evening bowl");
    await asUser.mutation(api.logs.repeatMeals.save, {
      name: "Morning shake",
      meal: "breakfast",
      hour: 7,
      minute: 0,
      entries: [OATS],
    });
    const list = await asUser.query(api.logs.repeatMeals.list, {});
    expect(list.map((m) => m.name)).toEqual(["Morning shake", "Evening bowl"]);
  });

  test("nothing is logged before the meal's local time", async () => {
    const t = convexTest(schema, modules);
    await saveMeal(t, 7, 0);
    const result = await t.mutation(internal.logs.repeatMeals.logDueMeals, {
      now: at(6, 45),
    });
    expect(result).toEqual({ due: 1, logged: 0 });
    expect(await dayEntries(t)).toHaveLength(0);
  });

  test("a due meal is materialized with its slot and macros", async () => {
    const t = convexTest(schema, modules);
    await saveMeal(t, 7, 0);
    const result = await t.mutation(internal.logs.repeatMeals.logDueMeals, {
      now: at(7, 10),
    });
    expect(result.logged).toBe(1);
    const entries = await dayEntries(t);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "Overnight oats",
      meal: "breakfast",
      calories: 420,
    });
    expect(entries[0].id).toMatch(/^repeat:/);
  });

  test("running the cron again the same day adds nothing", async () => {
    const t = convexTest(schema, modules);
    await saveMeal(t, 7, 0);
    await t.mutation(internal.logs.repeatMeals.logDueMeals, { now: at(7, 10) });
    await t.mutation(internal.logs.repeatMeals.logDueMeals, { now: at(9, 0) });
    await t.mutation(internal.logs.repeatMeals.logDueMeals, { now: at(23, 0) });
    expect(await dayEntries(t)).toHaveLength(1);
  });

  test("the next day logs again", async () => {
    const t = convexTest(schema, modules);
    await saveMeal(t, 7, 0);
    await t.mutation(internal.logs.repeatMeals.logDueMeals, { now: at(7, 10) });
    await t.mutation(internal.logs.repeatMeals.logDueMeals, {
      now: at(7, 10) + 24 * 60 * 60 * 1000,
    });
    expect(await dayEntries(t, "2026-08-17")).toHaveLength(1);
    expect(await dayEntries(t, "2026-08-18")).toHaveLength(1);
  });

  test("a disabled meal is skipped entirely", async () => {
    const t = convexTest(schema, modules);
    const asUser = await saveMeal(t, 7, 0);
    const [meal] = await asUser.query(api.logs.repeatMeals.list, {});
    await asUser.mutation(api.logs.repeatMeals.setEnabled, {
      id: meal._id,
      enabled: false,
    });
    const result = await t.mutation(internal.logs.repeatMeals.logDueMeals, {
      now: at(12, 0),
    });
    expect(result).toEqual({ due: 0, logged: 0 });
    expect(await dayEntries(t)).toHaveLength(0);
  });

  test("auto-logged entries merge into a day the user already logged", async () => {
    const t = convexTest(schema, modules);
    const asUser = await saveMeal(t, 7, 0);
    await asUser.mutation(api.logs.foodLogs.addEntry, {
      date: "2026-08-17",
      entry: { ...OATS, id: "manual-1", name: "Espresso", calories: 5 },
    });
    await t.mutation(internal.logs.repeatMeals.logDueMeals, { now: at(8, 0) });
    const entries = await dayEntries(t);
    expect(entries.map((entry) => entry.name).sort()).toEqual([
      "Espresso",
      "Overnight oats",
    ]);
  });

  test("deleting a repeat meal stops future logging", async () => {
    const t = convexTest(schema, modules);
    const asUser = await saveMeal(t, 7, 0);
    const [meal] = await asUser.query(api.logs.repeatMeals.list, {});
    await asUser.mutation(api.logs.repeatMeals.remove, { id: meal._id });
    expect(await asUser.query(api.logs.repeatMeals.list, {})).toHaveLength(0);
    const result = await t.mutation(internal.logs.repeatMeals.logDueMeals, {
      now: at(12, 0),
    });
    expect(result.due).toBe(0);
  });

  test("another user's repeat meal cannot be toggled or deleted", async () => {
    const t = convexTest(schema, modules);
    const asUser = await saveMeal(t, 7, 0);
    const [meal] = await asUser.query(api.logs.repeatMeals.list, {});
    const asIntruder = t.withIdentity(INTRUDER);
    await expect(
      asIntruder.mutation(api.logs.repeatMeals.remove, { id: meal._id }),
    ).rejects.toThrow(/not found/i);
    await expect(
      asIntruder.mutation(api.logs.repeatMeals.setEnabled, {
        id: meal._id,
        enabled: false,
      }),
    ).rejects.toThrow(/not found/i);
    expect(await asUser.query(api.logs.repeatMeals.list, {})).toHaveLength(1);
  });

  test("a timezone ahead of UTC logs on its own local date", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity(USER);
    await asUser.mutation(api.users.users.syncTimezone, {
      timeZone: "Asia/Tokyo",
    });
    await asUser.mutation(api.logs.repeatMeals.save, {
      name: "Tokyo breakfast",
      meal: "breakfast",
      hour: 7,
      minute: 0,
      entries: [OATS],
    });
    // 23:00 UTC on Aug 17 is 08:00 Aug 18 in Tokyo — due, on the 18th.
    await t.mutation(internal.logs.repeatMeals.logDueMeals, { now: at(23, 0) });
    expect(await dayEntries(t, "2026-08-17")).toHaveLength(0);
    expect(await dayEntries(t, "2026-08-18")).toHaveLength(1);
  });

  test("localClock respects the timezone and survives a bad one", () => {
    const noonUtc = Date.UTC(2026, 7, 17, 12, 0);
    expect(localClock("UTC", noonUtc)).toEqual({
      date: "2026-08-17",
      minutes: 12 * 60,
    });
    // Tokyo is UTC+9: already 21:00 on the same date.
    expect(localClock("Asia/Tokyo", noonUtc).minutes).toBe(21 * 60);
    // Invalid zone falls back to UTC instead of throwing inside the cron.
    expect(localClock("Not/AZone", noonUtc)).toEqual({
      date: "2026-08-17",
      minutes: 12 * 60,
    });
  });
});
