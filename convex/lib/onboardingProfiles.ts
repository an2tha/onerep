import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type OnboardingCtx = QueryCtx | MutationCtx;

export async function getLatestOnboardingProfile(
  ctx: OnboardingCtx,
  userId: string,
): Promise<Doc<"onboardingProfiles"> | null> {
  return await ctx.db
    .query("onboardingProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
}

export async function listOnboardingProfilesForUser(
  ctx: OnboardingCtx,
  userId: string,
  limit = 100,
): Promise<Doc<"onboardingProfiles">[]> {
  return await ctx.db
    .query("onboardingProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}
