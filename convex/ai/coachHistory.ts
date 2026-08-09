/**
 * Computing and storing the long view.
 *
 * Recomputation is deliberately narrow: the current month and the one before
 * it, and only when the weekly review runs. A closed month cannot change once
 * its last day has passed — except through backdated edits, which is exactly
 * what the second month covers — so re-deriving anything older would be paying
 * every week for an answer that was already correct.
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import {
  buildHistoryBlock,
  daysInMonth,
  HISTORY_MONTHS,
  recentMonthKeys,
  summarizeMonth,
  type MonthSummary,
} from "../lib/history";
import {
  MAX_STORED_MEMORIES,
  selectMemoriesToEvict,
  type StoredMemory,
} from "../lib/memoryConsolidation";

/** Months recomputed per run: the current one, and the previous for late edits. */
const RECOMPUTE_MONTHS = 2;

function monthBounds(month: string) {
  return { start: `${month}-01`, end: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

/** The months a recompute should touch, newest last. */
export function monthsToRecompute(today: string, count = RECOMPUTE_MONTHS) {
  return recentMonthKeys(today, count);
}

export const recomputeMonths = internalMutation({
  args: { userId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const months = monthsToRecompute(args.today);
    const earliest = monthBounds(months[0]).start;
    const latest = monthBounds(months[months.length - 1]).end;

    const [foodDays, workouts, measurements] = await Promise.all([
      ctx.db
        .query("foodLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", args.userId).gte("date", earliest).lte("date", latest),
        )
        .collect(),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", args.userId).gte("date", earliest).lte("date", latest),
        )
        .collect(),
      ctx.db
        .query("bodyMeasurements")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .order("desc")
        .take(200),
    ]);

    const now = Date.now();
    for (const month of months) {
      const summary = summarizeMonth({
        month,
        foodDays: foodDays.map((log) => ({
          date: log.date,
          entries: (Array.isArray(log.entries) ? log.entries : []) as Array<{
            calories?: number;
            protein?: number;
          }>,
        })),
        workouts: workouts.map((log) => ({
          date: log.date,
          exercises: (Array.isArray(log.exercises) ? log.exercises : []) as Array<{
            sets?: Array<{ completed?: boolean; type?: string }>;
          }>,
        })),
        measurements: measurements.map((entry) => ({
          loggedAt: entry.loggedAt,
          weightKg: entry.weightKg,
        })),
      });

      // An empty month is not worth a document. Someone who did not use the
      // app in March should have a gap in their history, not a row of zeros
      // the coach might read as a month of doing nothing.
      const empty =
        summary.sessions === 0 &&
        summary.loggedFoodDays === 0 &&
        summary.weightEndKg === null;

      const existing = await ctx.db
        .query("coachMonthlySummaries")
        .withIndex("by_userId_and_month", (q) =>
          q.eq("userId", args.userId).eq("month", month),
        )
        .unique();

      if (empty) {
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }

      if (existing) {
        await ctx.db.patch(existing._id, { ...summary, computedAt: now });
      } else {
        await ctx.db.insert("coachMonthlySummaries", {
          userId: args.userId,
          ...summary,
          computedAt: now,
        });
      }
    }

    return { months };
  },
});

export const loadHistory = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const wanted = new Set(recentMonthKeys(args.today, HISTORY_MONTHS));
    const rows = await ctx.db
      .query("coachMonthlySummaries")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(HISTORY_MONTHS * 2);

    const summaries: MonthSummary[] = rows
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
      }));

    return buildHistoryBlock(summaries);
  },
});

/**
 * Writes the week's episode and prunes whatever no longer earns its place.
 *
 * The digest is stored as an ordinary memory so it flows through the existing
 * read path, the existing privacy handling, and the memory list the user can
 * already see and edit in Coach. Nothing about it is special except that
 * nobody asked for it, which is why the consolidation rules protect the user's
 * own memories from it rather than the other way round.
 */
export const recordEpisode = internalMutation({
  args: {
    userId: v.string(),
    weekKey: v.string(),
    digest: v.string(),
  },
  handler: async (ctx, args) => {
    const digest = args.digest.trim().slice(0, 240);
    if (!digest) return { stored: false, evicted: 0 };

    const key = `episode:${args.weekKey}`.toLowerCase().slice(0, 64);
    const now = Date.now();

    const existing = await ctx.db
      .query("coachMemories")
      .withIndex("by_userId_and_key", (q) =>
        q.eq("userId", args.userId).eq("key", key),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { value: digest, updatedAt: now });
    } else {
      await ctx.db.insert("coachMemories", {
        userId: args.userId,
        key,
        category: "episode",
        value: digest,
        source: "weekly_review",
        updatedAt: now,
      });
    }

    const evicted = await consolidate(ctx, args.userId);
    return { stored: true, evicted };
  },
});

/** Exposed on its own so a future backfill can run it without writing a digest. */
export const consolidateMemories = internalMutation({
  args: { userId: v.string() },
  handler: (ctx, args) => consolidate(ctx, args.userId),
});

async function consolidate(ctx: MutationCtx, userId: string): Promise<number> {
  const rows = await ctx.db
    .query("coachMemories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_STORED_MEMORIES * 3);

  const memories: StoredMemory[] = rows.map((row) => ({
    id: String(row._id),
    key: row.key,
    category: row.category,
    value: row.value,
    source: row.source,
    updatedAt: row.updatedAt,
  }));

  const doomed = new Set(selectMemoriesToEvict(memories));
  if (doomed.size === 0) return 0;

  for (const row of rows) {
    if (doomed.has(String(row._id))) await ctx.db.delete(row._id);
  }
  return doomed.size;
}
