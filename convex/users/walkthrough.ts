import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

const statusValidator = v.union(
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("skipped"),
);

/**
 * All chapter progress for the signed-in user, keyed by chapterId.
 *
 * Returns {} rather than throwing when unauthenticated: an invited diary viewer
 * can reach the app before any of their own records exist.
 */
export const getWalkthroughProgress = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return {};

    const rows = await ctx.db
      .query("walkthroughProgress")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return Object.fromEntries(
      rows.map((row) => [
        row.chapterId,
        {
          status: row.status,
          stepIndex: row.stepIndex,
          version: row.version,
          updatedAt: row.updatedAt,
        },
      ]),
    );
  },
});

export const setChapterProgress = mutation({
  args: {
    chapterId: v.string(),
    status: statusValidator,
    stepIndex: v.number(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("walkthroughProgress")
      .withIndex("by_userId_and_chapter", (q) =>
        q.eq("userId", user._id).eq("chapterId", args.chapterId),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("walkthroughProgress", {
        userId: user._id,
        chapterId: args.chapterId,
        status: args.status,
        stepIndex: args.stepIndex,
        version: args.version,
        startedAt: now,
        updatedAt: now,
      });
      return { recorded: true };
    }

    // A finished chapter only reopens when its content actually changed. Without
    // this a late in-flight write from an unmounting tour could undo a "Done".
    const finished =
      existing.status === "completed" || existing.status === "skipped";
    if (
      finished &&
      args.status === "in_progress" &&
      args.version <= existing.version
    ) {
      return { recorded: false };
    }

    await ctx.db.patch(existing._id, {
      status: args.status,
      stepIndex: args.stepIndex,
      version: args.version,
      updatedAt: now,
    });

    return { recorded: true };
  },
});

/** Omit chapterId to reset everything (used by "Replay everything"). */
export const resetChapterProgress = mutation({
  args: { chapterId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    const rows = args.chapterId
      ? await ctx.db
          .query("walkthroughProgress")
          .withIndex("by_userId_and_chapter", (q) =>
            q.eq("userId", user._id).eq("chapterId", args.chapterId!),
          )
          .collect()
      : await ctx.db
          .query("walkthroughProgress")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .collect();

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    return { reset: rows.length };
  },
});
