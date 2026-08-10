import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { claimRateLimit } from "../lib/rateLimits";

/**
 * Personal access keys for the REST API and the MCP endpoint.
 *
 * One credential for both surfaces, deliberately. Two parallel key systems
 * would mean two revocation paths and two chances to forget one of them, and a
 * key that can read your log is a key that can read your log whichever door it
 * walks through.
 *
 * Creation is an action rather than a mutation because it needs real
 * randomness and a real hash, and the deterministic query/mutation runtime is
 * the wrong place to ask for either. The action mints the key, hands the hash
 * to an internal mutation, and returns the plaintext exactly once.
 */

const scopeValidator = v.union(v.literal("read"), v.literal("write"));

/** More than this and it stops being a list and starts being an attack surface. */
const MAX_TOKENS = 10;

/**
 * Keys minted before the REST API read `onerep_mcp_`. They still work: lookup
 * is by hash, and the prefix has never been anything but a label.
 */
const TOKEN_PREFIX = "onerep_sk_";

/**
 * Per-key budget, per hour. Writes are scarcer than reads because a wrong one
 * leaves a mess in the log that a human has to clean up by hand.
 */
export const KEY_RATE_LIMITS = {
  read: 600,
  write: 60,
  windowMs: 60 * 60 * 1000,
} as const;

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * PKCE compares base64url of the raw digest, not hex. Same hash, different
 * alphabet, and getting it wrong fails in a way that looks like a client bug.
 */
export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64Url(new Uint8Array(digest));
}

export function randomSecret(prefix: string, byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return `${prefix}${base64Url(bytes)}`;
}

/** How much of a secret is kept in the clear, so a list can be read. */
export function secretPrefix(secret: string, marker: string) {
  return secret.slice(marker.length, marker.length + 6);
}

export function mintToken() {
  return randomSecret(TOKEN_PREFIX);
}

export { TOKEN_PREFIX };

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("mcpTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return rows
      // Tokens with a clientId belong to a connected app, and are listed
      // under connections instead — a key the user never typed has no
      // business appearing in the list of keys they did.
      .filter((row) => row.revokedAt === undefined && row.clientId === undefined)
      .map((row) => ({
        id: row._id,
        name: row.name,
        prefix: row.prefix,
        scopes: row.scopes,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt ?? null,
      }));
  },
});

/** Returns the plaintext token. This is the only time anybody will see it. */
export const create = action({
  args: { name: v.string(), scopes: v.array(scopeValidator) },
  handler: async (ctx, args): Promise<{ token: string; prefix: string }> => {
    const token = mintToken();
    const tokenHash = await sha256Hex(token);
    const prefix = secretPrefix(token, TOKEN_PREFIX);

    await ctx.runMutation(internal.mcp.tokens.store, {
      name: args.name,
      scopes: args.scopes,
      tokenHash,
      prefix,
    });

    return { token, prefix };
  },
});

export const store = internalMutation({
  args: {
    name: v.string(),
    scopes: v.array(scopeValidator),
    tokenHash: v.string(),
    prefix: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const existing = await ctx.db
      .query("mcpTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const live = existing.filter(
      (row) => row.revokedAt === undefined && row.clientId === undefined,
    );
    if (live.length >= MAX_TOKENS) {
      throw new Error("You already have ten keys. Revoke one first.");
    }

    const name = args.name.trim().slice(0, 60) || "Untitled key";
    // A token with no scope can do nothing, which is a support ticket waiting
    // to happen. Default to read.
    const scopes = args.scopes.length > 0 ? args.scopes : ["read" as const];

    await ctx.db.insert("mcpTokens", {
      userId: user._id,
      name,
      tokenHash: args.tokenHash,
      prefix: args.prefix,
      scopes,
      createdAt: Date.now(),
    });
  },
});

export const revoke = mutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id) throw new Error("Not found");
    // Kept as a tombstone rather than deleted: a revoked hash must never be
    // reissued, and the row is the only record that it existed.
    await ctx.db.patch(args.id, { revokedAt: Date.now() });
    return { ok: true };
  },
});

/** Resolves a presented token hash to its owner. Internal to the HTTP layer. */
export const resolve = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mcpTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (!row || row.revokedAt !== undefined) return null;
    // An expired OAuth token is refused here rather than swept by a cron, so
    // the deadline is real the second it passes and not whenever we next look.
    if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) return null;
    return { id: row._id, userId: row.userId, scopes: row.scopes };
  },
});

/**
 * Stamps a token as used and claims one slot of its budget.
 *
 * Rate limiting is per token rather than per user on purpose: one agent stuck
 * in a loop must not lock the owner out of their own account.
 */
export const touch = internalMutation({
  args: { id: v.id("mcpTokens"), write: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.revokedAt !== undefined) throw new Error("Token revoked");

    await claimRateLimit(
      ctx,
      row.userId,
      args.write ? `mcp:write:${args.id}` : `mcp:read:${args.id}`,
      args.write ? KEY_RATE_LIMITS.write : KEY_RATE_LIMITS.read,
      KEY_RATE_LIMITS.windowMs,
    );

    await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
  },
});
