import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Every intake event in `[sinceDate, onOrBefore]`, newest first.
 *
 * The existing supplement queries are all single-date; adherence needs a real
 * window, which `by_userId_and_date` supports as a range read.
 */
export async function listSupplementIntakeWindow(
  ctx: Ctx,
  userId: string,
  sinceDate: string,
  onOrBefore: string,
  limit = 200,
): Promise<Doc<"supplementIntakeLogs">[]> {
  return await ctx.db
    .query("supplementIntakeLogs")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).gte("date", sinceDate).lte("date", onOrBefore),
    )
    .order("desc")
    .take(limit);
}
