import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("waterLogs Convex functions", () => {
  test("getDay returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.logs.water.getDay, { date: "2024-01-15" })
    ).resolves.toEqual([]);
  });

  test("setDay throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.water.setDay, { date: "2024-01-15", entries: [] })
    ).rejects.toThrow();
  });

  test("stores water log entries for a date", async () => {
    const t = convexTest(schema, modules);
    const userId = "water-test-user";
    const entries = [
      { id: "1", ml: 250, loggedAt: "2024-01-15T08:00:00Z" },
      { id: "2", ml: 500, loggedAt: "2024-01-15T12:00:00Z" },
    ];

    await t.run(async (ctx) => {
      await ctx.db.insert("waterLogs", {
        userId, date: "2024-01-15", entries, updatedAt: Date.now(),
      });
    });

    const stored = await t.run(async (ctx) => {
      return ctx.db
        .query("waterLogs")
        .filter((q) => q.eq(q.field("userId"), userId))
        .unique();
    });

    expect(stored).not.toBeNull();
    expect(stored!.entries).toHaveLength(2);
    expect(stored!.entries[0].ml).toBe(250);
    expect(stored!.entries[1].ml).toBe(500);
  });

  test("updates water log entries for same date", async () => {
    const t = convexTest(schema, modules);

    const id = await t.run(async (ctx) => {
      return ctx.db.insert("waterLogs", {
        userId: "water-update-user", date: "2024-01-16",
        entries: [{ id: "1", ml: 250 }], updatedAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        entries: [{ id: "1", ml: 250 }, { id: "2", ml: 500 }, { id: "3", ml: 300 }],
        updatedAt: Date.now(),
      });
    });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.entries).toHaveLength(3);
    const totalMl = updated!.entries.reduce((sum: number, e: any) => sum + e.ml, 0);
    expect(totalMl).toBe(1050);
  });

  test("daily logs are independent per date", async () => {
    const t = convexTest(schema, modules);
    const userId = "water-multi-day-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("waterLogs", {
        userId, date: "2024-01-15", entries: [{ id: "a", ml: 2000 }], updatedAt: Date.now(),
      });
      await ctx.db.insert("waterLogs", {
        userId, date: "2024-01-16", entries: [{ id: "b", ml: 1500 }], updatedAt: Date.now(),
      });
    });

    const logs = await t.run(async (ctx) => {
      return ctx.db
        .query("waterLogs")
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
    });

    expect(logs).toHaveLength(2);
    const jan15 = logs.find((l) => l.date === "2024-01-15");
    const jan16 = logs.find((l) => l.date === "2024-01-16");
    expect(jan15!.entries[0].ml).toBe(2000);
    expect(jan16!.entries[0].ml).toBe(1500);
  });
});

// ── addEntry mutation tests ───────────────────────────────────────────────────

describe("addEntry Convex mutation", () => {
  test("addEntry throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.water.addEntry, {
        date: "2024-01-15",
        entry: { id: "e1", amountMl: 250, loggedAt: "2024-01-15T08:00:00Z" },
      })
    ).rejects.toThrow();
  });

  test("addEntry creates a new waterLog when none exists for the date", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "test-user" }, async () => {
      const result = await t.mutation(api.logs.water.addEntry, {
        date: "2024-03-01",
        entry: { id: "entry-1", amountMl: 500, loggedAt: "2024-03-01T09:00:00Z" },
      });
      expect(result).toEqual({ ok: true });
    });

    // Verify the entry was persisted via getDay
    await t.withIdentity({ name: "test-user" }, async () => {
      const entries = await t.query(api.logs.water.getDay, { date: "2024-03-01" });
      expect(entries).toHaveLength(1);
      expect((entries as any[])[0].id).toBe("entry-1");
      expect((entries as any[])[0].amountMl).toBe(500);
    });
  });

  test("addEntry appends to existing entries without overwriting them", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "test-user" }, async () => {
      // Add first entry
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-03-02",
        entry: { id: "entry-a", amountMl: 250, loggedAt: "2024-03-02T08:00:00Z" },
      });
      // Add second entry to the same day
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-03-02",
        entry: { id: "entry-b", amountMl: 750, loggedAt: "2024-03-02T10:00:00Z" },
      });
    });

    await t.withIdentity({ name: "test-user" }, async () => {
      const entries = await t.query(api.logs.water.getDay, { date: "2024-03-02" });
      expect(entries).toHaveLength(2);
      const ids = (entries as any[]).map((e) => e.id);
      expect(ids).toContain("entry-a");
      expect(ids).toContain("entry-b");
    });
  });

  test("addEntry preserves original entries when appending", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "test-user" }, async () => {
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-03-03",
        entry: { id: "orig", amountMl: 1000, loggedAt: "2024-03-03T07:00:00Z" },
      });
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-03-03",
        entry: { id: "new", amountMl: 300, loggedAt: "2024-03-03T11:00:00Z" },
      });
    });

    await t.withIdentity({ name: "test-user" }, async () => {
      const entries = await t.query(api.logs.water.getDay, { date: "2024-03-03" }) as any[];
      const orig = entries.find((e) => e.id === "orig");
      expect(orig).toBeDefined();
      expect(orig.amountMl).toBe(1000);
    });
  });

  test("addEntry for different dates creates independent logs", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "test-user" }, async () => {
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-03-10",
        entry: { id: "d10", amountMl: 500, loggedAt: "2024-03-10T08:00:00Z" },
      });
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-03-11",
        entry: { id: "d11", amountMl: 750, loggedAt: "2024-03-11T08:00:00Z" },
      });
    });

    await t.withIdentity({ name: "test-user" }, async () => {
      const day10 = await t.query(api.logs.water.getDay, { date: "2024-03-10" }) as any[];
      const day11 = await t.query(api.logs.water.getDay, { date: "2024-03-11" }) as any[];
      expect(day10).toHaveLength(1);
      expect(day11).toHaveLength(1);
      expect(day10[0].amountMl).toBe(500);
      expect(day11[0].amountMl).toBe(750);
    });
  });

  test("addEntry total amountMl accumulates correctly across multiple calls", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "test-user" }, async () => {
      const amounts = [150, 250, 500, 750, 1000];
      for (let i = 0; i < amounts.length; i++) {
        await t.mutation(api.logs.water.addEntry, {
          date: "2024-03-15",
          entry: {
            id: `entry-${i}`,
            amountMl: amounts[i],
            loggedAt: `2024-03-15T0${i + 8}:00:00Z`,
          },
        });
      }
    });

    await t.withIdentity({ name: "test-user" }, async () => {
      const entries = await t.query(api.logs.water.getDay, { date: "2024-03-15" }) as any[];
      expect(entries).toHaveLength(5);
      const total = entries.reduce((sum: number, e: any) => sum + e.amountMl, 0);
      expect(total).toBe(2650);
    });
  });

  test("addEntry stores the entry id, amountMl, and loggedAt faithfully", async () => {
    const t = convexTest(schema, modules);
    const entryData = {
      id: "unique-uuid-123",
      amountMl: 350,
      loggedAt: "2024-04-01T14:30:00.000Z",
    };

    await t.withIdentity({ name: "test-user" }, async () => {
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-04-01",
        entry: entryData,
      });
    });

    await t.withIdentity({ name: "test-user" }, async () => {
      const entries = await t.query(api.logs.water.getDay, { date: "2024-04-01" }) as any[];
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(entryData.id);
      expect(entries[0].amountMl).toBe(entryData.amountMl);
      expect(entries[0].loggedAt).toBe(entryData.loggedAt);
    });
  });
});

// ── removeEntry mutation tests ────────────────────────────────────────────────

describe("removeEntry Convex mutation", () => {
  test("removeEntry throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.water.removeEntry, {
        date: "2024-01-15",
        id: "entry-1",
      })
    ).rejects.toThrow();
  });

  test("removeEntry deletes only the matching entry", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "test-user" }, async () => {
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-05-01",
        entry: { id: "entry-a", amountMl: 250, loggedAt: "2024-05-01T08:00:00Z" },
      });
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-05-01",
        entry: { id: "entry-b", amountMl: 500, loggedAt: "2024-05-01T09:00:00Z" },
      });

      const result = await t.mutation(api.logs.water.removeEntry, {
        date: "2024-05-01",
        id: "entry-a",
      });
      expect(result).toEqual({ ok: true });
    });

    await t.withIdentity({ name: "test-user" }, async () => {
      const entries = await t.query(api.logs.water.getDay, { date: "2024-05-01" }) as any[];
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("entry-b");
    });
  });

  test("removeEntry is safe for missing entry ids", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "test-user" }, async () => {
      await t.mutation(api.logs.water.addEntry, {
        date: "2024-05-02",
        entry: { id: "entry-a", amountMl: 250, loggedAt: "2024-05-02T08:00:00Z" },
      });

      await expect(
        t.mutation(api.logs.water.removeEntry, {
          date: "2024-05-02",
          id: "missing",
        })
      ).resolves.toEqual({ ok: true });

      const entries = await t.query(api.logs.water.getDay, { date: "2024-05-02" }) as any[];
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("entry-a");
    });
  });
});
