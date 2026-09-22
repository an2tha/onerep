import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, query } from "../_generated/server";
import { safeGetAuthUser } from "../lib/auth";
import { jevHandoffValidator } from "./coachPreparationValidators";

const LIFETIME_MS = 10 * 60 * 1000;

/** This channel carries only transient preparation, never a completed answer. */
export const get = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    const result = await ctx.db
      .query("coachPreparations")
      .withIndex("by_user_request", (q) =>
        q.eq("userId", user._id).eq("requestId", requestId),
      )
      .unique();
    return result && result.expiresAt > Date.now() ? result.handoff : null;
  },
});

export const publish = internalMutation({
  args: {
    userId: v.string(),
    requestId: v.string(),
    handoff: jevHandoffValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("coachPreparations")
      .withIndex("by_user_request", (q) =>
        q.eq("userId", args.userId).eq("requestId", args.requestId),
      )
      .unique();
    if (existing) return;
    const id = await ctx.db.insert("coachPreparations", {
      ...args,
      expiresAt: Date.now() + LIFETIME_MS,
    });
    await ctx.scheduler.runAfter(
      LIFETIME_MS,
      internal.ai.coachPreparations.remove,
      { id },
    );
  },
});

export const remove = internalMutation({
  args: { id: v.id("coachPreparations") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get("coachPreparations", id))
      await ctx.db.delete("coachPreparations", id);
  },
});
