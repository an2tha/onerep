import type { MutationCtx, QueryCtx } from "../_generated/server";
import { RECOVERY_WINDOW_DAYS, type DailyMetrics } from "./recovery";

type Ctx = QueryCtx | MutationCtx;

/**
 * The daily recovery rows a baseline is drawn from, oldest first.
 *
 * Projected to the four fields `summarizeRecovery` reads. The provider and the
 * sync bookkeeping are of no interest to anything downstream, and shipping the
 * whole document into the coach workspace would be four dozen wasted characters
 * a day for a month.
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
    }));
}
