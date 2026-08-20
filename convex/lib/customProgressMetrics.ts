import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  HEALTH_DIAL_KEYS,
  healthDialForCustomMetric,
} from "./healthMetricCatalog";
import {
  CUSTOM_METRIC_WINDOW_DAYS,
  scoreCustomMetric,
  scoreDial,
  type ScoredCustomMetric,
  type ScoredDial,
} from "./customMetricScoring";

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

/**
 * The custom metrics the Health page draws, already filed under their dials.
 *
 * Lives here rather than in the query because two surfaces want the same shape
 * and the interesting part — which dial a metric belongs to, and whether the
 * window holds anything worth drawing a ring around — is not something a page
 * should be re-deriving from raw entries. Dials with no metrics at all are
 * dropped: an empty ring on the Health page is a promise the data cannot keep.
 */
export async function buildCustomMetricDials(
  ctx: Ctx,
  userId: string,
  today: string,
  windowDays: number = CUSTOM_METRIC_WINDOW_DAYS,
): Promise<ScoredDial[]> {
  // One entry per day of the window at most, so the window length is the right
  // ceiling; a metric logged twice on the same day only ever has one row.
  const metrics = await listCustomMetricsWithEntries(ctx, userId, windowDays);

  const byDial = new Map<string, ScoredCustomMetric[]>();
  for (const metric of metrics) {
    const dial = healthDialForCustomMetric(metric);
    if (!dial) continue;
    const scored = scoreCustomMetric(
      {
        metricId: metric._id,
        title: metric.title,
        unit: metric.unit,
        kind: metric.kind,
        target: metric.target,
        healthMetricKey: metric.healthMetricKey,
        tab: metric.tab,
        entries: metric.entries.map((entry) => ({
          date: entry.date,
          value: entry.value,
        })),
      },
      today,
      windowDays,
    );
    const held = byDial.get(dial) ?? [];
    held.push(scored);
    byDial.set(dial, held);
  }

  // Catalogue order, so the page never reshuffles its dials between renders.
  return HEALTH_DIAL_KEYS.filter((key) => byDial.has(key)).map((key) =>
    scoreDial(key, byDial.get(key) as ScoredCustomMetric[]),
  );
}
