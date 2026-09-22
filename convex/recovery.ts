import { zonedNow } from "../packages/models/src/moments";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getAuthUser, safeGetAuthUser } from "./lib/auth";
import { activeRecovery, validRecoveryDate } from "./lib/illnessRecovery";

export const recoveryPhase = v.union(
  v.literal("resting"),
  v.literal("easing_back"),
);
export const recoveryOptions = {
  deferTraining: v.boolean(),
  quietTraining: v.boolean(),
  simpleFood: v.boolean(),
  checkInFrequency: v.union(
    v.literal("daily"),
    v.literal("every_other_day"),
    v.literal("off"),
  ),
};
const details = {
  symptoms: v.string(),
  energy: v.union(v.literal("low"), v.literal("okay"), v.literal("good")),
  manageable: v.string(),
};
async function validateDate(ctx: MutationCtx, userId: string, date: string) {
  if (!validRecoveryDate(date)) throw new Error("Choose a valid date.");
  const preferences = await ctx.db
    .query("userPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const today = zonedNow(preferences?.lastActiveTimezone ?? "UTC").todayKey;
  if (date > today) throw new Error("The date cannot be in the future.");
  return today;
}
function cleanDetails(value: {
  symptoms: string;
  energy: "low" | "okay" | "good";
  manageable: string;
}) {
  if (value.symptoms.length > 600 || value.manageable.length > 600)
    throw new Error("Please keep each note under 600 characters.");
  return {
    symptoms: value.symptoms.trim(),
    energy: value.energy,
    manageable: value.manageable.trim(),
  };
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return { active: null, episodes: [], checkIns: [] };
    const [active, episodes] = await Promise.all([
      activeRecovery(ctx, user._id),
      ctx.db
        .query("recoveryEpisodes")
        .withIndex("by_userId_and_startedOn", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(90),
    ]);
    const checkIns = active
      ? await ctx.db
          .query("recoveryCheckIns")
          .withIndex("by_episodeId_and_date", (q) =>
            q.eq("episodeId", active._id),
          )
          .order("desc")
          .take(30)
      : [];
    return { active, episodes, checkIns };
  },
});

export const start = mutation({
  args: { startedOn: v.string(), ...details, ...recoveryOptions },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const today = await validateDate(ctx, user._id, args.startedOn);
    if (Date.parse(args.startedOn) < Date.parse(today) - 30 * 86400000)
      throw new Error("Choose a start date within the last 30 days.");
    if (await activeRecovery(ctx, user._id))
      throw new Error("Recovery mode is already active.");
    const previous = await ctx.db
      .query("recoveryEpisodes")
      .withIndex("by_userId_and_startedOn", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (previous?.endedOn && args.startedOn < previous.endedOn)
      throw new Error("Choose a date after your previous recovery period.");
    return ctx.db.insert("recoveryEpisodes", {
      userId: user._id,
      ...args,
      ...cleanDetails(args),
      active: true,
      phase: "resting",
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    episodeId: v.id("recoveryEpisodes"),
    phase: recoveryPhase,
    ...recoveryOptions,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const episode = await activeRecovery(ctx, user._id);
    if (!episode || episode._id !== args.episodeId)
      throw new Error(
        "This recovery period is no longer active. Refresh your plan.",
      );
    const { episodeId: _episodeId, ...changes } = args;
    await ctx.db.patch(episode._id, { ...changes, updatedAt: Date.now() });
  },
});

export const checkIn = mutation({
  args: {
    episodeId: v.id("recoveryEpisodes"),
    date: v.string(),
    trend: v.union(v.literal("better"), v.literal("same"), v.literal("worse")),
    ...details,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    await validateDate(ctx, user._id, args.date);
    const episode = await activeRecovery(ctx, user._id);
    if (
      !episode ||
      episode._id !== args.episodeId ||
      args.date < episode.startedOn
    )
      throw new Error("No recovery period for this date.");
    const cleaned = cleanDetails(args);
    const existing = await ctx.db
      .query("recoveryCheckIns")
      .withIndex("by_episodeId_and_date", (q) =>
        q.eq("episodeId", episode._id).eq("date", args.date),
      )
      .unique();
    const { episodeId: _episodeId, ...values } = args;
    const body = { ...values, ...cleaned, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, body);
    else
      await ctx.db.insert("recoveryCheckIns", {
        userId: user._id,
        episodeId: episode._id,
        ...body,
      });
    if (!episode.lastCheckInOn || args.date >= episode.lastCheckInOn)
      await ctx.db.patch(episode._id, {
        ...cleaned,
        lastCheckInOn: args.date,
        lastTrend: args.trend,
        updatedAt: Date.now(),
      });
  },
});

export const finish = mutation({
  args: { episodeId: v.id("recoveryEpisodes"), endedOn: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    await validateDate(ctx, user._id, args.endedOn);
    const episode = await activeRecovery(ctx, user._id);
    if (!episode || episode._id !== args.episodeId)
      throw new Error(
        "This recovery period is no longer active. Refresh your plan.",
      );
    if (args.endedOn < episode.startedOn)
      throw new Error("End date must follow the start date.");
    if (episode.lastCheckInOn && args.endedOn < episode.lastCheckInOn)
      throw new Error("End date cannot precede your latest check-in.");
    await ctx.db.patch(episode._id, {
      active: false,
      endedOn: args.endedOn,
      updatedAt: Date.now(),
    });
  },
});
