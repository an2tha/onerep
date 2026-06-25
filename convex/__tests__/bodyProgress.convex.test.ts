import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("bodyProgress Convex functions", () => {
  test("list returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.bodyProgress.list, {})).resolves.toEqual([]);
  });

  test("save throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.bodyProgress.save, {
        clientId: "entry-1",
        loggedAt: "2026-06-24",
        weightKg: 80,
      }),
    ).rejects.toThrow("Unauthenticated");
  });

  test("save creates and lists measurements sorted by loggedAt then createdAt", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "body-user" }, async () => {
      await t.mutation(api.bodyProgress.save, {
        clientId: "later",
        loggedAt: "2026-06-25",
        weightKg: 80,
        notes: "later",
      });
      await t.mutation(api.bodyProgress.save, {
        clientId: "earlier",
        loggedAt: "2026-06-24",
        waistCm: 82,
      });
    });

    await t.withIdentity({ name: "body-user" }, async () => {
      const entries = await t.query(api.bodyProgress.list, {});

      expect(entries.map((entry) => entry.clientId)).toEqual(["earlier", "later"]);
      expect(entries[0]).not.toHaveProperty("userId");
      expect(entries[0]).toMatchObject({
        loggedAt: "2026-06-24",
        waistCm: 82,
        photoUrl: undefined,
      });
    });
  });

  test("save is idempotent per clientId and patches existing measurements", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "body-user" }, async () => {
      await t.mutation(api.bodyProgress.save, {
        clientId: "same-client",
        loggedAt: "2026-06-24",
        weightKg: 80,
        notes: "first",
      });
      await t.mutation(api.bodyProgress.save, {
        clientId: "same-client",
        loggedAt: "2026-06-25",
        weightKg: 79,
        bodyFatPct: 18,
        notes: "updated",
      });

      const entries = await t.query(api.bodyProgress.list, {});
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        clientId: "same-client",
        loggedAt: "2026-06-25",
        weightKg: 79,
        bodyFatPct: 18,
        notes: "updated",
      });
    });
  });

  test("remove deletes the current user's measurement and is safe for missing ids", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "body-user" }, async () => {
      await t.mutation(api.bodyProgress.save, {
        clientId: "remove-me",
        loggedAt: "2026-06-24",
        weightKg: 80,
      });
      await expect(
        t.mutation(api.bodyProgress.remove, { clientId: "missing" }),
      ).resolves.toEqual({ ok: true });
      await expect(
        t.mutation(api.bodyProgress.remove, { clientId: "remove-me" }),
      ).resolves.toEqual({ ok: true });
      await expect(t.query(api.bodyProgress.list, {})).resolves.toEqual([]);
    });
  });

  test("measurements are isolated between authenticated users", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "body-user-a" }, async () => {
      await t.mutation(api.bodyProgress.save, {
        clientId: "shared-client-id",
        loggedAt: "2026-06-24",
        weightKg: 80,
      });
    });
    await t.withIdentity({ name: "body-user-b" }, async () => {
      await t.mutation(api.bodyProgress.save, {
        clientId: "shared-client-id",
        loggedAt: "2026-06-24",
        weightKg: 70,
      });
    });

    await t.withIdentity({ name: "body-user-a" }, async () => {
      const entries = await t.query(api.bodyProgress.list, {});
      expect(entries).toHaveLength(1);
      expect(entries[0].weightKg).toBe(80);
    });
  });
});
