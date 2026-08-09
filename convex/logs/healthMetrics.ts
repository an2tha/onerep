/**
 * Daily recovery signals from the platform health store.
 *
 * The client re-reads the same handful of days on every foreground sync,
 * because a watch writes yesterday's sleep hours after the fact and a phone
 * that syncs at breakfast has an incomplete picture of the night. So every
 * write is an upsert keyed on the local day, and the newest read wins. There is
 * no append path and no history of reads — the health store is the source of
 * truth, and this table is a cache of it shaped for the coach.
 */

import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { summarizeRecovery } from "../lib/recovery";
import { listRecoveryWindow } from "../lib/healthMetrics";

/** One sync should never carry more than a month; anything more is a bug. */
const MAX_DAYS_PER_SYNC = 45;

const dailyMetricValidator = v.object({
  date: v.string(),
  sleepMinutes: v.optional(v.number()),
  steps: v.optional(v.number()),
  restingHeartRateBpm: v.optional(v.number()),
  hrvMs: v.optional(v.number()),
  activeEnergyKcal: v.optional(v.number()),
});

/**
 * Rejects values a sensor could not plausibly have produced.
 *
 * Health stores aggregate third-party apps, and a badly-behaved one writing a
 * 400bpm resting heart rate would quietly poison a baseline for a month. Out
 * of range means the field is dropped, not the row: the day's sleep is still
 * worth keeping when its heart rate is nonsense.
 */
function sane(value: number | undefined, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const sync = mutation({
  args: {
    provider: v.union(v.literal("apple_health"), v.literal("health_connect")),
    days: v.array(dailyMetricValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();
    let written = 0;

    for (const day of args.days.slice(0, MAX_DAYS_PER_SYNC)) {
      if (!isDateKey(day.date)) continue;

      const fields = {
        // 22 hours of sleep is a data-entry error or a coma; either way it is
        // not a baseline input.
        sleepMinutes: sane(day.sleepMinutes, 1, 22 * 60),
        steps: sane(day.steps, 0, 200_000),
        restingHeartRateBpm: sane(day.restingHeartRateBpm, 25, 150),
        hrvMs: sane(day.hrvMs, 1, 500),
        activeEnergyKcal: sane(day.activeEnergyKcal, 0, 20_000),
      };

      // A row with nothing in it is not worth a document. This is the ordinary
      // case for future dates and for days before the user owned the watch.
      if (Object.values(fields).every((value) => value === undefined)) continue;

      const existing = await ctx.db
        .query("healthMetrics")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).eq("date", day.date),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...fields,
          provider: args.provider,
          syncedAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("healthMetrics", {
          userId: user._id,
          date: day.date,
          provider: args.provider,
          ...fields,
          syncedAt: now,
          updatedAt: now,
        });
      }
      written += 1;
    }

    return { written };
  },
});

/** The dates already held, so the client can sync only what is missing. */
export const syncedDates = query({
  args: { since: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("healthMetrics")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", user._id).gte("date", args.since),
      )
      .collect();
    return rows.map((row) => ({ date: row.date, syncedAt: row.syncedAt }));
  },
});

/** The recovery read-out, for the app's own use as well as the coach's. */
export const recovery = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    return summarizeRecovery(
      await listRecoveryWindow(ctx, user._id, args.today),
      args.today,
    );
  },
});

export const listForUser = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: (ctx, args) => listRecoveryWindow(ctx, args.userId, args.today),
});
