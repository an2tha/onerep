import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { OPENROUTER_BASE_URL } from "./provider";

/**
 * Bring your own key.
 *
 * A user who supplies their own OpenRouter key pays OpenRouter directly for
 * inference, so the monthly AI allowance — which exists to cap what OneRep
 * spends serving them — stops applying. The key is stored server-side in
 * `aiKeys`, is only ever read inside Convex functions, and every status
 * surface exposes nothing beyond its last four characters.
 */

/** Reads the stored key inside a query/mutation; null when none is set. */
export async function byokKeyFor(ctx: QueryCtx, userId: string) {
  const row = await ctx.db
    .query("aiKeys")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return row?.key ?? null;
}

/** For actions that need the key without spending quota (crons, availability checks). */
export const getKeyForUser = internalQuery({
  args: { userId: v.string() },
  handler: (ctx, args) => byokKeyFor(ctx, args.userId),
});

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return { configured: false as const, last4: null };
    const row = await ctx.db
      .query("aiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    return row
      ? { configured: true as const, last4: row.last4 }
      : { configured: false as const, last4: null };
  },
});

export const saveKey = internalMutation({
  args: { userId: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("aiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const doc = {
      userId: args.userId,
      key: args.key,
      last4: args.key.slice(-4),
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.replace(existing._id, doc);
    } else {
      await ctx.db.insert("aiKeys", doc);
    }
  },
});

/**
 * Validates the key against OpenRouter before storing it, so "saved" always
 * means "works". A key that fails auth is rejected here rather than surfacing
 * later as a mid-workout model error.
 */
export const setKey = action({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const userId = (await getAuthUser(ctx))._id;
    const key = args.key.trim();
    if (!key.startsWith("sk-or-")) {
      throw new Error(
        "That doesn't look like an OpenRouter key (they start with sk-or-)",
      );
    }

    const response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenRouter rejected this key. Check it and try again.");
    }
    if (!response.ok) {
      throw new Error(
        `Couldn't verify the key with OpenRouter (status ${response.status}). Try again in a moment.`,
      );
    }

    await ctx.runMutation(internal.ai.byok.saveKey, { userId, key });
    return { last4: key.slice(-4) };
  },
});

export const removeKey = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = (await getAuthUser(ctx))._id;
    const existing = await ctx.db
      .query("aiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
