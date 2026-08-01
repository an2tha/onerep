import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Most recent fasts first, by start time. */
export async function listRecentFastingSessions(
  ctx: Ctx,
  userId: string,
  limit = 14,
): Promise<Doc<"fastingSessions">[]> {
  return await ctx.db
    .query("fastingSessions")
    .withIndex("by_userId_startedAt", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}
