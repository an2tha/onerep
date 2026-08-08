import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const outcomeValidator = v.union(
  v.literal("shown"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

/** Rows older than this are bookkeeping nobody will ever read again. */
const KEEP_PER_EVENT = 12;

/**
 * The moments this user has already been shown, newest first.
 *
 * Deliberately small and unfiltered: the client decides which triggers are
 * armed, and it needs the recent history of all of them to avoid asking the
 * same question twice. Returns [] rather than throwing so a diary viewer with
 * no records of their own does not error the app shell.
 */
export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("momentEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(60);

    return rows.map((row) => ({
      eventId: row.eventId,
      key: row.key,
      outcome: row.outcome,
      shownAt: row.shownAt,
      updatedAt: row.updatedAt,
    }));
  },
});

/**
 * Upserts the record for one event+key.
 *
 * Called twice per moment — once when it opens, once when it is answered — so
 * a moment interrupted by a killed app still counts as asked. The first write
 * wins on `shownAt`; later writes only move the outcome forward.
 */
export const record = mutation({
  args: {
    eventId: v.string(),
    key: v.string(),
    outcome: outcomeValidator,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("momentEvents")
      .withIndex("by_userId_and_event_and_key", (q) =>
        q
          .eq("userId", user._id)
          .eq("eventId", args.eventId)
          .eq("key", args.key),
      )
      .unique();

    if (existing) {
      // "shown" arriving after an answer is a late write from a component that
      // has not unmounted yet. It must not un-answer the moment.
      if (args.outcome === "shown" && existing.outcome !== "shown") {
        return { recorded: false };
      }
      await ctx.db.patch(existing._id, {
        outcome: args.outcome,
        updatedAt: now,
      });
      return { recorded: true };
    }

    await ctx.db.insert("momentEvents", {
      userId: user._id,
      eventId: args.eventId,
      key: args.key,
      outcome: args.outcome,
      shownAt: now,
      updatedAt: now,
    });

    await pruneEvent(ctx, user._id, args.eventId);
    return { recorded: true };
  },
});

/**
 * Forgets that any of this has been shown, so the real triggers can fire
 * again. Behind the developer menu; harmless if a user finds it.
 */
export const clearHistory = mutation({
  args: { eventId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const rows = args.eventId
      ? await ctx.db
          .query("momentEvents")
          .withIndex("by_userId_and_event", (q) =>
            q.eq("userId", user._id).eq("eventId", args.eventId!),
          )
          .collect()
      : await ctx.db
          .query("momentEvents")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect();

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    return { cleared: rows.length };
  },
});

async function pruneEvent(ctx: MutationCtx, userId: string, eventId: string) {
  const rows = await ctx.db
    .query("momentEvents")
    .withIndex("by_userId_and_event", (q) =>
      q.eq("userId", userId).eq("eventId", eventId),
    )
    .order("desc")
    .collect();

  await Promise.all(
    rows.slice(KEEP_PER_EVENT).map((row) => ctx.db.delete(row._id)),
  );
}
