/**
 * The user's side of the Sunday review: read it, apply a proposal, or say no.
 *
 * Applying does not happen here. The client hands the approved operation to
 * `coachOperations.applyApproved`, the same executor chat uses, and then marks
 * it applied through this file. That indirection is the point — proposals from
 * a cron get exactly the same validation, action-event trail and undo payload
 * as anything the user asked for out loud, because they go through the same
 * door.
 */

import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const review = await ctx.db
      .query("coachReviews")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending"),
      )
      .order("desc")
      .first();
    if (!review) return null;
    return {
      id: review._id,
      weekStart: review.weekStart,
      weekKey: review.weekKey,
      headline: review.headline,
      summary: review.summary,
      focus: review.focus ?? null,
      operations: review.proposedOperations,
      appliedOperations: review.appliedOperations,
      requestId: review.requestId,
      createdAt: review.createdAt,
    };
  },
});

/** The most recent reviews, for the history view in Coach. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const reviews = await ctx.db
      .query("coachReviews")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 12, 1), 52));
    return reviews.map((review) => ({
      id: review._id,
      weekStart: review.weekStart,
      weekKey: review.weekKey,
      status: review.status,
      headline: review.headline,
      summary: review.summary,
      focus: review.focus ?? null,
    }));
  },
});

async function ownedReview(
  ctx: MutationCtx,
  id: Id<"coachReviews">,
  userId: string,
) {
  const review = await ctx.db.get(id);
  if (!review || review.userId !== userId) {
    throw new Error("Review not found");
  }
  return review;
}

/**
 * Records that one proposal was applied.
 *
 * Called after `applyApproved` succeeds, never before: a review that claims to
 * have changed a routine it did not change is worse than one that forgets it
 * did.
 */
export const markApplied = mutation({
  args: { reviewId: v.id("coachReviews"), index: v.number() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const review = await ownedReview(ctx, args.reviewId, user._id);

    const index = Math.trunc(args.index);
    if (index < 0 || index >= review.proposedOperations.length) {
      throw new Error("No such proposal");
    }

    const applied = Array.from(
      new Set([...review.appliedOperations, index]),
    ).sort((a, b) => a - b);
    const now = Date.now();
    await ctx.db.patch(review._id, {
      appliedOperations: applied,
      status:
        applied.length >= review.proposedOperations.length
          ? "approved"
          : "partial",
      updatedAt: now,
      respondedAt: review.respondedAt ?? now,
    });
    return { applied };
  },
});

/**
 * "Not this week."
 *
 * Dismissal keeps whatever was already applied — the status records what the
 * user did with the review, and half-taken advice is a real outcome rather
 * than a failure state.
 */
export const dismiss = mutation({
  args: { reviewId: v.id("coachReviews") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const review = await ownedReview(ctx, args.reviewId, user._id);
    const now = Date.now();
    await ctx.db.patch(review._id, {
      status: review.appliedOperations.length > 0 ? "partial" : "dismissed",
      updatedAt: now,
      respondedAt: review.respondedAt ?? now,
    });
    return { dismissed: true };
  },
});
