import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";
import {
  getLatestOnboardingProfile,
  listOnboardingProfilesForUser,
} from "../lib/onboardingProfiles";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;

    return await getLatestOnboardingProfile(ctx, user._id);
  },
});

export const save = mutation({
  args: {
    age: v.number(),
    heightCm: v.number(),
    goal: v.union(
      v.literal("lose"),
      v.literal("build"),
      v.literal("health"),
      v.literal("performance"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const [existing, ...duplicates] = await listOnboardingProfilesForUser(
      ctx,
      user._id,
    );

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      for (const duplicate of duplicates) {
        await ctx.db.delete(duplicate._id);
      }
    } else {
      await ctx.db.insert("onboardingProfiles", {
        userId: user._id,
        ...args,
        updatedAt: now,
      });
    }
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const profiles = await listOnboardingProfilesForUser(ctx, user._id);
    for (const profile of profiles) {
      await ctx.db.delete(profile._id);
    }
  },
});
