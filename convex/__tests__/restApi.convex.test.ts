import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { UNROUTED_TOOLS } from "../api/rest";
import { KEY_RATE_LIMITS } from "../mcp/tokens";

const modules = import.meta.glob("../**/*.ts");

/**
 * The REST API over the wire it actually serves.
 *
 * Everything goes through `t.fetch`, so the real router, the real bearer
 * check and the real status codes are what get exercised. The point of most of
 * these is the negative case: what a key is refused matters more than what it
 * is granted.
 */

async function hashOf(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type Harness = ReturnType<typeof convexTest>;

async function grantKey(
  t: Harness,
  plaintext: string,
  scopes: Array<"read" | "write" | "delete">,
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

async function call(
  t: Harness,
  method: string,
  path: string,
  options: {
    key?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const response = await t.fetch(path, {
    method,
    headers: {
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}),
      ...options.headers,
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    response,
  };
}

describe("the REST API", () => {
  test("refuses an unauthenticated call and says where to get a key", async () => {
    const t = convexTest(schema, modules);
    const { status, body, response } = await call(t, "GET", "/v1/goals");

    expect(status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toMatch(/Settings → API & MCP/);
  });

  test("refuses a key that is not ours", async () => {
    const t = convexTest(schema, modules);
    const { status } = await call(t, "GET", "/v1/goals", { key: "nope" });
    expect(status).toBe(401);
  });

  test("a revoked key stops working immediately", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-revoke", ["read"]);

    expect(
      (await call(t, "GET", "/v1/me", { key: "rest-revoke" })).status,
    ).toBe(200);

    const asOwner = t.withIdentity({ name: "owner-rest-revoke" });
    const [row] = await asOwner.query(api.mcp.tokens.list, {});
    await asOwner.mutation(api.mcp.tokens.revoke, { id: row.id });

    expect(
      (await call(t, "GET", "/v1/me", { key: "rest-revoke" })).status,
    ).toBe(401);
  });

  test("an unknown path 404s only after the key checks out", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-404", ["read"]);

    // No key: nothing to learn about which paths exist.
    expect((await call(t, "GET", "/v1/secrets")).status).toBe(401);

    const { status, body } = await call(t, "GET", "/v1/secrets", {
      key: "rest-404",
    });
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  test("the wrong method is a 405 with an Allow header, not a 404", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-405", ["read", "write"]);

    const { status, response, body } = await call(t, "GET", "/v1/water", {
      key: "rest-405",
    });
    expect(status).toBe(405);
    expect(body.error.code).toBe("method_not_allowed");
    expect(response.headers.get("Allow")).toContain("POST");
  });

  test("the index lists only what this key may call", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-index", ["read"]);

    const { body } = await call(t, "GET", "/v1", { key: "rest-index" });
    const paths = body.routes.map(
      (route: { method: string; path: string }) =>
        `${route.method} ${route.path}`,
    );

    expect(paths).toContain("GET /v1/days/:date");
    expect(paths).not.toContain("POST /v1/food");
  });

  test("/v1/me reports the key's scopes and budget", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-me", ["read", "write"]);

    const { body } = await call(t, "GET", "/v1/me", { key: "rest-me" });
    expect(body.scopes).toEqual(["read", "write"]);
    expect(body.limits.writePerHour).toBeGreaterThan(0);
  });

  test("a read-only key is refused a write route with 403, not 404", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-reader", ["read"]);

    const { status, body } = await call(t, "POST", "/v1/water", {
      key: "rest-reader",
      body: { amountMl: 250 },
    });
    expect(status).toBe(403);
    expect(body.error.code).toBe("insufficient_scope");
    expect(body.error.message).toMatch(/needs write/);
  });

  test("a write key logs, and the read side sees it", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-writer", ["read", "write"]);

    const logged = await call(t, "POST", "/v1/food", {
      key: "rest-writer",
      body: {
        name: "Porridge",
        calories: 350,
        protein: 12,
        date: "2026-04-15",
      },
    });
    expect(logged.status).toBe(200);

    const day = await call(t, "GET", "/v1/days/2026-04-15", {
      key: "rest-writer",
    });
    expect(day.body.nutrition.calories).toBe(350);
    expect(day.body.nutrition.entries[0].name).toBe("Porridge");
  });

  test("one key cannot read another account's day", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-a", ["read", "write"]);
    await grantKey(t, "rest-b", ["read"]);

    await call(t, "POST", "/v1/food", {
      key: "rest-a",
      body: { name: "Theirs", calories: 900, date: "2026-04-15" },
    });

    const { body } = await call(t, "GET", "/v1/days/2026-04-15", {
      key: "rest-b",
    });
    expect(body.nutrition.calories).toBe(0);
  });

  test("a range needs both ends rather than quietly meaning today", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-range", ["read"]);

    const missing = await call(t, "GET", "/v1/days?start=2026-04-01", {
      key: "rest-range",
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toMatch(/end/);

    const ok = await call(
      t,
      "GET",
      "/v1/days?start=2026-04-01&end=2026-04-30",
      {
        key: "rest-range",
      },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.start).toBe("2026-04-01");
  });

  test("a misspelt field is refused rather than silently dropped", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-typo", ["read", "write"]);

    const { status, body } = await call(t, "POST", "/v1/food", {
      key: "rest-typo",
      body: { name: "Eggs", calories: 200, protien: 14 },
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("unknown_field");
    expect(body.error.message).toMatch(/protien/);
  });

  test("a bad date says what a good one looks like", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-date", ["read"]);

    const { status, body } = await call(t, "GET", "/v1/days/last-tuesday", {
      key: "rest-date",
    });
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/YYYY-MM-DD/);
  });

  test("a body that is not JSON is refused before it is parsed", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-form", ["read", "write"]);

    const response = await t.fetch("/v1/water", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Bearer rest-form",
      },
      body: "amountMl=250",
    });
    expect(response.status).toBe(415);
  });

  test("an oversized body is refused on its declared length", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-big", ["read", "write"]);

    const response = await t.fetch("/v1/food", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(1024 * 1024),
        Authorization: "Bearer rest-big",
      },
      body: JSON.stringify({ name: "x", calories: 1 }),
    });
    expect(response.status).toBe(413);
  });

  test("nothing is cached, and preflight needs no key", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-cache", ["read"]);

    const preflight = await t.fetch("/v1/goals", { method: "OPTIONS" });
    expect(preflight.status).toBe(204);

    const { response } = await call(t, "GET", "/v1/goals", {
      key: "rest-cache",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("errors never leak a stack, only a code and a sentence", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-stack", ["read"]);

    const { body } = await call(t, "GET", "/v1/days/nonsense", {
      key: "rest-stack",
    });
    expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:/);
  });

  test("a malformed escape in the path keeps the one error shape", async () => {
    // `decodeURIComponent("%")` throws, and an uncaught throw here would
    // answer with whatever the runtime felt like rather than our envelope.
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-escape", ["read"]);

    const { status, body } = await call(t, "GET", "/v1/days/%", {
      key: "rest-escape",
    });
    expect(status).toBe(404);
    expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
  });

  test("says when the budget is gone, and how long to wait", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-broke", ["read"]);
    const key = await t.query(internal.mcp.tokens.resolve, {
      tokenHash: await hashOf("rest-broke"),
    });

    // Spending 600 reads for real would be a slow way to prove arithmetic.
    const windowStart =
      Math.floor(Date.now() / KEY_RATE_LIMITS.windowMs) *
      KEY_RATE_LIMITS.windowMs;
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimitBuckets", {
        key: `mcp:read:${key!.id}:${key!.userId}:${windowStart}`,
        userId: key!.userId,
        action: `mcp:read:${key!.id}`,
        windowStart,
        count: KEY_RATE_LIMITS.read,
        expiresAt: windowStart + KEY_RATE_LIMITS.windowMs * 2,
      });
    });

    const { status, body, response } = await call(t, "GET", "/v1/goals", {
      key: "rest-broke",
    });

    expect(status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    // A number of seconds, not "later" — something a client can sleep on.
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  test("every tool the MCP surface has is reachable over REST too", async () => {
    // Otherwise the API is quietly the lesser door and nobody says so.
    expect(UNROUTED_TOOLS).toEqual([]);
  });

  test("no route deletes anything", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "rest-nodelete", ["read", "write"]);

    const { body } = await call(t, "GET", "/v1", { key: "rest-nodelete" });
    const paths: string[] = body.routes.map(
      (route: { path: string }) => route.path,
    );
    const methods: string[] = body.routes.map(
      (route: { method: string }) => route.method,
    );

    expect(
      methods.every((method) => method === "GET" || method === "POST"),
    ).toBe(true);
    expect(paths.some((path) => /delete|remove|clear|reset/.test(path))).toBe(
      false,
    );
  });
});

/**
 * Deleting, and taking it back.
 *
 * The undo is the whole argument for letting a key delete at all, so it is
 * tested end to end rather than by inspecting the row it writes: log something
 * over HTTP, delete it over HTTP, press the app's undo button, and check the
 * thing is where it was.
 */
describe("the delete scope", () => {
  const owner = "owner-rest-delete";

  async function seedFoodEntry(t: Harness, key: string) {
    const logged = await call(t, "POST", "/v1/food", {
      key,
      body: { name: "Porridge", calories: 320, date: "2026-04-15" },
    });
    expect(logged.status).toBe(200);
    return logged.body.entryId as string;
  }

  test("a read & write key is refused, and told what it is short of", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "onerep_sk_writeonly", ["read", "write"]);

    const entryId = await seedFoodEntry(t, "onerep_sk_writeonly");
    const refused = await call(t, "DELETE", `/v1/food/2026-04-15/${entryId}`, {
      key: "onerep_sk_writeonly",
    });

    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("insufficient_scope");
    expect(refused.body.error.message).toContain("needs delete");
  });

  test("a delete key removes the entry, and the coach can put it back", async () => {
    const t = convexTest(schema, modules);
    const plaintext = "onerep_sk_fulldelete";
    await grantKey(t, plaintext, ["read", "write", "delete"]);
    const asOwner = t.withIdentity({ name: `owner-${plaintext}` });

    const entryId = await seedFoodEntry(t, plaintext);
    const removed = await call(t, "DELETE", `/v1/food/2026-04-15/${entryId}`, {
      key: plaintext,
    });
    expect(removed.status).toBe(200);

    const afterDelete = await call(t, "GET", "/v1/days/2026-04-15", {
      key: plaintext,
    });
    expect(afterDelete.body.nutrition.entries).toHaveLength(0);

    // The same list the undo button in the app reads from.
    const history = await asOwner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    const event = history.find((entry) => entry.kind === "api_delete_food");
    expect(event).toBeDefined();
    expect(event!.summary).toContain("Porridge");

    await asOwner.mutation(api.ai.coachState.undoAction, { id: event!._id });

    const afterUndo = await call(t, "GET", "/v1/days/2026-04-15", {
      key: plaintext,
    });
    expect(afterUndo.body.nutrition.entries).toHaveLength(1);
    expect(afterUndo.body.nutrition.entries[0].name).toBe("Porridge");
    expect(afterUndo.body.nutrition.entries[0].id).toBe(entryId);
  });

  test("a write over the API is undoable too, not only a delete", async () => {
    const t = convexTest(schema, modules);
    const plaintext = "onerep_sk_undowrite";
    await grantKey(t, plaintext, ["read", "write"]);
    const asOwner = t.withIdentity({ name: `owner-${plaintext}` });

    await call(t, "POST", "/v1/water", {
      key: plaintext,
      body: { amountMl: 500, date: "2026-04-15" },
    });

    const history = await asOwner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    const event = history.find((entry) => entry.kind === "api_log_water");
    expect(event).toBeDefined();

    await asOwner.mutation(api.ai.coachState.undoAction, { id: event!._id });

    const day = await call(t, "GET", "/v1/days/2026-04-15", { key: plaintext });
    expect(day.body.waterMl).toBe(0);
  });

  test("rest days come back with the marking they had", async () => {
    const t = convexTest(schema, modules);
    const plaintext = "onerep_sk_restdays";
    await grantKey(t, plaintext, ["read", "write", "delete"]);
    const asOwner = t.withIdentity({ name: `owner-${plaintext}` });

    await call(t, "POST", "/v1/rest-days", {
      key: plaintext,
      body: { dates: ["2026-04-14"] },
    });
    const unmarked = await call(t, "DELETE", "/v1/rest-days", {
      key: plaintext,
      body: { dates: ["2026-04-14"] },
    });
    expect(unmarked.body).toEqual({ ok: true, unmarked: 1 });

    const history = await asOwner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    const event = history.find(
      (entry) => entry.kind === "api_delete_rest_days",
    );
    await asOwner.mutation(api.ai.coachState.undoAction, { id: event!._id });

    const day = await call(t, "GET", "/v1/days/2026-04-14", { key: plaintext });
    expect(day.body.restDay).toBe(true);
  });
});

describe("health data over the API", () => {
  test("reads days, and clears one the sensor got wrong", async () => {
    const t = convexTest(schema, modules);
    const plaintext = "onerep_sk_health";
    await grantKey(t, plaintext, ["read", "write", "delete"]);
    const asOwner = t.withIdentity({ name: `owner-${plaintext}` });

    // Synced by the phone, which is the only thing that writes these.
    await asOwner.mutation(api.logs.healthMetrics.sync, {
      provider: "apple_health",
      days: [
        { date: "2026-04-14", sleepMinutes: 421, steps: 8840, hrvMs: 68 },
        { date: "2026-04-15", sleepMinutes: 390, steps: 5210 },
      ],
    });

    const read = await call(
      t,
      "GET",
      "/v1/health/days?start=2026-04-14&end=2026-04-15",
      { key: plaintext },
    );
    expect(read.status).toBe(200);
    expect(read.body.days).toHaveLength(2);
    expect(read.body.days[0]).toMatchObject({
      date: "2026-04-14",
      sleepMinutes: 421,
      hrvMs: 68,
      restingHeartRateBpm: null,
    });

    const cleared = await call(t, "DELETE", "/v1/health/days/2026-04-14", {
      key: plaintext,
    });
    expect(cleared.status).toBe(200);

    const afterDelete = await call(
      t,
      "GET",
      "/v1/health/days?start=2026-04-14&end=2026-04-15",
      { key: plaintext },
    );
    expect(afterDelete.body.days).toHaveLength(1);

    const history = await asOwner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    const event = history.find(
      (entry) => entry.kind === "api_delete_health_day",
    );
    await asOwner.mutation(api.ai.coachState.undoAction, { id: event!._id });

    const afterUndo = await call(
      t,
      "GET",
      "/v1/health/days?start=2026-04-14&end=2026-04-15",
      { key: plaintext },
    );
    expect(afterUndo.body.days).toHaveLength(2);
    expect(afterUndo.body.days[0].sleepMinutes).toBe(421);
  });

  test("there is no way to write a daily reading", async () => {
    const t = convexTest(schema, modules);
    await grantKey(t, "onerep_sk_nohealthwrite", ["read", "write", "delete"]);

    const refused = await call(t, "POST", "/v1/health/days", {
      key: "onerep_sk_nohealthwrite",
      body: { date: "2026-04-15", sleepMinutes: 400 },
    });

    // The path exists for GET, so this is a 405 rather than a 404 — the
    // distinction is the point: reading is offered, writing is not.
    expect(refused.status).toBe(405);
  });

  test("records an activity session the phone never saw, and can take it back", async () => {
    const t = convexTest(schema, modules);
    const plaintext = "onerep_sk_healthwork";
    await grantKey(t, plaintext, ["read", "write", "delete"]);
    const asOwner = t.withIdentity({ name: `owner-${plaintext}` });

    const logged = await call(t, "POST", "/v1/health/workouts", {
      key: plaintext,
      body: {
        activityType: "running",
        activityName: "Lunch Run",
        durationMinutes: 38,
        date: "2026-04-15",
        totalDistanceMeters: 6800,
        externalId: "garmin-99213",
      },
    });
    expect(logged.status).toBe(200);
    expect(logged.body.updated).toBe(false);

    // The same external id again replaces rather than duplicating — and
    // replacing means what it says: the omitted distance is cleared, not kept.
    const again = await call(t, "POST", "/v1/health/workouts", {
      key: plaintext,
      body: {
        activityType: "running",
        durationMinutes: 40,
        date: "2026-04-15",
        externalId: "garmin-99213",
      },
    });
    expect(again.body.updated).toBe(true);

    const list = await call(t, "GET", "/v1/health/workouts", {
      key: plaintext,
    });
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      provider: "api",
      durationMinutes: 40,
      totalDistanceMeters: null,
    });

    const removed = await call(
      t,
      "DELETE",
      `/v1/health/workouts/${list.body[0].id}`,
      { key: plaintext },
    );
    expect(removed.status).toBe(200);
    expect(
      (await call(t, "GET", "/v1/health/workouts", { key: plaintext })).body,
    ).toHaveLength(0);

    const history = await asOwner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    const event = history.find(
      (entry) => entry.kind === "api_delete_health_workout",
    );
    await asOwner.mutation(api.ai.coachState.undoAction, { id: event!._id });

    const restored = await call(t, "GET", "/v1/health/workouts", {
      key: plaintext,
    });
    expect(restored.body).toHaveLength(1);
    // As it stood when it was deleted, which is after the replace above
    // dropped the name — not as it was first written.
    expect(restored.body[0].activityName).toBe("Workout");
  });
});
