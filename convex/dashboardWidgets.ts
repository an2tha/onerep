import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";

const kindValidator = v.union(
  v.literal("stat"),
  v.literal("counter"),
  v.literal("progress"),
  v.literal("sparkline"),
  v.literal("decay"),
);

const accentValidator = v.union(
  v.literal("food"),
  v.literal("water"),
  v.literal("workout"),
  v.literal("progress"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const widgets = [];
    for await (const widget of ctx.db
      .query("dashboardWidgets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")) {
      const metric = await ctx.db.get(widget.sourceMetricId);
      if (metric && metric.userId === user._id) {
        widgets.push({ ...widget, sourceMetricTitle: metric.title });
      }
      if (widgets.length >= 24) break;
    }
    return widgets;
  },
});

export const listPinnedWithData = query({
  args: { beforeOrOn: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const widgets = [];
    for await (const widget of ctx.db
      .query("dashboardWidgets")
      .withIndex("by_userId_and_pinned", (q) =>
        q.eq("userId", user._id).eq("pinned", true),
      )
      .order("desc")) {
      const metric = await ctx.db.get(widget.sourceMetricId);
      if (!metric || metric.userId !== user._id) continue;
      const entries = [];
      const limit = Math.max(2, Math.min(widget.windowDays ?? 7, 30));
      for await (const entry of ctx.db
        .query("customProgressMetricEntries")
        .withIndex("by_userId_and_metricId_and_date", (q) =>
          q.eq("userId", user._id).eq("metricId", metric._id),
        )
        .order("desc")) {
        if (entry.date <= args.beforeOrOn) entries.push(entry);
        if (entries.length >= limit) break;
      }
      widgets.push({
        ...widget,
        sourceMetricTitle: metric.title,
        metricKind: metric.kind,
        metricStep: metric.step,
        entries,
      });
      if (widgets.length >= 12) break;
    }
    return widgets;
  },
});

export const saveFromCoach = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    kind: kindValidator,
    sourceMetricId: v.optional(v.id("customProgressMetrics")),
    sourceMetricTitle: v.optional(v.string()),
    unit: v.string(),
    accent: accentValidator,
    target: v.optional(v.number()),
    windowDays: v.optional(v.number()),
    halfLifeHours: v.optional(v.number()),
    parentWidgetId: v.optional(v.id("dashboardWidgets")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    let metric = args.sourceMetricId
      ? await ctx.db.get(args.sourceMetricId)
      : null;
    if (metric && metric.userId !== user._id) metric = null;
    if (!metric && args.sourceMetricTitle) {
      const requested = args.sourceMetricTitle.trim().toLocaleLowerCase();
      for await (const candidate of ctx.db
        .query("customProgressMetrics")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))) {
        if (candidate.title.trim().toLocaleLowerCase() === requested) {
          metric = candidate;
          break;
        }
      }
    }
    if (!metric) throw new Error("Widget source metric not found");

    let parentWidgetId = args.parentWidgetId;
    if (parentWidgetId) {
      const parent = await ctx.db.get(parentWidgetId);
      if (!parent || parent.userId !== user._id) parentWidgetId = undefined;
    }

    const now = Date.now();
    const widgetId = await ctx.db.insert("dashboardWidgets", {
      userId: user._id,
      title: args.title.trim().slice(0, 48),
      description: args.description.trim().slice(0, 140),
      kind: args.kind,
      sourceMetricId: metric._id,
      unit: args.unit.trim().slice(0, 16) || metric.unit,
      accent: args.accent,
      ...(args.target == null
        ? {}
        : { target: Math.max(0, Math.min(args.target, 1_000_000)) }),
      ...(args.windowDays == null
        ? {}
        : {
            windowDays: Math.round(Math.max(2, Math.min(args.windowDays, 30))),
          }),
      ...(args.halfLifeHours == null
        ? {}
        : { halfLifeHours: Math.max(1, Math.min(args.halfLifeHours, 12)) }),
      ...(parentWidgetId ? { parentWidgetId } : {}),
      pinned: false,
      createdBy: "coach",
      createdAt: now,
      updatedAt: now,
    });
    return { widgetId, sourceMetricTitle: metric.title };
  },
});

export const setPinned = mutation({
  args: { widgetId: v.id("dashboardWidgets"), pinned: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || widget.userId !== user._id)
      throw new Error("Widget not found");
    await ctx.db.patch(widget._id, {
      pinned: args.pinned,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { widgetId: v.id("dashboardWidgets") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || widget.userId !== user._id)
      throw new Error("Widget not found");
    for await (const candidate of ctx.db
      .query("dashboardWidgets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))) {
      if (candidate.parentWidgetId === widget._id) {
        await ctx.db.patch(candidate._id, { parentWidgetId: undefined });
      }
    }
    await ctx.db.delete(widget._id);
    return null;
  },
});
