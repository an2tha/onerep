import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

/**
 * The OAuth flow over the wire it actually serves.
 *
 * Everything here goes through `t.fetch`, because the parts most likely to be
 * wrong are the parts a client sees: the discovery documents, the exact shape
 * of a form-encoded token request, and the handful of things that must be
 * refused. A test that called the mutations directly would prove none of it.
 */

type Harness = ReturnType<typeof convexTest>;

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function challengeFor(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

async function registerClient(t: Harness, body: Record<string, unknown> = {}) {
  const response = await t.fetch("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test client",
      redirect_uris: [REDIRECT],
      ...body,
    }),
  });
  return { status: response.status, body: await response.json() };
}

async function postForm(
  t: Harness,
  path: string,
  fields: Record<string, string>,
) {
  const response = await t.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  return { status: response.status, body: await response.json() };
}

/** Registers, consents as `user`, and returns the code the client would get. */
async function authorizeAs(
  t: Harness,
  user: string,
  options: {
    clientId: string;
    challenge: string;
    scopes?: Array<"read" | "write">;
  },
) {
  const { redirectTo } = await t
    .withIdentity({ name: user })
    .action(api.mcp.oauth.approve, {
      clientId: options.clientId,
      redirectUri: REDIRECT,
      scopes: options.scopes ?? ["read"],
      codeChallenge: options.challenge,
      state: "xyz",
      allow: true,
    });
  return new URL(redirectTo).searchParams.get("code")!;
}

describe("OAuth discovery", () => {
  test("the 401 from /mcp says where to find the authorization server", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "resource_metadata=",
    );
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "/.well-known/oauth-protected-resource",
    );
  });

  test("both spellings of the protected-resource path answer", async () => {
    const t = convexTest(schema, modules);
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const response = await t.fetch(path, { method: "GET" });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.resource).toContain("/mcp");
      expect(body.authorization_servers).toHaveLength(1);
    }
  });

  test("the authorization server advertises PKCE and nothing weaker", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/.well-known/oauth-authorization-server", {
      method: "GET",
    });
    const body = await response.json();

    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.grant_types_supported).toContain("authorization_code");
    expect(body.grant_types_supported).toContain("refresh_token");
    expect(body.registration_endpoint).toContain("/oauth/register");
  });
});

describe("dynamic client registration", () => {
  test("hands back an id and a secret", async () => {
    const t = convexTest(schema, modules);
    const { status, body } = await registerClient(t);

    expect(status).toBe(201);
    expect(body.client_id).toMatch(/^onerep_client_/);
    expect(body.client_secret).toMatch(/^onerep_cs_/);
    expect(body.redirect_uris).toEqual([REDIRECT]);
  });

  test("a client that says it cannot keep a secret is not given one", async () => {
    const t = convexTest(schema, modules);
    const { body } = await registerClient(t, {
      token_endpoint_auth_method: "none",
    });

    expect(body.client_id).toBeTruthy();
    expect(body.client_secret).toBeUndefined();
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  test("refuses plaintext http that is not loopback", async () => {
    const t = convexTest(schema, modules);
    const { status, body } = await registerClient(t, {
      redirect_uris: ["http://evil.example.com/callback"],
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_redirect_uri");
  });

  test("allows http on loopback, where desktop clients listen", async () => {
    const t = convexTest(schema, modules);
    const { status } = await registerClient(t, {
      redirect_uris: ["http://127.0.0.1:33418/callback"],
    });

    expect(status).toBe(201);
  });

  test("refuses a registration with no redirect at all", async () => {
    const t = convexTest(schema, modules);
    const { status, body } = await registerClient(t, { redirect_uris: [] });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_redirect_uri");
  });
});

describe("authorization", () => {
  test("sends the browser to the consent screen with the request intact", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: await challengeFor("a".repeat(64)),
      code_challenge_method: "S256",
      scope: "read write",
      state: "xyz",
    });
    const response = await t.fetch(`/oauth/authorize?${params}`, {
      method: "GET",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("Location")!);
    expect(target.pathname).toBe("/oauth/consent");
    expect(target.searchParams.get("client_id")).toBe(client.client_id);
    expect(target.searchParams.get("scope")).toBe("read write");
    expect(target.searchParams.get("state")).toBe("xyz");
  });

  test("will not bounce an error to an unregistered redirect", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://attacker.example.com/steal",
      code_challenge: await challengeFor("a".repeat(64)),
      code_challenge_method: "S256",
    });
    const response = await t.fetch(`/oauth/authorize?${params}`, {
      method: "GET",
      redirect: "manual",
    });

    // A page, not a redirect. Redirecting here is the attack.
    expect(response.status).toBe(400);
    expect(response.headers.get("Location")).toBeNull();
  });

  test("refuses a request without PKCE", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
    });
    const response = await t.fetch(`/oauth/authorize?${params}`, {
      method: "GET",
      redirect: "manual",
    });

    const target = new URL(response.headers.get("Location")!);
    expect(target.searchParams.get("error")).toBe("invalid_request");
  });

  test("a refusal is reported to the client rather than swallowed", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);

    const { redirectTo } = await t
      .withIdentity({ name: "alice" })
      .action(api.mcp.oauth.approve, {
        clientId: client.client_id,
        redirectUri: REDIRECT,
        scopes: ["read"],
        codeChallenge: await challengeFor("a".repeat(64)),
        state: "xyz",
        allow: false,
      });

    const target = new URL(redirectTo);
    expect(target.searchParams.get("error")).toBe("access_denied");
    expect(target.searchParams.get("state")).toBe("xyz");
    expect(target.searchParams.get("code")).toBeNull();
  });

  test("approval cannot be pointed at an address the client never registered", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);

    await expect(
      t.withIdentity({ name: "alice" }).action(api.mcp.oauth.approve, {
        clientId: client.client_id,
        redirectUri: "https://attacker.example.com/steal",
        scopes: ["read"],
        codeChallenge: await challengeFor("a".repeat(64)),
        allow: true,
      }),
    ).rejects.toThrow();
  });
});

describe("the token endpoint", () => {
  test("exchanges a code for a token that the MCP endpoint accepts", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
      scopes: ["read", "write"],
    });

    const { status, body } = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    expect(status).toBe(200);
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toBe("read write");
    expect(body.refresh_token).toMatch(/^onerep_rt_/);

    const mcp = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(mcp.status).toBe(200);
  });

  test("a wrong code_verifier is worth nothing", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor("v".repeat(64)),
    });

    const { status, body } = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: "w".repeat(64),
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  test("a wrong client secret is worth nothing", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
    });

    const { status, body } = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: "onerep_cs_not_it",
    });

    expect(status).toBe(401);
    expect(body.error).toBe("invalid_client");
  });

  test("a code cannot be spent twice, and the replay cuts the grant", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
    });

    const fields = {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    };
    const first = await postForm(t, "/oauth/token", fields);
    expect(first.status).toBe(200);

    const second = await postForm(t, "/oauth/token", fields);
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("invalid_grant");

    // The first token dies with the replay: a code seen twice means the first
    // one leaked, and the honest client can simply start over.
    const mcp = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${first.body.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(mcp.status).toBe(401);
  });

  test("a code issued to one client cannot be spent by another", async () => {
    const t = convexTest(schema, modules);
    const { body: honest } = await registerClient(t);
    const { body: thief } = await registerClient(t, { client_name: "Thief" });
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: honest.client_id,
      challenge: await challengeFor(verifier),
    });

    const { status, body } = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: thief.client_id,
      client_secret: thief.client_secret,
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  test("refresh rotates: the old pair stops working", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
      scopes: ["read", "write"],
    });

    const first = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    const refreshed = await postForm(t, "/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.access_token).not.toBe(first.body.access_token);
    expect(refreshed.body.refresh_token).not.toBe(first.body.refresh_token);

    const reused = await postForm(t, "/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });
    expect(reused.status).toBe(400);
  });

  test("one install refreshing does not sign the other out", async () => {
    const t = convexTest(schema, modules);
    // One client id, two grants — which is what two copies of the same desktop
    // app configured by hand look like.
    const { body: client } = await registerClient(t);

    const grants = [];
    for (const verifier of ["one".repeat(22), "two".repeat(22)]) {
      const code = await authorizeAs(t, "alice", {
        clientId: client.client_id,
        challenge: await challengeFor(verifier),
      });
      grants.push(
        await postForm(t, "/oauth/token", {
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          code_verifier: verifier,
          client_id: client.client_id,
          client_secret: client.client_secret,
        }),
      );
    }

    await postForm(t, "/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: grants[1].body.refresh_token,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    const stillWorks = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grants[0].body.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(stillWorks.status).toBe(200);
  });

  test("a refresh may narrow the grant but never widen it", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
      scopes: ["read"],
    });

    const first = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    const widened = await postForm(t, "/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      scope: "read write",
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    expect(widened.status).toBe(200);
    expect(widened.body.scope).toBe("read");
  });
});

describe("what the user sees and can undo", () => {
  test("an OAuth token is listed as a connection, never among personal keys", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
    });
    await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    const asAlice = t.withIdentity({ name: "alice" });
    expect(await asAlice.query(api.mcp.tokens.list)).toHaveLength(0);

    const connections = await asAlice.query(api.mcp.oauth.listConnections);
    expect(connections).toHaveLength(1);
    expect(connections[0].clientId).toBe(client.client_id);
  });

  test("disconnecting kills the access token and its refresh token together", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
    });
    const granted = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    const asAlice = t.withIdentity({ name: "alice" });
    const [connection] = await asAlice.query(api.mcp.oauth.listConnections);
    await asAlice.mutation(api.mcp.oauth.revokeConnection, {
      id: connection.id,
    });

    const mcp = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${granted.body.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(mcp.status).toBe(401);

    const refreshed = await postForm(t, "/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: granted.body.refresh_token,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });
    expect(refreshed.status).toBe(400);
  });

  test("one user cannot revoke another user's connection", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
    });
    await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    const [connection] = await t
      .withIdentity({ name: "alice" })
      .query(api.mcp.oauth.listConnections);

    await expect(
      t
        .withIdentity({ name: "mallory" })
        .mutation(api.mcp.oauth.revokeConnection, { id: connection.id }),
    ).rejects.toThrow();
  });

  test("a hand-minted client works the same way a self-registered one does", async () => {
    const t = convexTest(schema, modules);
    const asAlice = t.withIdentity({ name: "alice" });

    const { clientId, clientSecret } = await asAlice.action(
      api.mcp.oauth.createClient,
      { clientName: "Claude Desktop", redirectUris: [REDIRECT] },
    );

    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId,
      challenge: await challengeFor(verifier),
    });
    const { status } = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: clientId,
      client_secret: clientSecret,
    });

    expect(status).toBe(200);
    expect(await asAlice.query(api.mcp.oauth.listClients)).toHaveLength(1);
  });

  test("deleting a client cuts the tokens it was issued", async () => {
    const t = convexTest(schema, modules);
    const asAlice = t.withIdentity({ name: "alice" });
    const { clientId, clientSecret } = await asAlice.action(
      api.mcp.oauth.createClient,
      { clientName: "Claude Desktop", redirectUris: [REDIRECT] },
    );

    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId,
      challenge: await challengeFor(verifier),
    });
    const granted = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const [row] = await asAlice.query(api.mcp.oauth.listClients);
    await asAlice.mutation(api.mcp.oauth.revokeClient, { id: row.id });

    const mcp = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${granted.body.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(mcp.status).toBe(401);
  });

  test("revocation is honoured, and an unknown token still answers 200", async () => {
    const t = convexTest(schema, modules);
    const { body: client } = await registerClient(t);
    const verifier = "v".repeat(64);
    const code = await authorizeAs(t, "alice", {
      clientId: client.client_id,
      challenge: await challengeFor(verifier),
    });
    const granted = await postForm(t, "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
    });

    const revoked = await postForm(t, "/oauth/revoke", {
      token: granted.body.refresh_token,
    });
    expect(revoked.status).toBe(200);

    const mcp = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${granted.body.access_token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(mcp.status).toBe(401);

    // Never an oracle: a token that was never real gets the same answer.
    const nonsense = await postForm(t, "/oauth/revoke", { token: "nope" });
    expect(nonsense.status).toBe(200);
  });
});
