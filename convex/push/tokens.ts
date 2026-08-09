/**
 * Device registration for push.
 *
 * A token identifies a device install, not a person. The same phone signed
 * into a second account produces a second row, and the first is reassigned
 * rather than duplicated — otherwise the previous owner of that handset keeps
 * receiving somebody else's coaching.
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const MAX_TOKEN_CHARS = 4096;
/** No phone has this many installs; past it, something is looping. */
const MAX_TOKENS_PER_USER = 20;

export const register = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const token = args.token.trim();
    if (!token || token.length > MAX_TOKEN_CHARS) {
      throw new Error("Invalid push token");
    }
    const now = Date.now();

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: user._id,
        platform: args.platform,
        lastSeenAt: now,
        failedAt: undefined,
      });
      return { registered: true };
    }

    const owned = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    if (owned.length >= MAX_TOKENS_PER_USER) {
      // Evict the stalest rather than refusing: the new device is the one the
      // user is holding.
      const oldest = owned.sort((a, b) => a.lastSeenAt - b.lastSeenAt)[0];
      if (oldest) await ctx.db.delete(oldest._id);
    }

    await ctx.db.insert("pushTokens", {
      userId: user._id,
      token,
      platform: args.platform,
      createdAt: now,
      lastSeenAt: now,
    });
    return { registered: true };
  },
});

export const unregister = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Sign-out calls this, and a signed-out client has no identity to check
    // against — so the token itself is the authority, and deleting a token you
    // can name is harmless.
    const user = await safeGetAuthUser(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (!existing) return { removed: false };
    if (user && existing.userId !== user._id) return { removed: false };
    await ctx.db.delete(existing._id);
    return { removed: true };
  },
});

export const listForUser = internalQuery({
  args: { userId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
});

/** Called after a send: dead tokens go, live ones get their timestamp. */
export const reconcile = internalMutation({
  args: {
    delivered: v.array(v.id("pushTokens")),
    dead: v.array(v.id("pushTokens")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.delivered) {
      const row = await ctx.db.get(id);
      if (row) await ctx.db.patch(id, { lastSeenAt: now, failedAt: undefined });
    }
    for (const id of args.dead) {
      const row = await ctx.db.get(id);
      if (row) await ctx.db.delete(id);
    }
  },
});
