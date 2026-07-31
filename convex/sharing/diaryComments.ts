import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import {
  assertDateInScope,
  NO_ACCESS_MESSAGE,
  resolveDiaryOwner,
  safeResolveDiaryOwner,
} from "../lib/diaryAccess";

const MAX_BODY_LENGTH = 2000;
const MAX_COMMENTS = 200;

function cleanBody(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("A comment cannot be empty");
  return trimmed.slice(0, MAX_BODY_LENGTH);
}

// ── reads ─────────────────────────────────────────────────────────────────────

export const listForDay = query({
  args: { ownerUserId: v.optional(v.string()), date: v.string() },
  handler: async (ctx, args) => {
    const access = await safeResolveDiaryOwner(ctx, {
      ownerUserId: args.ownerUserId,
    });
    if (!access) return [];
    if (!access.isOwner && !access.canReadDiary) return [];

    const docs = await ctx.db
      .query("diaryComments")
      .withIndex("by_ownerUserId_and_date", (q) =>
        q.eq("ownerUserId", access.ownerUserId).eq("date", args.date),
      )
      .take(MAX_COMMENTS);

    return docs
      .filter((doc) => !doc.deletedAt)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

export const listRecent = query({
  args: { ownerUserId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await safeResolveDiaryOwner(ctx, {
      ownerUserId: args.ownerUserId,
    });
    if (!access) return [];

    const limit = Math.min(
      MAX_COMMENTS,
      Math.max(1, Math.round(args.limit ?? 20)),
    );

    const docs = await ctx.db
      .query("diaryComments")
      .withIndex("by_ownerUserId_and_createdAt", (q) =>
        q.eq("ownerUserId", access.ownerUserId),
      )
      .order("desc")
      .take(limit);

    return docs
      .filter((doc) => !doc.deletedAt)
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

/**
 * Comments on the caller's own diary that they have not seen yet.
 *
 * Their own comments never count — the point of the badge is "someone said
 * something to you", not "you typed something".
 */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return 0;

    const read = await ctx.db
      .query("diaryCommentReads")
      .withIndex("by_userId_and_ownerUserId", (q) =>
        q.eq("userId", user._id).eq("ownerUserId", user._id),
      )
      .unique();
    const lastReadAt = read?.lastReadAt ?? 0;

    const docs = await ctx.db
      .query("diaryComments")
      .withIndex("by_ownerUserId_and_createdAt", (q) =>
        q.eq("ownerUserId", user._id),
      )
      .order("desc")
      .take(MAX_COMMENTS);

    return docs.filter(
      (doc) =>
        !doc.deletedAt &&
        doc.createdAt > lastReadAt &&
        doc.authorUserId !== user._id,
    ).length;
  },
});

// ── writes ────────────────────────────────────────────────────────────────────

export const add = mutation({
  args: {
    ownerUserId: v.optional(v.string()),
    date: v.string(),
    entryId: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const access = await resolveDiaryOwner(ctx, {
      ownerUserId: args.ownerUserId,
    });
    // The owner can always annotate their own diary; a viewer needs the grant.
    if (!access.isOwner && !access.canComment) {
      throw new Error(NO_ACCESS_MESSAGE);
    }
    assertDateInScope(access, args.date);

    return await ctx.db.insert("diaryComments", {
      ownerUserId: access.ownerUserId,
      shareId: access.share?._id,
      authorUserId: user._id,
      authorName: user.name,
      authorRole: access.isOwner ? "owner" : "viewer",
      date: args.date,
      entryId: args.entryId,
      body: cleanBody(args.body),
      createdAt: Date.now(),
    });
  },
});

export const edit = mutation({
  args: { id: v.id("diaryComments"), body: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    // Editing is author-only: the diary owner may remove a comment but must not
    // be able to put words in someone else's mouth.
    if (!doc || doc.authorUserId !== user._id || doc.deletedAt) {
      throw new Error("Comment not found or access denied");
    }

    await ctx.db.patch(args.id, {
      body: cleanBody(args.body),
      editedAt: Date.now(),
    });
  },
});

/** Author or diary owner — the owner needs a way to moderate their own diary. */
export const remove = mutation({
  args: { id: v.id("diaryComments") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.deletedAt) {
      throw new Error("Comment not found or access denied");
    }
    if (doc.authorUserId !== user._id && doc.ownerUserId !== user._id) {
      throw new Error("Comment not found or access denied");
    }

    await ctx.db.patch(args.id, { deletedAt: Date.now() });
  },
});

export const markRead = mutation({
  args: { ownerUserId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const ownerUserId = args.ownerUserId ?? user._id;

    const existing = await ctx.db
      .query("diaryCommentReads")
      .withIndex("by_userId_and_ownerUserId", (q) =>
        q.eq("userId", user._id).eq("ownerUserId", ownerUserId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { lastReadAt: Date.now() });
    } else {
      await ctx.db.insert("diaryCommentReads", {
        userId: user._id,
        ownerUserId,
        lastReadAt: Date.now(),
      });
    }
  },
});
