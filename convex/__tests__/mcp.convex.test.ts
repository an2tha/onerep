import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const USER = "mcp-user";

/** The hash the HTTP layer would compute for a presented token. */
async function hashOf(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("mcp tokens", () => {
  test("list returns nothing when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.mcp.tokens.list, {})).resolves.toEqual([]);
  });

  test("a created token resolves to its owner and scopes", async () => {
    const t = convexTest(schema, modules);
    const tokenHash = await hashOf("onerep_mcp_test-token");

    await t.withIdentity({ name: USER }).mutation(internal.mcp.tokens.store, {
      name: "Laptop",
      scopes: ["read"],
      tokenHash,
      prefix: "test-t",
    });

    const resolved = await t.query(internal.mcp.tokens.resolve, { tokenHash });
    expect(resolved?.scopes).toEqual(["read"]);
  });

  test("the plaintext is never stored or returned", async () => {
    const t = convexTest(schema, modules);
    const tokenHash = await hashOf("onerep_mcp_secret");

    const asUser = t.withIdentity({ name: USER });
    await asUser.mutation(internal.mcp.tokens.store, {
      name: "Laptop",
      scopes: ["read", "write"],
      tokenHash,
      prefix: "secre",
    });

    const rows = await asUser.query(api.mcp.tokens.list, {});
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("onerep_mcp_secret");
    expect(JSON.stringify(rows)).not.toContain(tokenHash);
  });

  test("a revoked token stops resolving", async () => {
    const t = convexTest(schema, modules);
    const tokenHash = await hashOf("onerep_mcp_revoke-me");

    const asUser = t.withIdentity({ name: USER });
    await asUser.mutation(internal.mcp.tokens.store, {
      name: "Old laptop",
      scopes: ["read"],
      tokenHash,
      prefix: "revoke",
    });
    const [row] = await asUser.query(api.mcp.tokens.list, {});
    await asUser.mutation(api.mcp.tokens.revoke, { id: row.id });

    expect(await asUser.query(api.mcp.tokens.list, {})).toEqual([]);

    await expect(
      t.query(internal.mcp.tokens.resolve, { tokenHash }),
    ).resolves.toBeNull();
  });

  test("one user cannot revoke another's token", async () => {
    const t = convexTest(schema, modules);
    const tokenHash = await hashOf("onerep_mcp_owned");

    await t
      .withIdentity({ name: "mcp-owner" })
      .mutation(internal.mcp.tokens.store, {
        name: "Owned",
        scopes: ["read"],
        tokenHash,
        prefix: "owned",
      });

    const resolved = await t.query(internal.mcp.tokens.resolve, { tokenHash });
    const asStranger = t.withIdentity({ name: "mcp-stranger" });

    expect(await asStranger.query(api.mcp.tokens.list, {})).toEqual([]);
    await expect(
      asStranger.mutation(api.mcp.tokens.revoke, { id: resolved!.id }),
    ).rejects.toThrow();
  });

  test("ten live tokens is the ceiling", async () => {
    const t = convexTest(schema, modules);

    const asUser = t.withIdentity({ name: "mcp-hoarder" });
    for (let index = 0; index < 10; index++) {
      await asUser.mutation(internal.mcp.tokens.store, {
        name: `Token ${index}`,
        scopes: ["read"],
        tokenHash: await hashOf(`token-${index}`),
        prefix: `t${index}`,
      });
    }

    await expect(
      asUser.mutation(internal.mcp.tokens.store, {
        name: "One too many",
        scopes: ["read"],
        tokenHash: await hashOf("token-overflow"),
        prefix: "over",
      }),
    ).rejects.toThrow();
  });
});

describe("mcp data layer", () => {
  test("writes land where the app would have put them", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.mcp.data.logWater, {
      userId: USER,
      date: "2026-04-15",
      amountMl: 500,
    });
    await t.mutation(internal.mcp.data.logFood, {
      userId: USER,
      date: "2026-04-15",
      name: "Oats",
      calories: 400,
      protein: 15,
    });
    await t.mutation(internal.mcp.data.logWorkout, {
      userId: USER,
      date: "2026-04-15",
      durationMinutes: 50,
      exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }],
    });
    await t.mutation(internal.mcp.data.markRestDays, {
      userId: USER,
      dates: ["2026-04-16"],
    });

    const day = await t.query(internal.mcp.data.getDay, {
      userId: USER,
      date: "2026-04-15",
    });
    expect(day.waterMl).toBe(500);
    expect(day.nutrition.calories).toBe(400);
    expect(day.workouts).toHaveLength(1);
    expect(day.workouts[0].exercises[0].name).toBe("Squat");
    expect(day.restDay).toBe(false);

    const rest = await t.query(internal.mcp.data.getDay, {
      userId: USER,
      date: "2026-04-16",
    });
    expect(rest.restDay).toBe(true);
  });

  test("a day already holding two sessions refuses a third", async () => {
    const t = convexTest(schema, modules);
    const exercises = [{ name: "Row", sets: [{ reps: 8 }] }];

    for (let index = 0; index < 2; index++) {
      await t.mutation(internal.mcp.data.logWorkout, {
        userId: "mcp-full-day",
        date: "2026-04-15",
        exercises,
      });
    }

    await expect(
      t.mutation(internal.mcp.data.logWorkout, {
        userId: "mcp-full-day",
        date: "2026-04-15",
        exercises,
      }),
    ).rejects.toThrow(/two sessions/i);
  });

  test("nonsense is refused rather than stored", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.mcp.data.logWater, {
        userId: USER,
        date: "2026-04-15",
        amountMl: 99_999,
      }),
    ).rejects.toThrow();

    await expect(
      t.mutation(internal.mcp.data.logWeight, {
        userId: USER,
        date: "2026-04-15",
        weightKg: 4,
      }),
    ).rejects.toThrow();

    await expect(
      t.mutation(internal.mcp.data.logWorkout, {
        userId: USER,
        date: "2026-04-15",
        exercises: [],
      }),
    ).rejects.toThrow();
  });

  test("a second weigh-in on one day replaces the first", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.mcp.data.logWeight, {
      userId: "mcp-scale",
      date: "2026-04-15",
      weightKg: 80,
    });
    await t.mutation(internal.mcp.data.logWeight, {
      userId: "mcp-scale",
      date: "2026-04-15",
      weightKg: 79.5,
    });

    const rows = await t.query(internal.mcp.data.listBodyMeasurements, {
      userId: "mcp-scale",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].weightKg).toBe(79.5);
  });

  test("a range read never crosses into another account", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.mcp.data.logFood, {
      userId: "mcp-a",
      date: "2026-04-15",
      name: "Theirs",
      calories: 500,
    });

    const range = await t.query(internal.mcp.data.getRange, {
      userId: "mcp-b",
      start: "2026-04-01",
      end: "2026-04-30",
    });
    expect(range.nutrition).toEqual([]);
    expect(range.workouts).toEqual([]);
  });
});
