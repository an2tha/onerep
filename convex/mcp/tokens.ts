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
 * Personal access tokens for the MCP endpoint.
 *
 * Creation is an action rather than a mutation because it needs real
 * randomness and a real hash, and the deterministic query/mutation runtime is
 * the wrong place to ask for either. The action mints the token, hands the
 * hash to an internal mutation, and returns the plaintext exactly once.
 */

const scopeValidator = v.union(v.literal("read"), v.literal("write"));

/** More than this and it stops being a list and starts being an attack surface. */
const MAX_TOKENS = 10;

const TOKEN_PREFIX = "onerep_mcp_";

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function mintToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const body = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${TOKEN_PREFIX}${body}`;
}

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
      .filter((row) => row.revokedAt === undefined)
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
    const prefix = token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 6);

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
    const live = existing.filter((row) => row.revokedAt === undefined);
    if (live.length >= MAX_TOKENS) {
      throw new Error("You already have ten tokens. Revoke one first.");
    }

    const name = args.name.trim().slice(0, 60) || "Untitled token";
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
      args.write ? 60 : 600,
      60 * 60 * 1000,
    );

    await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
  },
});
