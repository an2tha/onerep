import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Water day-docs on or before `onOrBefore`, newest first.
 *
 * `waterLogs` stores one document per user-day, so `limit` is a day count.
 */
export async function listWaterDays(
  ctx: Ctx,
  userId: string,
  onOrBefore: string,
  limit = 14,
): Promise<Doc<"waterLogs">[]> {
  return await ctx.db
    .query("waterLogs")
    .withIndex("by_userId_date", (q) =>
      q.eq("userId", userId).lte("date", onOrBefore),
    )
    .order("desc")
    .take(limit);
}
