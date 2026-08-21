import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { randomSecret, sha256Hex } from "./tokens";

/**
 * OAuth 2.1 for the MCP endpoint.
 *
 * The point of all this is one screen: a client asks, a signed-in human says
 * yes, and a token comes out the other end. Everything below is bookkeeping in
 * service of that, and the token it produces is an ordinary `mcpTokens` row —
 * same hash, same scopes, same rate limit, same revocation. There is no second
 * kind of credential and no second thing to remember to turn off.
 *
 * The parts a client sees live in `oauthServer.ts`. This file is the storage
 * underneath, and the consent action the app calls when the user clicks allow.
 */

const scopeValidator = v.union(v.literal("read"), v.literal("write"));
export type Scope = "read" | "write";

export const CLIENT_ID_PREFIX = "onerep_client_";
export const CLIENT_SECRET_PREFIX = "onerep_cs_";
export const REFRESH_TOKEN_PREFIX = "onerep_rt_";

/** Long enough to click a button, short enough that a leaked URL goes stale. */
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Connected apps per user. Past this it is not a list, it is a mess. */
const MAX_CONNECTIONS = 20;
/** Hand-minted clients per user, for the ones that want an ID and a secret. */
const MAX_MANUAL_CLIENTS = 10;

/**
 * Registration is open by the protocol's design, so it gets a ceiling instead
 * of a gate: enough headroom that honest clients never notice, low enough that
 * nobody fills the table overnight.
 */
const DYNAMIC_REGISTRATION_LIMIT = 200;
const DYNAMIC_REGISTRATION_WINDOW_MS = 60 * 60 * 1000;

export function parseScopes(raw: string | null | undefined): Scope[] | null {
  if (!raw || raw.trim().length === 0) return ["read"];
  const requested = raw.trim().split(/\s+/);
  const allowed: Scope[] = [];
  for (const scope of requested) {
    if (scope !== "read" && scope !== "write") return null;
    if (!allowed.includes(scope)) allowed.push(scope);
  }
  return allowed.length > 0 ? allowed : ["read"];
}

/**
 * Redirect URIs are compared as exact strings.
 *
 * Prefix or host matching is how open redirects get built by accident, and a
 * client that cannot list its own callbacks has bigger problems than this.
 */
function redirectAllowed(registered: string[], candidate: string) {
  return registered.includes(candidate);
}

/** Client-supplied display text. It reaches a consent screen, so it is cut down. */
function safeLabel(value: string | undefined, fallback: string) {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : fallback;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export const clientByClientId = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (!row || row.revokedAt !== undefined) return null;
    return {
      id: row._id,
      clientId: row.clientId,
      clientName: row.clientName,
      clientUri: row.clientUri ?? null,
      redirectUris: row.redirectUris,
      hasSecret: row.clientSecretHash !== undefined,
      clientSecretHash: row.clientSecretHash ?? null,
      registration: row.registration,
    };
  },
});

export const storeClient = internalMutation({
  args: {
    clientId: v.string(),
    clientSecretHash: v.optional(v.string()),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    clientUri: v.optional(v.string()),
    createdByUserId: v.optional(v.string()),
    registration: v.union(v.literal("dynamic"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    if (args.registration === "dynamic") {
      const since = Date.now() - DYNAMIC_REGISTRATION_WINDOW_MS;
      const recent = await ctx.db
        .query("mcpOauthClients")
        .withIndex("by_createdAt", (q) => q.gt("createdAt", since))
        .collect();
      const dynamic = recent.filter((row) => row.registration === "dynamic");
      if (dynamic.length >= DYNAMIC_REGISTRATION_LIMIT) {
        throw new Error("REGISTRATION_RATE_LIMITED");
      }
    }

    await ctx.db.insert("mcpOauthClients", {
      clientId: args.clientId,
      clientSecretHash: args.clientSecretHash,
      clientName: safeLabel(args.clientName, "Unnamed client"),
      redirectUris: args.redirectUris,
      clientUri: args.clientUri,
      createdAt: Date.now(),
      createdByUserId: args.createdByUserId,
      registration: args.registration,
    });
  },
});

/**
 * Clients this user minted by hand, for the settings screen. Self-registered
 * ones are deliberately absent: they belong to no one, and the thing a user
 * actually wants to manage is the connection, not the registration.
 */
export const listClients = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_createdByUserId", (q) => q.eq("createdByUserId", user._id))
      .order("desc")
      .collect();

    return rows
      .filter((row) => row.revokedAt === undefined)
      .map((row) => ({
        id: row._id,
        clientId: row.clientId,
        clientName: row.clientName,
        redirectUris: row.redirectUris,
        createdAt: row.createdAt,
      }));
  },
});

/** Returns the client secret. This is the only time anybody will see it. */
export const createClient = action({
  args: {
    clientName: v.string(),
    redirectUris: v.array(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ clientId: string; clientSecret: string }> => {
    const redirectUris = args.redirectUris
      .map((uri) => uri.trim())
      .filter((uri) => uri.length > 0);
    if (redirectUris.length === 0) {
      throw new Error("A client needs at least one redirect URI.");
    }
    for (const uri of redirectUris) {
      // http is allowed only on loopback, which is where desktop clients park
      // their callback listener. Anywhere else it is a credential over the
      // open wire, and the client can go get a certificate.
      let parsed: URL;
      try {
        parsed = new URL(uri);
      } catch {
        throw new Error(`Not a URL: ${uri}`);
      }
      const loopback =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]";
      if (parsed.protocol === "http:" && !loopback) {
        throw new Error(`Redirect URIs must use https: ${uri}`);
      }
    }

    const clientId = randomSecret(CLIENT_ID_PREFIX, 16);
    const clientSecret = randomSecret(CLIENT_SECRET_PREFIX);

    await ctx.runMutation(internal.mcp.oauth.storeManualClient, {
      clientId,
      clientSecretHash: await sha256Hex(clientSecret),
      clientName: args.clientName,
      redirectUris,
    });

    return { clientId, clientSecret };
  },
});

export const storeManualClient = internalMutation({
  args: {
    clientId: v.string(),
    clientSecretHash: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const existing = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_createdByUserId", (q) => q.eq("createdByUserId", user._id))
      .collect();
    const live = existing.filter((row) => row.revokedAt === undefined);
    if (live.length >= MAX_MANUAL_CLIENTS) {
      throw new Error("You already have ten clients. Delete one first.");
    }

    await ctx.db.insert("mcpOauthClients", {
      clientId: args.clientId,
      clientSecretHash: args.clientSecretHash,
      clientName: safeLabel(args.clientName, "Unnamed client"),
      redirectUris: args.redirectUris,
      createdAt: Date.now(),
      createdByUserId: user._id,
      registration: "manual",
    });
  },
});

/**
 * Deleting a client also cuts every token it was ever issued. A registration
 * the user has decided to be rid of should not leave a working key behind.
 */
export const revokeClient = mutation({
  args: { id: v.id("mcpOauthClients") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.createdByUserId !== user._id) throw new Error("Not found");

    await ctx.db.patch(args.id, { revokedAt: Date.now() });
    await revokeGrant(ctx, user._id, row.clientId);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * What the consent screen needs to say who is asking. Public on purpose: the
 * caller has already been handed the client id in a redirect, and the answer
 * is a display name, not a secret.
 */
export const consentDetails = query({
  args: { clientId: v.string(), redirectUri: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();

    if (!row || row.revokedAt !== undefined) {
      return { ok: false as const, reason: "unknown_client" as const };
    }
    if (!redirectAllowed(row.redirectUris, args.redirectUri)) {
      return { ok: false as const, reason: "bad_redirect" as const };
    }
    return {
      ok: true as const,
      clientName: row.clientName,
      clientUri: row.clientUri ?? null,
      registration: row.registration,
    };
  },
});

/**
 * The user's answer. Returns where to send the browser next — including for a
 * refusal, which is a redirect with `error=access_denied` rather than a dead
 * end, so the client learns the outcome instead of hanging.
 */
export const approve = action({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    scopes: v.array(scopeValidator),
    codeChallenge: v.string(),
    state: v.optional(v.string()),
    allow: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ redirectTo: string }> => {
    const client = await ctx.runQuery(internal.mcp.oauth.clientByClientId, {
      clientId: args.clientId,
    });
    if (!client) throw new Error("That app is no longer registered.");
    if (!redirectAllowed(client.redirectUris, args.redirectUri)) {
      // Never redirect to an address the client did not register, not even to
      // report an error. That is the whole shape of the attack.
      throw new Error("That app asked to be sent somewhere it isn't allowed.");
    }

    const target = new URL(args.redirectUri);
    if (args.state !== undefined) target.searchParams.set("state", args.state);

    if (!args.allow) {
      target.searchParams.set("error", "access_denied");
      target.searchParams.set(
        "error_description",
        "The user declined the request.",
      );
      return { redirectTo: target.toString() };
    }

    if (args.codeChallenge.length < 43) {
      throw new Error("That app sent a malformed PKCE challenge.");
    }

    const code = randomSecret("", 32);
    await ctx.runMutation(internal.mcp.oauth.storeAuthCode, {
      codeHash: await sha256Hex(code),
      clientId: args.clientId,
      redirectUri: args.redirectUri,
      scopes: args.scopes.length > 0 ? args.scopes : ["read"],
      codeChallenge: args.codeChallenge,
    });

    target.searchParams.set("code", code);
    return { redirectTo: target.toString() };
  },
});

export const storeAuthCode = internalMutation({
  args: {
    codeHash: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    scopes: v.array(scopeValidator),
    codeChallenge: v.string(),
  },
  handler: async (ctx, args) => {
    // The identity is read here, in the mutation, rather than passed in from
    // the action. A userId that arrives as an argument is a userId the caller
    // chose.
    const user = await getAuthUser(ctx);
    await ctx.db.insert("mcpAuthCodes", {
      codeHash: args.codeHash,
      clientId: args.clientId,
      userId: user._id,
      redirectUri: args.redirectUri,
      scopes: args.scopes,
      codeChallenge: args.codeChallenge,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });
  },
});

// ---------------------------------------------------------------------------
// Token issuance
// ---------------------------------------------------------------------------

export type RedeemResult =
  | { ok: true; userId: string; scopes: Scope[]; codeChallenge: string }
  | { ok: false; reason: string };

/**
 * Burns an authorization code and reports what it was worth.
 *
 * Marked consumed before anything is issued, and a second presentation is
 * refused rather than ignored — a replayed code means the first one leaked,
 * and the honest client will simply start over.
 */
export const redeemAuthCode = internalMutation({
  args: {
    codeHash: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args): Promise<RedeemResult> => {
    const row = await ctx.db
      .query("mcpAuthCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();

    if (!row) return { ok: false, reason: "That code is not valid." };
    if (row.consumedAt !== undefined) {
      // Cut the grant it already produced: either this is a replay or the
      // client is confused, and both are better resolved by starting again.
      await revokeGrant(ctx, row.userId, row.clientId);
      return { ok: false, reason: "That code has already been used." };
    }
    if (row.expiresAt <= Date.now()) {
      return { ok: false, reason: "That code has expired." };
    }
    if (row.clientId !== args.clientId) {
      return { ok: false, reason: "That code was issued to another client." };
    }
    if (row.redirectUri !== args.redirectUri) {
      return { ok: false, reason: "Redirect URI does not match the request." };
    }

    await ctx.db.patch(row._id, { consumedAt: Date.now() });
    return {
      ok: true,
      userId: row.userId,
      scopes: row.scopes,
      codeChallenge: row.codeChallenge,
    };
  },
});

/** Revokes every live token a given app holds for a given user. */
async function revokeGrant(ctx: MutationCtx, userId: string, clientId: string) {
  const now = Date.now();
  const tokens = await ctx.db
    .query("mcpTokens")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const token of tokens) {
    if (token.clientId === clientId && token.revokedAt === undefined) {
      await ctx.db.patch(token._id, { revokedAt: now });
    }
  }

  const refresh = await ctx.db
    .query("mcpRefreshTokens")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const row of refresh) {
    if (row.clientId === clientId && row.revokedAt === undefined) {
      await ctx.db.patch(row._id, { revokedAt: now });
    }
  }
}

export const issueGrant = internalMutation({
  args: {
    userId: v.string(),
    clientId: v.string(),
    clientName: v.string(),
    scopes: v.array(scopeValidator),
    accessTokenHash: v.string(),
    accessTokenPrefix: v.string(),
    refreshTokenHash: v.string(),
    /** Set when this replaces an earlier refresh token rather than starting fresh. */
    supersedes: v.optional(v.id("mcpRefreshTokens")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.supersedes !== undefined) {
      const previous = await ctx.db.get(args.supersedes);
      await ctx.db.patch(args.supersedes, { revokedAt: now });
      // Only the access token this refresh token minted. Rotation is worth
      // nothing if the old pair keeps working, and worth less than nothing if
      // it takes the user's other machine down with it.
      if (previous?.accessTokenId) {
        const stale = await ctx.db.get(previous.accessTokenId);
        if (stale && stale.revokedAt === undefined) {
          await ctx.db.patch(stale._id, { revokedAt: now });
        }
      }
    } else {
      const tokens = await ctx.db
        .query("mcpTokens")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();
      const live = tokens.filter(
        (row) =>
          row.clientId !== undefined &&
          row.revokedAt === undefined &&
          (row.expiresAt ?? Infinity) > now,
      );
      if (live.length >= MAX_CONNECTIONS) {
        throw new Error("CONNECTION_LIMIT");
      }
    }

    const accessTokenId = await ctx.db.insert("mcpTokens", {
      userId: args.userId,
      name: args.clientName,
      tokenHash: args.accessTokenHash,
      prefix: args.accessTokenPrefix,
      scopes: args.scopes,
      createdAt: now,
      clientId: args.clientId,
      expiresAt: now + ACCESS_TOKEN_TTL_MS,
    });

    await ctx.db.insert("mcpRefreshTokens", {
      tokenHash: args.refreshTokenHash,
      clientId: args.clientId,
      userId: args.userId,
      scopes: args.scopes,
      accessTokenId,
      createdAt: now,
      expiresAt: now + REFRESH_TOKEN_TTL_MS,
    });
  },
});

export type RefreshResult =
  | {
      ok: true;
      id: Id<"mcpRefreshTokens">;
      userId: string;
      scopes: Scope[];
    }
  | { ok: false; reason: string };

export const resolveRefreshToken = internalQuery({
  args: { tokenHash: v.string(), clientId: v.string() },
  handler: async (ctx, args): Promise<RefreshResult> => {
    const row = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (!row || row.revokedAt !== undefined) {
      return { ok: false, reason: "That refresh token is not valid." };
    }
    if (row.expiresAt <= Date.now()) {
      return { ok: false, reason: "That refresh token has expired." };
    }
    if (row.clientId !== args.clientId) {
      return {
        ok: false,
        reason: "That refresh token belongs to another client.",
      };
    }
    return { ok: true, id: row._id, userId: row.userId, scopes: row.scopes };
  },
});

/** RFC 7009. Best effort by design: an unknown token is still a success. */
export const revokeByToken = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    const refresh = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (refresh) {
      if (refresh.revokedAt === undefined) {
        await ctx.db.patch(refresh._id, { revokedAt: now });
      }
      await revokeGrant(ctx, refresh.userId, refresh.clientId);
      return;
    }

    const access = await ctx.db
      .query("mcpTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (access && access.clientId !== undefined) {
      await revokeGrant(ctx, access.userId, access.clientId);
    }
  },
});

// ---------------------------------------------------------------------------
// Connections, as the user sees them
// ---------------------------------------------------------------------------

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const now = Date.now();
    const tokens = await ctx.db
      .query("mcpTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return tokens
      .filter(
        (row) =>
          row.clientId !== undefined &&
          row.revokedAt === undefined &&
          (row.expiresAt ?? Infinity) > now,
      )
      .map((row) => ({
        id: row._id,
        clientId: row.clientId!,
        name: row.name,
        scopes: row.scopes,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt ?? null,
        lastUsedAt: row.lastUsedAt ?? null,
      }));
  },
});

export const revokeConnection = mutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id || row.clientId === undefined) {
      throw new Error("Not found");
    }
    await revokeGrant(ctx, user._id, row.clientId);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/**
 * Codes and refresh tokens outlive their usefulness by design — a consumed
 * code is kept so a replay can be recognised, an expired token so a revocation
 * is not silently forgotten. Both stop being evidence long before they stop
 * taking up space, so this drops them once nobody could still be asking.
 */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const codes = await ctx.db
      .query("mcpAuthCodes")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", cutoff))
      .take(500);
    for (const row of codes) await ctx.db.delete(row._id);

    const refresh = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", cutoff))
      .take(500);
    for (const row of refresh) await ctx.db.delete(row._id);

    return { codes: codes.length, refreshTokens: refresh.length };
  },
});
