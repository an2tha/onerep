import { ConvexError, v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUser } from "./lib/auth";

const kindValidator = v.union(v.literal("bug"), v.literal("feature"));
const moderationStatusValidator = v.union(
  v.literal("approved"),
  v.literal("declined"),
  v.literal("completed"),
);

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function moderatorEmails() {
  return new Set(
    (env.FEEDBACK_MODERATOR_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function requireModerator(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthUser(ctx);
  if (!user.email || !moderatorEmails().has(user.email.toLowerCase())) {
    throw new ConvexError("You do not have permission to moderate feedback.");
  }
  return user;
}

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return {
      canModerate: Boolean(
        user.email && moderatorEmails().has(user.email.toLowerCase()),
      ),
    };
  },
});

export const submit = mutation({
  args: {
    kind: kindValidator,
    title: v.string(),
    details: v.string(),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const title = clean(args.title);
    const details = args.details.trim();
    if (title.length < 5 || title.length > 100) {
      throw new ConvexError("Use a title between 5 and 100 characters.");
    }
    if (details.length < 20 || details.length > 4000) {
      throw new ConvexError("Add between 20 and 4,000 characters of detail.");
    }

    const latest = await ctx.db
      .query("feedbackItems")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (latest && Date.now() - latest.createdAt < 30_000) {
      throw new ConvexError(
        "Please wait a moment before sending another item.",
      );
    }

    const now = Date.now();
    return await ctx.db.insert("feedbackItems", {
      userId: user._id,
      authorName: clean(user.name ?? "OneRep member").slice(0, 80),
      kind: args.kind,
      title,
      details,
      status: "pending",
      voteCount: 0,
      appVersion: args.appVersion?.trim().slice(0, 80) || undefined,
      platform: args.platform?.trim().slice(0, 30) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    return await ctx.db
      .query("feedbackItems")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);
  },
});

export const listFeatures = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    const [approved, completed] = await Promise.all([
      ctx.db
        .query("feedbackItems")
        .withIndex("by_kind_and_status_and_voteCount", (q) =>
          q.eq("kind", "feature").eq("status", "approved"),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("feedbackItems")
        .withIndex("by_kind_and_status_and_voteCount", (q) =>
          q.eq("kind", "feature").eq("status", "completed"),
        )
        .order("desc")
        .take(100),
    ]);
    const items = [...approved, ...completed]
      .sort((a, b) => b.voteCount - a.voteCount || b.createdAt - a.createdAt)
      .slice(0, 100);

    return await Promise.all(
      items.map(async (item) => ({
        ...item,
        hasVoted: Boolean(
          await ctx.db
            .query("feedbackVotes")
            .withIndex("by_itemId_and_userId", (q) =>
              q.eq("itemId", item._id).eq("userId", user._id),
            )
            .unique(),
        ),
      })),
    );
  },
});

export const toggleVote = mutation({
  args: { itemId: v.id("feedbackItems") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const item = await ctx.db.get("feedbackItems", args.itemId);
    if (!item || item.kind !== "feature" || item.status !== "approved") {
      throw new ConvexError("This feature idea is not open for voting.");
    }
    const vote = await ctx.db
      .query("feedbackVotes")
      .withIndex("by_itemId_and_userId", (q) =>
        q.eq("itemId", args.itemId).eq("userId", user._id),
      )
      .unique();
    if (vote) {
      await ctx.db.delete("feedbackVotes", vote._id);
      await ctx.db.patch("feedbackItems", item._id, {
        voteCount: Math.max(0, item.voteCount - 1),
        updatedAt: Date.now(),
      });
      return { voted: false };
    }
    await ctx.db.insert("feedbackVotes", {
      itemId: item._id,
      userId: user._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch("feedbackItems", item._id, {
      voteCount: item.voteCount + 1,
      updatedAt: Date.now(),
    });
    return { voted: true };
  },
});

export const moderationQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireModerator(ctx);
    return await ctx.db
      .query("feedbackItems")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(100);
  },
});

export const moderate = mutation({
  args: {
    itemId: v.id("feedbackItems"),
    status: moderationStatusValidator,
  },
  handler: async (ctx, args) => {
    await requireModerator(ctx);
    const item = await ctx.db.get("feedbackItems", args.itemId);
    if (!item) throw new ConvexError("Feedback item not found.");
    if (item.kind === "bug" && args.status === "approved") {
      throw new ConvexError(
        "Bug reports stay private; decline or complete it.",
      );
    }
    await ctx.db.patch("feedbackItems", item._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});
