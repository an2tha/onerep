import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** The user's health profile, or null if they never completed one. */
export async function getHealthProfile(
  ctx: Ctx,
  userId: string,
): Promise<Doc<"healthProfiles"> | null> {
  return await ctx.db
    .query("healthProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}
