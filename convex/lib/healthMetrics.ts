import type { MutationCtx, QueryCtx } from "../_generated/server";
import { RECOVERY_WINDOW_DAYS, type DailyMetrics } from "./recovery";
import { shiftDate } from "./healthSeries";

type Ctx = QueryCtx | MutationCtx;

/**
 * The daily recovery rows a baseline is drawn from, oldest first.
 *
 * Projected to the fields `summarizeRecovery` and the health score read. The
 * provider and the sync bookkeeping are of no interest to anything downstream,
 * and shipping the whole document into the coach workspace would be four dozen
 * wasted characters a day for a month.
 */
export async function listRecoveryWindow(
  ctx: Ctx,
  userId: string,
  today: string,
  windowDays: number = RECOVERY_WINDOW_DAYS,
): Promise<DailyMetrics[]> {
  const earliest = new Date(`${today}T12:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - (windowDays - 1));
  const since = earliest.toISOString().slice(0, 10);

  const rows = await ctx.db
    .query("healthMetrics")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).gte("date", since),
    )
    .collect();

  return rows
    .filter((row) => row.date <= today)
    .map((row) => ({
      date: row.date,
      sleepMinutes: row.sleepMinutes,
      steps: row.steps,
      restingHeartRateBpm: row.restingHeartRateBpm,
      hrvMs: row.hrvMs,
      activeEnergyKcal: row.activeEnergyKcal,
    }));
}

/**
 * Minutes of recorded exercise per local day.
 *
 * Read from `healthWorkouts` rather than from the user's own training log,
 * because this grades time spent with an elevated heart rate, and the health
 * store already sees the runs and the classes OneRep never hears about. The
 * index is on `startedAt`, so the scan is bounded by a timestamp and then
 * re-filtered on the stored local date — a day either side of slack covers
 * every timezone without a second index.
 */
export async function exerciseMinutesByDate(
  ctx: Ctx,
  userId: string,
  since: string,
  until: string,
): Promise<Record<string, number>> {
  const floor = Date.parse(`${shiftDate(since, -1)}T00:00:00Z`);
  const rows = await ctx.db
    .query("healthWorkouts")
    .withIndex("by_userId_and_startedAt", (q) =>
      q.eq("userId", userId).gte("startedAt", floor),
    )
    .collect();

  const minutes: Record<string, number> = {};
  for (const row of rows) {
    if (row.date < since || row.date > until) continue;
    if (!Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0) {
      continue;
    }
    minutes[row.date] = (minutes[row.date] ?? 0) + row.durationSeconds / 60;
  }
  return minutes;
}

/**
 * Sessions the health store recorded, oldest first.
 *
 * These reached the coach only as a minute count inside the activity pillar,
 * which meant a user who ran four times a week appeared, to the one thing in
 * the app that gives advice, to have not trained at all. The runs, rides and
 * classes are most of some people's week; a coach that cannot see them is
 * guessing.
 *
 * Projected here rather than in the workspace so the provider ids, the sync
 * bookkeeping and the route metadata never leave the server.
 */
export async function listHealthSessionWindow(
  ctx: Ctx,
  userId: string,
  since: string,
  until: string,
  limit: number,
) {
  const floor = Date.parse(`${shiftDate(since, -1)}T00:00:00Z`);
  const rows = await ctx.db
    .query("healthWorkouts")
    .withIndex("by_userId_and_startedAt", (q) =>
      q.eq("userId", userId).gte("startedAt", floor),
    )
    .collect();

  return rows
    .filter((row) => row.date >= since && row.date <= until && !row.dismissedAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-limit)
    .map((row) => ({
      date: row.date,
      activity: row.activityName,
      minutes: Math.round(row.durationSeconds / 60),
      ...(row.totalDistanceMeters != null
        ? { distanceKm: Math.round(row.totalDistanceMeters / 100) / 10 }
        : {}),
      ...(row.avgHeartRateBpm != null
        ? { avgHeartRateBpm: Math.round(row.avgHeartRateBpm) }
        : {}),
      ...(row.activeEnergyKcal != null
        ? { kcal: Math.round(row.activeEnergyKcal) }
        : {}),
      /**
       * Whether this is already in the training log. Without it the coach
       * double-counts: the same hour shows up once as a logged session and
       * once as an imported one, and it congratulates the user twice.
       */
      inTrainingLog: Boolean(row.linkedSessionId),
    }));
}
