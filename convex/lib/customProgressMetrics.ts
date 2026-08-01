import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export type CustomMetricWithEntries = Doc<"customProgressMetrics"> & {
  entries: Doc<"customProgressMetricEntries">[];
};

/**
 * Metric definitions with their recent values, newest first.
 *
 * `entryLimit` counts entries per metric, not in total. Definitions without any
 * entries still come back — an empty metric is meaningful (it tells the coach
 * something is being tracked but not logged).
 */
export async function listCustomMetricsWithEntries(
  ctx: Ctx,
  userId: string,
  entryLimit = 30,
  metricLimit = 24,
): Promise<CustomMetricWithEntries[]> {
  const metrics = await ctx.db
    .query("customProgressMetrics")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(metricLimit);

  return await Promise.all(
    metrics.map(async (metric) => ({
      ...metric,
      entries: await ctx.db
        .query("customProgressMetricEntries")
        .withIndex("by_userId_and_metricId", (q) =>
          q.eq("userId", userId).eq("metricId", metric._id),
        )
        .order("desc")
        .take(entryLimit),
    })),
  );
}
