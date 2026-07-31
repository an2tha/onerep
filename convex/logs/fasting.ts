import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const MAX_HISTORY = 200;
const DEFAULT_HISTORY_LIMIT = 30;
/** A fast started more than a week ago is almost certainly a typo. */
const MAX_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TARGET_MINUTES = 7 * 24 * 60;

function cleanNote(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, 500);
}

function assertDateKey(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date`);
  }
  return value;
}

function safeTargetMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Fast target must be greater than zero");
  }
  return Math.min(MAX_TARGET_MINUTES, Math.round(value));
}

/**
 * Clamps a caller-supplied start time into [now - 7d, now].
 *
 * The client passes this so "start from my last meal" works, which means it is
 * untrusted input: a future start would render a negative elapsed timer.
 */
function clampStartedAt(startedAt: number | undefined, now: number) {
  if (startedAt === undefined) return now;
  if (!Number.isFinite(startedAt)) return now;
  return Math.min(now, Math.max(now - MAX_BACKDATE_MS, Math.round(startedAt)));
}

async function ownedSession(
  ctx: MutationCtx,
  id: string,
  userId: string,
) {
  const doc = await ctx.db.get(id as never);
  if (!doc || (doc as { userId?: string }).userId !== userId) {
    throw new Error("Fast not found or access denied");
  }
  return doc as unknown as {
    _id: never;
    startedAt: number;
    endedAt?: number;
    targetMinutes: number;
  };
}

// ── reads ─────────────────────────────────────────────────────────────────────

/** The one running fast, or null. */
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;

    const doc = await ctx.db
      .query("fastingSessions")
      .withIndex("by_userId_endedAt", (q) =>
        q.eq("userId", user._id).eq("endedAt", undefined),
      )
      .unique()
      .catch(async () => {
        // Defensive: if a crash ever left two open fasts, prefer the newest
        // rather than throwing and leaving the page permanently broken.
        const open = await ctx.db
          .query("fastingSessions")
          .withIndex("by_userId_endedAt", (q) =>
            q.eq("userId", user._id).eq("endedAt", undefined),
          )
          .collect();
        return open.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
      });

    return doc ? { ...doc, id: doc._id } : null;
  },
});

/** Most recent fasts first. */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const limit = Math.min(
      MAX_HISTORY,
      Math.max(1, Math.round(args.limit ?? DEFAULT_HISTORY_LIMIT)),
    );

    const docs = await ctx.db
      .query("fastingSessions")
      .withIndex("by_userId_startedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);

    return docs.map((doc) => ({ ...doc, id: doc._id }));
  },
});

/** Inclusive date range over `startDate`, ascending. */
export const getRange = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("fastingSessions")
      .withIndex("by_userId_startedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(MAX_HISTORY);

    return docs
      .filter((doc) => doc.startDate >= args.start && doc.startDate <= args.end)
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

// ── writes ────────────────────────────────────────────────────────────────────

export const start = mutation({
  args: {
    startedAt: v.optional(v.number()),
    targetMinutes: v.number(),
    protocol: v.string(),
    startDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const running = await ctx.db
      .query("fastingSessions")
      .withIndex("by_userId_endedAt", (q) =>
        q.eq("userId", user._id).eq("endedAt", undefined),
      )
      .first();
    if (running) {
      throw new Error("A fast is already running. End it before starting another.");
    }

    const now = Date.now();
    return await ctx.db.insert("fastingSessions", {
      userId: user._id,
      startedAt: clampStartedAt(args.startedAt, now),
      targetMinutes: safeTargetMinutes(args.targetMinutes),
      protocol: args.protocol.trim() || "custom",
      startDate: assertDateKey(args.startDate, "startDate"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const stop = mutation({
  args: {
    id: v.id("fastingSessions"),
    endedAt: v.optional(v.number()),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ownedSession(ctx, args.id, user._id);
    if (doc.endedAt !== undefined) throw new Error("This fast already ended");

    const now = Date.now();
    // An end time can never precede the start, however the clock behaved.
    const endedAt = Math.max(
      doc.startedAt,
      Number.isFinite(args.endedAt) ? (args.endedAt as number) : now,
    );
    const elapsedMinutes = (endedAt - doc.startedAt) / 60000;

    await ctx.db.patch(args.id, {
      endedAt,
      endDate: assertDateKey(args.endDate, "endDate"),
      endedEarly: elapsedMinutes < doc.targetMinutes,
      note: cleanNote(args.note),
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("fastingSessions"),
    startedAt: v.optional(v.number()),
    targetMinutes: v.optional(v.number()),
    protocol: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ownedSession(ctx, args.id, user._id);

    const now = Date.now();
    const startedAt =
      args.startedAt === undefined
        ? doc.startedAt
        : clampStartedAt(args.startedAt, doc.endedAt ?? now);
    const targetMinutes =
      args.targetMinutes === undefined
        ? doc.targetMinutes
        : safeTargetMinutes(args.targetMinutes);

    await ctx.db.patch(args.id, {
      startedAt,
      targetMinutes,
      ...(args.protocol ? { protocol: args.protocol.trim() || "custom" } : {}),
      ...(args.note === undefined ? {} : { note: cleanNote(args.note) }),
      ...(doc.endedAt !== undefined
        ? { endedEarly: (doc.endedAt - startedAt) / 60000 < targetMinutes }
        : {}),
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("fastingSessions") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    await ownedSession(ctx, args.id, user._id);
    await ctx.db.delete(args.id);
  },
});
