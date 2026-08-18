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
