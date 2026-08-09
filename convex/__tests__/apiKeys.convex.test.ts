import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { KEY_RATE_LIMITS, sha256Hex } from "../mcp/tokens";

const modules = import.meta.glob("../**/*.ts");

/**
 * The credential itself: minting it, normalising it, and spending its budget.
 *
 * `mcp.convex.test.ts` covers what a stored key does; this covers how one comes
 * to exist. The distinction matters because `create` is the only place the
 * plaintext ever exists, and the only thing that makes it trustworthy is that
 * the string handed to the user hashes to the row we kept — which is exactly
 * the sort of thing that stays true right up until somebody "tidies" the
 * hashing and nobody notices for a month.
 */

type Harness = ReturnType<typeof convexTest>;

async function mint(
  t: Harness,
  user: string,
  args: { name: string; scopes: Array<"read" | "write"> },
) {
  return t.withIdentity({ name: user }).action(api.mcp.tokens.create, args);
}

/**
 * Fills a key's bucket to `count`, in the current window or an offset one.
 *
 * Spending six hundred reads for real would be a slow way to prove
 * arithmetic, so the bucket is written the way `claimRateLimit` would find it.
 * The tests below only mean anything because the same helper, with the only
 * difference being the window, produces opposite outcomes.
 */
async function fillBudget(
  t: Harness,
  action: string,
  userId: string,
  count: number,
  windowOffset = 0,
) {
  const now =
    Math.floor(Date.now() / KEY_RATE_LIMITS.windowMs) *
    KEY_RATE_LIMITS.windowMs;
  const windowStart = now + windowOffset * KEY_RATE_LIMITS.windowMs;
  await t.run(async (ctx) => {
    await ctx.db.insert("rateLimitBuckets", {
      key: `${action}:${userId}:${windowStart}`,
      userId,
      action,
      windowStart,
      count,
      expiresAt: windowStart + KEY_RATE_LIMITS.windowMs * 2,
    });
  });
}

describe("minting a key", () => {
  test("hands back a key that is prefixed, long, and not the last one", async () => {
    const t = convexTest(schema, modules);

    const first = await mint(t, "minter", { name: "One", scopes: ["read"] });
    const second = await mint(t, "minter", { name: "Two", scopes: ["read"] });

    for (const issued of [first, second]) {
      expect(issued.token.startsWith("onerep_sk_")).toBe(true);
      // 32 random bytes, base64url. Short enough to paste, long enough that
      // guessing is not a strategy.
      expect(issued.token.length).toBeGreaterThan(40);
    }
    expect(first.token).not.toBe(second.token);
    expect(first.prefix).not.toBe(second.prefix);
  });

  /** The whole contract of "shown once": that the once is worth something. */
  test("hands back the key that actually resolves", async () => {
    const t = convexTest(schema, modules);
    const { token } = await mint(t, "minter-2", {
      name: "Laptop",
      scopes: ["read", "write"],
    });

    const resolved = await t.query(internal.mcp.tokens.resolve, {
      tokenHash: await sha256Hex(token),
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.scopes).toEqual(["read", "write"]);
  });

  test("stores a prefix that labels the key without reconstructing it", async () => {
    const t = convexTest(schema, modules);
    const { token, prefix } = await mint(t, "minter-3", {
      name: "Laptop",
      scopes: ["read"],
    });

    expect(token).toContain(prefix);
    expect(prefix.length).toBeLessThanOrEqual(6);

    const [row] = await t
      .withIdentity({ name: "minter-3" })
      .query(api.mcp.tokens.list, {});
    expect(row.prefix).toBe(prefix);
  });

  test("keeps neither the plaintext nor anything that reverses to it", async () => {
    const t = convexTest(schema, modules);
    const { token } = await mint(t, "minter-4", {
      name: "Laptop",
      scopes: ["read"],
    });

    const stored = await t.run(async (ctx) =>
      ctx.db.query("mcpTokens").collect(),
    );
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored[0]!.tokenHash).toBe(await sha256Hex(token));
  });

  test("names a key that arrived without a usable one", async () => {
    const t = convexTest(schema, modules);
    await mint(t, "minter-5", { name: "   ", scopes: ["read"] });

    const [row] = await t
      .withIdentity({ name: "minter-5" })
      .query(api.mcp.tokens.list, {});
    expect(row.name).toBe("Untitled key");
  });

  test("cuts a name nobody meant to be that long", async () => {
    const t = convexTest(schema, modules);
    await mint(t, "minter-6", { name: "x".repeat(200), scopes: ["read"] });

    const [row] = await t
      .withIdentity({ name: "minter-6" })
      .query(api.mcp.tokens.list, {});
    expect(row.name).toHaveLength(60);
  });

  /** A key that can do nothing is a support ticket, not a security feature. */
  test("gives a key with no scopes the read scope", async () => {
    const t = convexTest(schema, modules);
    const { token } = await mint(t, "minter-7", { name: "Empty", scopes: [] });

    const resolved = await t.query(internal.mcp.tokens.resolve, {
      tokenHash: await sha256Hex(token),
    });
    expect(resolved!.scopes).toEqual(["read"]);
  });

  test("refuses to mint one without a session", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.mcp.tokens.create, { name: "Nobody", scopes: ["read"] }),
    ).rejects.toThrow();
  });
});

describe("spending a key's budget", () => {
  async function keyFor(
    t: Harness,
    user: string,
    scopes: Array<"read" | "write">,
  ) {
    const { token } = await mint(t, user, { name: "Test", scopes });
    const resolved = await t.query(internal.mcp.tokens.resolve, {
      tokenHash: await sha256Hex(token),
    });
    return resolved!;
  }

  test("stamps the key as used, which is the only trace a key leaves", async () => {
    const t = convexTest(schema, modules);
    const key = await keyFor(t, "spender", ["read"]);

    const [before] = await t
      .withIdentity({ name: "spender" })
      .query(api.mcp.tokens.list, {});
    expect(before.lastUsedAt).toBeNull();

    await t.mutation(internal.mcp.tokens.touch, { id: key.id, write: false });

    const [after] = await t
      .withIdentity({ name: "spender" })
      .query(api.mcp.tokens.list, {});
    expect(after.lastUsedAt).toBeGreaterThan(0);
  });

  test("refuses once the hourly budget is gone", async () => {
    const t = convexTest(schema, modules);
    const key = await keyFor(t, "spender-2", ["read", "write"]);

    await fillBudget(t, `mcp:read:${key.id}`, key.userId, KEY_RATE_LIMITS.read);

    await expect(
      t.mutation(internal.mcp.tokens.touch, { id: key.id, write: false }),
    ).rejects.toThrow(/RATE_LIMITED/);
  });

  test("counts reads and writes against separate budgets", async () => {
    const t = convexTest(schema, modules);
    const key = await keyFor(t, "spender-3", ["read", "write"]);

    await fillBudget(t, `mcp:read:${key.id}`, key.userId, KEY_RATE_LIMITS.read);

    // Reads are gone; a write is a different bucket and still goes through.
    await expect(
      t.mutation(internal.mcp.tokens.touch, { id: key.id, write: false }),
    ).rejects.toThrow(/RATE_LIMITED/);
    await expect(
      t.mutation(internal.mcp.tokens.touch, { id: key.id, write: true }),
    ).resolves.not.toThrow();
  });

  /**
   * The reason the limit is keyed by key rather than by user: one agent stuck
   * in a loop must not lock its owner out of their own account.
   */
  test("does not let one exhausted key starve another of the same owner", async () => {
    const t = convexTest(schema, modules);
    const busy = await keyFor(t, "spender-4", ["read"]);
    const { token: spareToken } = await mint(t, "spender-4", {
      name: "Spare",
      scopes: ["read"],
    });
    const spare = await t.query(internal.mcp.tokens.resolve, {
      tokenHash: await sha256Hex(spareToken),
    });

    expect(spare!.userId).toBe(busy.userId);
    await fillBudget(
      t,
      `mcp:read:${busy.id}`,
      busy.userId,
      KEY_RATE_LIMITS.read,
    );

    await expect(
      t.mutation(internal.mcp.tokens.touch, { id: busy.id, write: false }),
    ).rejects.toThrow(/RATE_LIMITED/);
    await expect(
      t.mutation(internal.mcp.tokens.touch, { id: spare!.id, write: false }),
    ).resolves.not.toThrow();
  });

  test("starts the budget again in the next window", async () => {
    const t = convexTest(schema, modules);
    const key = await keyFor(t, "spender-5", ["read"]);

    // An exhausted bucket belonging to the previous hour must not count.
    await fillBudget(
      t,
      `mcp:read:${key.id}`,
      key.userId,
      KEY_RATE_LIMITS.read,
      -1,
    );

    await expect(
      t.mutation(internal.mcp.tokens.touch, { id: key.id, write: false }),
    ).resolves.not.toThrow();
  });

  test("refuses to spend anything on a revoked key", async () => {
    const t = convexTest(schema, modules);
    const key = await keyFor(t, "spender-6", ["read"]);

    await t
      .withIdentity({ name: "spender-6" })
      .mutation(api.mcp.tokens.revoke, { id: key.id });

    await expect(
      t.mutation(internal.mcp.tokens.touch, { id: key.id, write: false }),
    ).rejects.toThrow(/revoked/i);
  });
});
