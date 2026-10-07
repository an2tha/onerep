import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
const modules = import.meta.glob("../**/*.ts");
const date = "2026-09-30";
const loggedAt = `${date}T08:00:00Z`;
const revised = `${date}T10:30:00Z`;

describe("timeline corrections", () => {
  test("water edits persist only on the selected owner and day", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "owner" }, async () => {
      await t.mutation(api.logs.water.addEntry, {
        date,
        entry: { id: "water", amountMl: 250, loggedAt },
      });
      await t.mutation(api.logs.water.updateEntry, {
        date,
        id: "water",
        amountMl: 500,
        loggedAt: revised,
      });
      expect(await t.query(api.logs.water.getDay, { date })).toEqual([
        { id: "water", amountMl: 500, loggedAt: revised },
      ]);
      await expect(
        t.mutation(api.logs.water.updateEntry, {
          date: "2026-10-01",
          id: "water",
          amountMl: 500,
          loggedAt: revised,
        }),
      ).rejects.toThrow("Entry not found");
      await expect(
        t.mutation(api.logs.water.updateEntry, {
          date,
          id: "water",
          amountMl: 0,
          loggedAt: revised,
        }),
      ).rejects.toThrow("water amount");
    });
    await t.withIdentity({ name: "other" }, async () => {
      await expect(
        t.mutation(api.logs.water.updateEntry, {
          date,
          id: "water",
          amountMl: 100,
          loggedAt: revised,
        }),
      ).rejects.toThrow("Entry not found");
    });
  });
  test("food time correction preserves the rest of the entry", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "food-owner" }, async () => {
      const entry = {
        id: "food",
        name: "Oats",
        calories: 300,
        protein: 20,
        carbs: 35,
        fat: 8,
        meal: "breakfast",
        loggedAt,
      };
      await t.mutation(api.logs.foodLogs.addEntry, { date, entry });
      await t.mutation(api.logs.foodLogs.updateTime, {
        date,
        id: "food",
        loggedAt: revised,
      });
      expect(
        (await t.query(api.logs.foodLogs.getDay, { date }))[0],
      ).toMatchObject({ ...entry, loggedAt: revised });
    });
  });
  test("supplement corrections scale the stored nutrient snapshot", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "supplement-owner" }, async () => {
      await t.mutation(api.logs.supplements.addEntry, {
        date,
        entry: {
          id: "protein",
          kind: "protein",
          amount: 25,
          unit: "g",
          loggedAt,
        },
      });
      await t.mutation(api.logs.supplements.updateEntry, {
        date,
        id: "protein",
        amount: 50,
        loggedAt: revised,
      });
      expect(
        (await t.query(api.logs.supplements.getDay, { date }))[0],
      ).toMatchObject({
        amount: 50,
        loggedAt: revised,
        nutrients: { protein: 50 },
      });
    });
  });
  test("workout edits are scoped to the selected log, owner, and date", async () => {
    const t = convexTest(schema, modules);
    let id: import("../_generated/dataModel").Id<"workoutLogs">;
    await t.withIdentity({ name: "workout-owner" }, async () => {
      await t.mutation(api.logs.workouts.completion, {
        date,
        exercises: [],
        durationSeconds: 600,
        completedAt: Date.parse(loggedAt),
      });
      id = (await t.query(api.logs.workouts.getLog, { date }))[0]._id;
      await t.mutation(api.logs.workouts.updateTime, {
        date,
        id,
        completedAt: Date.parse(revised),
        durationSeconds: 1200,
      });
      expect(
        (await t.query(api.logs.workouts.getLog, { date }))[0],
      ).toMatchObject({
        completedAt: Date.parse(revised),
        durationSeconds: 1200,
      });
      await expect(
        t.mutation(api.logs.workouts.updateTime, {
          date: "2026-10-01",
          id,
          completedAt: Date.parse(revised),
          durationSeconds: 1200,
        }),
      ).rejects.toThrow("Entry not found");
    });
    await t.withIdentity({ name: "other" }, async () => {
      await expect(
        t.mutation(api.logs.workouts.updateTime, {
          date,
          id: id!,
          completedAt: Date.parse(revised),
          durationSeconds: 1200,
        }),
      ).rejects.toThrow("Entry not found");
    });
  });
});
