import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUser } from "../lib/auth";

export const isTooltipCompleted = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

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

    if (!data) {
      throw new Error("Onboarding profile not found");
    }

    const shownTooltips = data.shownTooltips ?? [];

    if (!shownTooltips.includes(args.tooltipId)) {
      await ctx.db.patch(data._id, {
        shownTooltips: [...shownTooltips, args.tooltipId],
      });
    }
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
