import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

// ── getDay ────────────────────────────────────────────────────────────────────

export const getDay = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const doc = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    return doc?.entries ?? [];
  },
});

// ── setDay ────────────────────────────────────────────────────────────────────

export const setDay = mutation({
  args: {
    date: v.string(),
    entries: v.array(
      v.object({
        id: v.string(),
        amountMl: v.number(),
        loggedAt: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        entries: args.entries,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("waterLogs", {
        userId: user._id,
        date: args.date,
        entries: args.entries,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});

// ── addEntry ──────────────────────────────────────────────────────────────────

export const addEntry = mutation({
  args: {
    date: v.string(),
    entry: v.object({
      id: v.string(),
      amountMl: v.number(),
      loggedAt: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        entries: [...existing.entries, args.entry],
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("waterLogs", {
        userId: user._id,
        date: args.date,
        entries: [args.entry],
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});

// ── removeEntry ───────────────────────────────────────────────────────────────

export const removeEntry = mutation({
  args: {
    date: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date),
      )
      .unique();

    if (!existing) return { ok: true };

    const nextEntries = existing.entries.filter((entry: unknown) => {
      if (!entry || typeof entry !== "object") return true;
      return (entry as { id?: unknown }).id !== args.id;
    });

    if (nextEntries.length === existing.entries.length) return { ok: true };

    await ctx.db.patch(existing._id, {
      entries: nextEntries,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});
