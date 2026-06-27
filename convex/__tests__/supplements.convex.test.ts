import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("supplementLogs Convex functions", () => {
  test("getDay returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.logs.supplements.getDay, { date: "2026-06-25" }),
    ).resolves.toEqual([]);
  });

  test("addEntry throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.logs.supplements.addEntry, {
        date: "2026-06-25",
        entry: {
          id: "creatine-1",
          kind: "creatine",
          amount: 5,
          unit: "g",
          loggedAt: "2026-06-25T08:00:00.000Z",
        },
      }),
    ).rejects.toThrow();
  });

  test("addEntry creates and appends daily supplement entries", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "supplement-user" }, async () => {
      await t.mutation(api.logs.supplements.addEntry, {
        date: "2026-06-25",
        entry: {
          id: "creatine-1",
          kind: "creatine",
          amount: 5,
          unit: "g",
          loggedAt: "2026-06-25T08:00:00.000Z",
        },
      });
      await t.mutation(api.logs.supplements.addEntry, {
        date: "2026-06-25",
        entry: {
          id: "caffeine-1",
          kind: "caffeine",
          amount: 100,
          unit: "mg",
          loggedAt: "2026-06-25T09:00:00.000Z",
        },
      });

      const entries = await t.query(api.logs.supplements.getDay, {
        date: "2026-06-25",
      });

      expect(entries).toHaveLength(2);
      expect((entries as any[]).map((entry) => entry.kind)).toEqual([
        "creatine",
        "caffeine",
      ]);
    });
  });

  test("removeEntry removes one supplement entry by id", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "supplement-delete-user" }, async () => {
      await t.mutation(api.logs.supplements.setDay, {
        date: "2026-06-25",
        entries: [
          {
            id: "protein-1",
            kind: "protein",
            amount: 25,
            unit: "g",
            loggedAt: "2026-06-25T10:00:00.000Z",
          },
          {
            id: "vitamins-1",
            kind: "vitamins",
            amount: 1,
            unit: "serving",
            loggedAt: "2026-06-25T11:00:00.000Z",
          },
        ],
      });

      await t.mutation(api.logs.supplements.removeEntry, {
        date: "2026-06-25",
        id: "protein-1",
      });

      const entries = (await t.query(api.logs.supplements.getDay, {
        date: "2026-06-25",
      })) as any[];

      expect(entries).toHaveLength(1);
      expect(entries[0].kind).toBe("vitamins");
    });
  });

  test("setDay rejects non-positive amounts", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "supplement-validation-user" }, async () => {
      await expect(
        t.mutation(api.logs.supplements.setDay, {
          date: "2026-06-25",
          entries: [
            {
              id: "bad",
              kind: "protein",
              amount: 0,
              unit: "g",
              loggedAt: "2026-06-25T10:00:00.000Z",
            },
          ],
        }),
      ).rejects.toThrow("supplement amount must be positive");
    });
  });

  test("catalog items can be saved and logged with scaled nutrient snapshots", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "supplement-catalog-user" }, async () => {
      const saved = (await t.mutation(api.logs.supplements.saveItem, {
        name: "Magnesium Glycinate",
        brand: "Acme",
        category: "vitamin_mineral",
        form: "capsule",
        servingLabel: "2 capsules",
        defaultServingQuantity: 2,
        active: true,
        schedule: { type: "daily", preferredTime: "21:00" },
        nutrientsPerServing: { magnesium: 120, vitaminD: 10 },
        source: "manual",
      })) as { id: any };

      await t.mutation(api.logs.supplements.logTaken, {
        supplementId: saved.id,
        date: "2026-06-25",
        loggedAt: "2026-06-25T21:00:00.000Z",
        servingMultiplier: 1.5,
      });

      const overview = (await t.query(api.logs.supplements.getOverview, {
        date: "2026-06-25",
      })) as any;

      expect(overview.items).toHaveLength(1);
      expect(overview.logs).toHaveLength(1);
      expect(overview.logs[0].nutrients).toEqual({
        magnesium: 180,
        vitaminD: 15,
      });
    });
  });

  test("daily nutrition totals include new event logs and legacy entries", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "supplement-total-user" }, async () => {
      const saved = (await t.mutation(api.logs.supplements.saveItem, {
        name: "Creatine",
        category: "creatine",
        form: "powder",
        servingLabel: "5 g",
        defaultServingQuantity: 5,
        active: true,
        schedule: { type: "daily" },
        nutrientsPerServing: { creatine: 5 },
        source: "manual",
      })) as { id: any };

      await t.mutation(api.logs.supplements.logTaken, {
        supplementId: saved.id,
        date: "2026-06-25",
        servingMultiplier: 2,
      });
      await t.mutation(api.logs.supplements.markSkipped, {
        supplementId: saved.id,
        date: "2026-06-25",
      });
      await t.mutation(api.logs.supplements.setDay, {
        date: "2026-06-25",
        entries: [
          {
            id: "caffeine-legacy",
            kind: "caffeine",
            amount: 100,
            unit: "mg",
            loggedAt: "2026-06-25T08:00:00.000Z",
          },
        ],
      });

      const totals = await t.query(api.logs.supplements.getDayNutrition, {
        date: "2026-06-25",
      });

      expect(totals).toEqual({ caffeine: 100, creatine: 10 });
    });
  });

  test("overview recentLogs excludes entries from the selected date", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "supplement-overview-recent" }, async () => {
      const saved = (await t.mutation(api.logs.supplements.saveItem, {
        name: "Creatine",
        category: "creatine",
        form: "powder",
        servingLabel: "5 g",
        defaultServingQuantity: 5,
        active: true,
        schedule: { type: "daily" },
        nutrientsPerServing: { creatine: 5 },
        source: "manual",
      })) as { id: any };

      await t.mutation(api.logs.supplements.logTaken, {
        supplementId: saved.id,
        date: "2026-06-25",
        loggedAt: "2026-06-25T21:00:00.000Z",
        servingMultiplier: 1,
      });
      await t.mutation(api.logs.supplements.logTaken, {
        supplementId: saved.id,
        date: "2026-06-24",
        loggedAt: "2026-06-24T21:00:00.000Z",
        servingMultiplier: 1,
      });

      const overview = (await t.query(api.logs.supplements.getOverview, {
        date: "2026-06-25",
      })) as any;

      expect(overview.logs).toHaveLength(1);
      expect(overview.recentLogs).toHaveLength(1);
      expect(overview.logs[0].date).toBe("2026-06-25");
      expect(
        overview.recentLogs.every((log: any) => log.date < "2026-06-25"),
      ).toBe(true);
      expect(overview.logs.every((log: any) => log.date === "2026-06-25")).toBe(
        true,
      );
    });
  });
});
