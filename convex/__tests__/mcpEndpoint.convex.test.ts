import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { KEY_RATE_LIMITS } from "../mcp/tokens";

const modules = import.meta.glob("../**/*.ts");

/**
 * The endpoint end to end, over the wire it actually serves.
 *
 * These go through `t.fetch`, so what is exercised is the real HTTP route,
 * the real bearer check and the real JSON-RPC envelope — not a hand-rolled
 * approximation of them.
 */

async function hashOf(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type Harness = ReturnType<typeof convexTest>;

async function grantToken(
  t: Harness,
  plaintext: string,
  scopes: Array<"read" | "write">,
) {
  await t
    .withIdentity({ name: `owner-${plaintext}` })
    .mutation(internal.mcp.tokens.store, {
      name: "Test",
      scopes,
      tokenHash: await hashOf(plaintext),
      prefix: plaintext.slice(0, 5),
    });
}

async function rpc(
  t: Harness,
  method: string,
  params?: Record<string, unknown>,
  token?: string,
) {
  const response = await t.fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = response.status === 202 ? null : await response.json();
  return { status: response.status, body, response };
}

/** Tool payloads come back as JSON inside a text content block. */
function toolPayload(body: {
  result?: { content?: Array<{ text?: string }>; isError?: boolean };
}) {
  return JSON.parse(body.result?.content?.[0]?.text ?? "null");
}

describe("the MCP endpoint", () => {
  test("refuses an unauthenticated call and says how to fix it", async () => {
    const t = convexTest(schema, modules);
    const { status, body, response } = await rpc(t, "initialize");

    expect(status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(body.error.message).toMatch(/token/i);
  });

  test("refuses a token that is not ours", async () => {
    const t = convexTest(schema, modules);
    const { status } = await rpc(t, "initialize", {}, "onerep_mcp_nope");
    expect(status).toBe(401);
  });

  test("a revoked token stops working immediately", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "revoke-me", ["read"]);

    expect((await rpc(t, "ping", {}, "revoke-me")).status).toBe(200);

    const asOwner = t.withIdentity({ name: "owner-revoke-me" });
    const [row] = await asOwner.query(api.mcp.tokens.list, {});
    await asOwner.mutation(api.mcp.tokens.revoke, { id: row.id });

    expect((await rpc(t, "ping", {}, "revoke-me")).status).toBe(401);
  });

  test("initialize answers with the protocol version and tool capability", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "init-token", ["read"]);

    const { body } = await rpc(t, "initialize", {}, "init-token");
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.serverInfo.name).toBe("onerep");
  });

  test("a read-only token is never shown a write tool", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "reader", ["read"]);

    const { body } = await rpc(t, "tools/list", {}, "reader");
    const names = body.result.tools.map((tool: { name: string }) => tool.name);

    expect(names).toContain("get_day");
    expect(names).not.toContain("log_food");
    expect(
      body.result.tools.every(
        (tool: { annotations: { destructiveHint: boolean } }) =>
          tool.annotations.destructiveHint === false,
      ),
    ).toBe(true);
  });

  test("and cannot call one either, listed or not", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "reader-2", ["read"]);

    const { body } = await rpc(
      t,
      "tools/call",
      { name: "log_water", arguments: { amountMl: 250 } },
      "reader-2",
    );

    expect(body.result.isError).toBe(true);
    expect(toolPayload(body).error).toMatch(/needs write/i);
  });

  test("a write token logs, and the read side sees it", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "writer", ["read", "write"]);

    const logged = await rpc(
      t,
      "tools/call",
      {
        name: "log_food",
        arguments: {
          name: "Porridge",
          calories: 350,
          protein: 12,
          date: "2026-04-15",
        },
      },
      "writer",
    );
    expect(logged.body.result.isError).toBe(false);

    const read = await rpc(
      t,
      "tools/call",
      { name: "get_day", arguments: { date: "2026-04-15" } },
      "writer",
    );
    const day = toolPayload(read.body);
    expect(day.nutrition.calories).toBe(350);
    expect(day.nutrition.entries[0].name).toBe("Porridge");
  });

  test("one token cannot read another account's day", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "writer-a", ["read", "write"]);
    await grantToken(t, "reader-b", ["read"]);

    await rpc(
      t,
      "tools/call",
      {
        name: "log_food",
        arguments: { name: "Theirs", calories: 900, date: "2026-04-15" },
      },
      "writer-a",
    );

    const read = await rpc(
      t,
      "tools/call",
      { name: "get_day", arguments: { date: "2026-04-15" } },
      "reader-b",
    );
    expect(toolPayload(read.body).nutrition.calories).toBe(0);
  });

  test("a bad argument comes back as a tool error the model can act on", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "writer-3", ["read", "write"]);

    const { body } = await rpc(
      t,
      "tools/call",
      { name: "get_day", arguments: { date: "last tuesday" } },
      "writer-3",
    );

    expect(body.result.isError).toBe(true);
    expect(toolPayload(body).error).toMatch(/YYYY-MM-DD/);
  });

  test("an unknown tool is a protocol error, not a silent success", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "reader-4", ["read"]);

    const { body } = await rpc(
      t,
      "tools/call",
      { name: "delete_everything" },
      "reader-4",
    );
    expect(body.error.code).toBe(-32602);
  });

  test("no tool deletes anything", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "writer-5", ["read", "write"]);

    const { body } = await rpc(t, "tools/list", {}, "writer-5");
    const names: string[] = body.result.tools.map(
      (tool: { name: string }) => tool.name,
    );
    expect(names.some((name) => /delete|remove|clear|reset/.test(name))).toBe(
      false,
    );
  });

  test("notifications are accepted without a body", async () => {
    const t = convexTest(schema, modules);
    const { status } = await rpc(t, "notifications/initialized");
    expect(status).toBe(202);
  });

  test("a spent budget comes back as a tool error, not a dead transport", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "skint", ["read", "write"]);
    const token = await t.query(internal.mcp.tokens.resolve, {
      tokenHash: await hashOf("skint"),
    });

    // Sixty real writes to prove a counter would be a slow test.
    const windowStart =
      Math.floor(Date.now() / KEY_RATE_LIMITS.windowMs) *
      KEY_RATE_LIMITS.windowMs;
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimitBuckets", {
        key: `mcp:write:${token!.id}:${token!.userId}:${windowStart}`,
        userId: token!.userId,
        action: `mcp:write:${token!.id}`,
        windowStart,
        count: KEY_RATE_LIMITS.write,
        expiresAt: windowStart + KEY_RATE_LIMITS.windowMs * 2,
      });
    });

    const { status, body } = await rpc(
      t,
      "tools/call",
      { name: "log_water", arguments: { amountMl: 250 } },
      "skint",
    );

    // 200 with isError: the model should read this and stop, not retry a
    // transport failure it cannot interpret.
    expect(status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(toolPayload(body).error).toMatch(/budget for the hour/i);

    // Reads are a separate bucket, so the agent can still look at the log.
    const read = await rpc(
      t,
      "tools/call",
      { name: "get_goals", arguments: {} },
      "skint",
    );
    expect(read.body.result.isError).toBe(false);
  });

  test("answers a preflight without asking for a token", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/mcp", { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
  });

  test("an unknown method is reported as such", async () => {
    const t = convexTest(schema, modules);
    await grantToken(t, "reader-5", ["read"]);

    const { body } = await rpc(t, "resources/list", {}, "reader-5");
    expect(body.error.code).toBe(-32601);
  });
});
