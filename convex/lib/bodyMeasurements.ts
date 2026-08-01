import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Recent body check-ins, newest first.
 *
 * Bounded on purpose: the public `bodyProgress.list` used to `.collect()` every
 * row a user had ever written and sort in JS, which is a read that grows
 * forever. Ordered by `loggedAt` so backfilled check-ins land in the right
 * place.
 */
export async function listBodyMeasurements(
  ctx: Ctx,
  userId: string,
  limit = 60,
): Promise<Doc<"bodyMeasurements">[]> {
  return await ctx.db
    .query("bodyMeasurements")
    .withIndex("by_userId_and_loggedAt", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}
