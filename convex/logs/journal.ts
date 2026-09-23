import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { getAuthUser } from "../lib/auth";

function checkDate(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid date");
}
export const getWeek = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, { start, end }) => {
    const user = await getAuthUser(ctx);
    checkDate(start);
    checkDate(end);
    return await ctx.db
      .query("journalEntries")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", user._id).gte("date", start).lte("date", end),
      )
      .take(7);
  },
});
export const save = mutation({
  args: {
    date: v.string(),
    values: v.object({
      alcohol: v.optional(v.number()),
      caffeine: v.optional(v.number()),
      mood: v.optional(v.number()),
      lowCarb: v.optional(v.union(v.boolean(), v.null())),
      addedSugar: v.optional(v.union(v.boolean(), v.null())),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { date, values }) => {
    const user = await getAuthUser(ctx);
    checkDate(date);
    for (const key of ["alcohol", "caffeine", "mood"] as const) {
      const value = values[key];
      if (
        value !== undefined &&
        (!Number.isFinite(value) ||
          value < 0 ||
          value > { alcohol: 100, caffeine: 5000, mood: 5 }[key])
      )
        throw new Error("Value is out of range");
    }
    if (
      values.mood !== undefined &&
      (!Number.isInteger(values.mood) || values.mood < 1)
    )
      throw new Error("Choose a mood from 1 to 5");
    if ((values.notes?.length ?? 0) > 4000)
      throw new Error("Keep notes under 4,000 characters");
    const entry = await ctx.db
      .query("journalEntries")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", user._id).eq("date", date),
      )
      .unique();
    if (entry)
      await ctx.db.patch("journalEntries", entry._id, {
        ...values,
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("journalEntries", {
        userId: user._id,
        date,
        ...values,
        updatedAt: Date.now(),
      });
  },
});

/** Journal uses calendar dates, including backfilled readings from older days. */
export const trackers = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const user = await getAuthUser(ctx);
    checkDate(date);
    const start = new Date(`${date}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 6);
    const startKey = start.toISOString().slice(0, 10);
    const metrics = await ctx.db
      .query("customProgressMetrics")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(
      metrics.map(async (metric) => ({
        ...metric,
        entries: await ctx.db
          .query("customProgressMetricEntries")
          .withIndex("by_userId_and_metricId_and_date", (q) =>
            q
              .eq("userId", user._id)
              .eq("metricId", metric._id)
              .gte("date", startKey)
              .lte("date", date),
          )
          .take(7),
      })),
    );
  },
});

export const incrementTracker = mutation({
  args: { metricId: v.id("customProgressMetrics"), date: v.string() },
  handler: async (ctx, { metricId, date }) => {
    const user = await getAuthUser(ctx);
    checkDate(date);
    const metric = await ctx.db.get("customProgressMetrics", metricId);
    if (!metric || metric.userId !== user._id)
      throw new Error("Tracker not found");
    if (metric.kind !== "counter")
      throw new Error("Only daily totals support quick add");
    const entry = await ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId_and_date", (q) =>
        q.eq("userId", user._id).eq("metricId", metricId).eq("date", date),
      )
      .unique();
    const value = Math.min(
      1000000,
      Math.round(((entry?.value ?? 0) + metric.step) * 100000) / 100000,
    );
    if (entry)
      await ctx.db.patch("customProgressMetricEntries", entry._id, {
        value,
        manual: true,
        updatedAt: Date.now(),
      });
    else
      await ctx.db.insert("customProgressMetricEntries", {
        userId: user._id,
        metricId,
        date,
        value,
        manual: true,
        updatedAt: Date.now(),
      });
  },
});
