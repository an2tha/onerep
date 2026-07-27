import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { safeGetAuthUser, getAuthUser } from "./lib/auth";

const tabValidator = v.union(
  v.literal("body"),
  v.literal("nutrition"),
  v.literal("training"),
);
const kindValidator = v.union(
  v.literal("counter"),
  v.literal("number"),
  v.literal("toggle"),
);
const accentValidator = v.union(
  v.literal("food"),
  v.literal("water"),
  v.literal("workout"),
  v.literal("progress"),
);

export const list = query({
  args: { tab: v.optional(tabValidator), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const metrics = await ctx.db
      .query("customProgressMetrics")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(24);
    const visible = args.tab
      ? metrics.filter((metric) => metric.tab === args.tab)
      : metrics;
    const days = Math.max(7, Math.min(args.days ?? 30, 90));
    return await Promise.all(
      visible.map(async (metric) => ({
        ...metric,
        entries: await ctx.db
          .query("customProgressMetricEntries")
          .withIndex("by_userId_and_metricId", (q) =>
            q.eq("userId", user._id).eq("metricId", metric._id),
          )
          .order("desc")
          .take(days),
      })),
    );
  },
});

export const saveDefinition = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    tab: tabValidator,
    kind: kindValidator,
    unit: v.string(),
    step: v.number(),
    target: v.optional(v.number()),
    accent: accentValidator,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("customProgressMetrics", {
      userId: user._id,
      title: args.title.trim().slice(0, 48),
      description: args.description.trim().slice(0, 180),
      tab: args.tab,
      kind: args.kind,
      unit: args.unit.trim().slice(0, 16),
      step: Math.max(0.01, Math.min(args.step, 10_000)),
      ...(args.target == null
        ? {}
        : { target: Math.max(0, Math.min(args.target, 1_000_000)) }),
      accent: args.accent,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setValue = mutation({
  args: {
    metricId: v.id("customProgressMetrics"),
    date: v.string(),
    value: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const metric = await ctx.db.get(args.metricId);
    if (!metric || metric.userId !== user._id)
      throw new Error("Metric not found");
    const value = Math.max(0, Math.min(args.value, 1_000_000));
    const existing = await ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId_and_date", (q) =>
        q
          .eq("userId", user._id)
          .eq("metricId", args.metricId)
          .eq("date", args.date),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("customProgressMetricEntries", {
      userId: user._id,
      metricId: args.metricId,
      date: args.date,
      value,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { metricId: v.id("customProgressMetrics") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const metric = await ctx.db.get(args.metricId);
    if (!metric || metric.userId !== user._id)
      throw new Error("Metric not found");
    for await (const entry of ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId", (q) =>
        q.eq("userId", user._id).eq("metricId", args.metricId),
      )) {
      await ctx.db.delete(entry._id);
    }
    for await (const widget of ctx.db
      .query("dashboardWidgets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))) {
      if (widget.sourceMetricId === metric._id) await ctx.db.delete(widget._id);
    }
    await ctx.db.delete(metric._id);
    return null;
  },
});
