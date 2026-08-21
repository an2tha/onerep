/**
 * The coach's computed views, surfaced to their owner.
 *
 * Since Phase 2 the server has known which lifts are stalled, how recovered
 * the body wearing the watch is, and what the last six months amounted to —
 * and showed it only to the model. That asymmetry made the Sunday review read
 * like an oracle: "your bench has stalled" with nothing the user could point
 * at. These queries hand the same computed blocks to the person they are
 * about.
 *
 * No privacy gate here, deliberately. `personalizedInsightsEnabled` governs
 * what is inferred *for the AI*; this is arithmetic over the user's own logs,
 * shown to the user. Withholding someone's own statistics because they opted
 * out of AI personalization would be punishing the opt-out.
 */

import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { safeGetAuthUser } from "./lib/auth";
import {
  PROGRAMMING_WINDOW_DAYS,
  summarizeProgramming,
} from "./lib/programming";
import { listRecoveryWindow } from "./lib/healthMetrics";
import { summarizeRecovery } from "./lib/recovery";
import {
  buildHistoryBlock,
  HISTORY_MONTHS,
  recentMonthKeys,
} from "./lib/history";

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function buildInsights(ctx: QueryCtx, userId: string, today: string) {
  const [programmingLogs, recoveryRows, monthlySummaries] = await Promise.all([
    ctx.db
      .query("workoutLogs")
      .withIndex("by_userId_date", (q) =>
        q
          .eq("userId", userId)
          .gte("date", shiftDateKey(today, -(PROGRAMMING_WINDOW_DAYS - 1))),
      )
      .order("desc")
      .take(200),
    listRecoveryWindow(ctx, userId, today),
    ctx.db
      .query("coachMonthlySummaries")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(HISTORY_MONTHS * 2),
  ]);

  const recovery = summarizeRecovery(recoveryRows, today);
  const wanted = new Set(recentMonthKeys(today, HISTORY_MONTHS));

  return {
    programming: summarizeProgramming(
      programmingLogs.map((log) => ({
        date: log.date,
        exercises: Array.isArray(log.exercises) ? log.exercises : [],
      })),
      today,
      PROGRAMMING_WINDOW_DAYS,
      recovery,
    ),
    recovery,
    history: buildHistoryBlock(
      monthlySummaries
        .filter((row) => wanted.has(row.month))
        .map((row) => ({
          month: row.month,
          sessions: row.sessions,
          activeDays: row.activeDays,
          sets: row.sets,
          loggedFoodDays: row.loggedFoodDays,
          daysInMonth: row.daysInMonth,
          avgCalories: row.avgCalories,
          avgProtein: row.avgProtein,
          weightStartKg: row.weightStartKg,
          weightEndKg: row.weightEndKg,
        })),
    ),
  };
}

export const training = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    return buildInsights(ctx, user._id, args.today.slice(0, 10));
  },
});

/** The same blocks for the MCP surface, which authenticates by token. */
export const forUser = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: (ctx, args) => buildInsights(ctx, args.userId, args.today),
});
