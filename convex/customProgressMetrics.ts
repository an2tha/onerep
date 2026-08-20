import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { safeGetAuthUser, getAuthUser } from "./lib/auth";
import { listCustomMetricsWithEntries } from "./lib/customProgressMetrics";
import { platformMetric } from "./lib/platformHealthMetrics";

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

export type CustomMetricDefinitionInput = {
  title: string;
  description: string;
  tab: "body" | "nutrition" | "training";
  kind: "counter" | "number" | "toggle";
  unit: string;
  step: number;
  target?: number;
  accent: "food" | "water" | "workout" | "progress";
  healthMetricKey?: string;
};

/**
 * The clamping every writer of a definition has to agree on.
 *
 * Lifted out of `saveDefinition` when the API and MCP surfaces started writing
 * definitions too: two copies of "48 characters, step at least 0.01" is two
 * places for the numbers to drift, and the drift only shows up as a metric
 * that renders differently depending on which door it came through.
 */
export function sanitizeCustomMetricDefinition(
  input: CustomMetricDefinitionInput,
) {
  return {
    title: input.title.trim().slice(0, 48),
    description: input.description.trim().slice(0, 180),
    tab: input.tab,
    kind: input.kind,
    unit: input.unit.trim().slice(0, 16),
    step: Math.max(0.01, Math.min(input.step, 10_000)),
    ...(input.target == null
      ? {}
      : { target: Math.max(0, Math.min(input.target, 1_000_000)) }),
    accent: input.accent,
    // Rejected rather than stored loosely: a key the catalogue does not know
    // would leave a metric permanently waiting for a reading that no sync is
    // ever going to send.
    ...(input.healthMetricKey && platformMetric(input.healthMetricKey)
      ? { healthMetricKey: input.healthMetricKey }
      : {}),
  };
}

/** The ceiling `setValue` and the API both hold entries to. */
export function clampCustomMetricValue(value: number) {
  return Math.max(0, Math.min(value, 1_000_000));
}

export const list = query({
  args: { tab: v.optional(tabValidator), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];
    const days = Math.max(7, Math.min(args.days ?? 30, 90));
    const metrics = await listCustomMetricsWithEntries(ctx, user._id, days);
    return args.tab
      ? metrics.filter((metric) => metric.tab === args.tab)
      : metrics;
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
    /** A `platformHealthMetrics` key, to have the health sync fill this in. */
    healthMetricKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("customProgressMetrics", {
      userId: user._id,
      ...sanitizeCustomMetricDefinition(args),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Edits a definition in place.
 *
 * Renaming a metric or moving its target used to mean deleting it and starting
 * again, which took every entry with it — the history was the thing people
 * wanted to keep. Only the fields you pass move. `target` and
 * `healthMetricKey` accept null to clear them, because "no target" is a
 * different instruction from "leave the target alone" and one boolean per
 * field would be worse.
 */
export const updateDefinition = mutation({
  args: {
    metricId: v.id("customProgressMetrics"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tab: v.optional(tabValidator),
    kind: v.optional(kindValidator),
    unit: v.optional(v.string()),
    step: v.optional(v.number()),
    target: v.optional(v.union(v.number(), v.null())),
    accent: v.optional(accentValidator),
    healthMetricKey: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const metric = await ctx.db.get(args.metricId);
    if (!metric || metric.userId !== user._id)
      throw new Error("Metric not found");

    // The sanitizer takes a whole definition, so merge onto the stored one
    // first; that also keeps a partial edit from resurrecting a cleared field.
    const merged = sanitizeCustomMetricDefinition({
      title: args.title ?? metric.title,
      description: args.description ?? metric.description,
      tab: args.tab ?? metric.tab,
      kind: args.kind ?? metric.kind,
      unit: args.unit ?? metric.unit,
      step: args.step ?? metric.step,
      target:
        args.target === undefined ? metric.target : (args.target ?? undefined),
      accent: args.accent ?? metric.accent,
      healthMetricKey:
        args.healthMetricKey === undefined
          ? metric.healthMetricKey
          : (args.healthMetricKey ?? undefined),
    });
    if (
      args.healthMetricKey != null &&
      merged.healthMetricKey !== args.healthMetricKey
    ) {
      throw new Error(`Unknown health metric key: ${args.healthMetricKey}`);
    }

    await ctx.db.patch(args.metricId, {
      ...merged,
      // patch ignores an absent key, so clearing has to be spelled out.
      target: merged.target ?? undefined,
      healthMetricKey: merged.healthMetricKey ?? undefined,
      updatedAt: Date.now(),
    });
    return args.metricId;
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
    const value = clampCustomMetricValue(args.value);
    const existing = await ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId_and_date", (q) =>
        q
          .eq("userId", user._id)
          .eq("metricId", args.metricId)
          .eq("date", args.date),
      )
      .unique();
    // Anything arriving through this mutation was typed by a person, so it is
    // marked manual and the sync will stop overwriting that day.
    if (existing) {
      await ctx.db.patch(existing._id, {
        value,
        manual: true,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("customProgressMetricEntries", {
      userId: user._id,
      metricId: args.metricId,
      date: args.date,
      value,
      manual: true,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Removes a logged value for one day.
 *
 * Separate from `setValue` rather than a nullable argument on it, because the
 * app's inputs cannot express "no value" — an emptied box is indistinguishable
 * from a box someone is halfway through typing in, and treating it as a delete
 * loses a reading to a stray backspace.
 *
 * Deleting the row takes the `manual` flag with it, so a bound metric refills
 * from the health store on the next sync. That is the point: it is how you undo
 * a fat-fingered figure that would otherwise sit in your baseline forever.
 */
export const clearValue = mutation({
  args: {
    metricId: v.id("customProgressMetrics"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const metric = await ctx.db.get(args.metricId);
    if (!metric || metric.userId !== user._id)
      throw new Error("Metric not found");

    const existing = await ctx.db
      .query("customProgressMetricEntries")
      .withIndex("by_userId_and_metricId_and_date", (q) =>
        q
          .eq("userId", user._id)
          .eq("metricId", args.metricId)
          .eq("date", args.date),
      )
      .unique();

    // Clearing an empty day is what happens when someone opens the sheet and
    // saves without touching a row, so it is a no-op rather than an error.
    if (!existing) return { cleared: false };
    await ctx.db.delete(existing._id);
    return { cleared: true };
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
