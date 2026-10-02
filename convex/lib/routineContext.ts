import type { QueryCtx } from "../_generated/server";
import { isoWeekKey, weekStartOf } from "../../packages/models/src/moments";

/** Explicit commitments survive the insights opt-out; journal observations do not. */
export async function routineContext(
  ctx: QueryCtx,
  userId: string,
  today: string,
) {
  const weekStart = weekStartOf(today);
  const weekKey = isoWeekKey(weekStart);
  const [restart, target, rest] = await Promise.all([
    ctx.db
      .query("restartPlans")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
    ctx.db
      .query("weeklyTargets")
      .withIndex("by_userId_and_week", (q) =>
        q.eq("userId", userId).eq("weekKey", weekKey),
      )
      .unique(),
    ctx.db
      .query("restDays")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", userId).gte("date", weekStart).lte("date", today),
      )
      .take(7),
  ]);
  return {
    restart:
      restart?.status === "active"
        ? {
            reason: restart.reason,
            action: restart.action,
            anchor: restart.anchor,
            stage: restart.stage,
            lastActionOn: restart.lastActionOn,
          }
        : null,
    weeklyCommitment: target ? { weekKey, sessions: target.sessions } : null,
    deliberateRestDates: rest.map((row) => row.date),
  };
}
