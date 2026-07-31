import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";

export const isTooltipCompleted = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return false;

    const data = await ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    return data?.shownTooltips?.includes(args.id) ?? false;
  },
});

export const markTooltipCompleted = mutation({
  args: {
    tooltipId: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const data = await ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    // A missing profile is not an error: the tooltip is cosmetic, and throwing
    // here left it unpersisted so it re-showed every session.
    if (!data) return { recorded: false };

    const shownTooltips = data.shownTooltips ?? [];

    if (!shownTooltips.includes(args.tooltipId)) {
      await ctx.db.patch(data._id, {
        shownTooltips: [...shownTooltips, args.tooltipId],
      });
    }

    return { recorded: true };
  },
});

export const resetShownTooltips = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);

    const data = await ctx.db
      .query("onboardingProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    if (!data) return { reset: false };

    await ctx.db.patch(data._id, {
      shownTooltips: [],
    });

    return { reset: true };
  },
});
