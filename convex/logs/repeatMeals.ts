import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { foodLogEntryValidator } from "./foodLogs";

/**
 * Repeat meals: a named set of food entries logged automatically at a local
 * time of day. The user describes the meal once ("oats and whey, 07:00,
 * breakfast"); a cron materializes it into `foodLogs` every day it is due.
 *
 * Materialized entries carry deterministic ids (`repeat:<meal>:<date>:<n>`),
 * so a cron double-fire or an edited `lastLoggedDate` can never produce
 * duplicates — inserting the same day twice is a no-op.
 */

const MAX_REPEAT_MEALS = 12;
const MAX_ENTRIES = 20;

function assertTimeOfDay(hour: number, minute: number) {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Pick a time between 00:00 and 23:59");
  }
}

function cleanName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Give this meal a name");
  return trimmed.slice(0, 80);
}

/** Local calendar date and minutes-since-midnight in a timezone. */
export function localClock(
  timeZone: string,
  now: number,
): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(now));
  } catch {
    // An invalid stored timezone falls back to UTC rather than never logging.
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(now));
  }
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  // "24" is how some ICU versions render midnight with hour12: false.
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

// ── user-facing ───────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("repeatMeals")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_REPEAT_MEALS * 2);

    return docs
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
      .map((doc) => ({ ...doc, id: doc._id }));
  },
});

export const save = mutation({
  args: {
    name: v.string(),
    meal: v.string(),
    hour: v.number(),
    minute: v.number(),
    entries: v.array(foodLogEntryValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    assertTimeOfDay(args.hour, args.minute);
    if (args.entries.length === 0) {
      throw new Error("A repeat meal needs at least one food");
    }

    const existing = await ctx.db
      .query("repeatMeals")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_REPEAT_MEALS + 1);
    if (existing.length >= MAX_REPEAT_MEALS) {
      throw new Error(`You can keep up to ${MAX_REPEAT_MEALS} repeat meals`);
    }

    const now = Date.now();
    return await ctx.db.insert("repeatMeals", {
      userId: user._id,
      name: cleanName(args.name),
      meal: args.meal,
      hour: args.hour,
      minute: args.minute,
      enabled: true,
      entries: args.entries.slice(0, MAX_ENTRIES),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setEnabled = mutation({
  args: { id: v.id("repeatMeals"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Repeat meal not found");
    }
    await ctx.db.patch(args.id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("repeatMeals") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Repeat meal not found");
    }
    await ctx.db.delete(args.id);
  },
});

// ── the cron ──────────────────────────────────────────────────────────────────

/**
 * Materializes every due repeat meal into its owner's food log.
 *
 * Runs every 15 minutes; "due" means the owner's local clock has passed the
 * meal's time today and today has not been logged yet. `now` is injectable so
 * tests can hold the clock still.
 */
export const logDueMeals = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const due = await ctx.db
      .query("repeatMeals")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(500);

    let logged = 0;
    for (const meal of due) {
      const prefs = await ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", meal.userId))
        .unique();
      const clock = localClock(prefs?.lastActiveTimezone ?? "UTC", now);

      if (clock.minutes < meal.hour * 60 + meal.minute) continue;
      if (meal.lastLoggedDate === clock.date) continue;

      const loggedAt = new Date(now).toISOString();
      const entries = meal.entries
        .slice(0, MAX_ENTRIES)
        .map((entry: Record<string, unknown>, index: number) => ({
          ...entry,
          id: `repeat:${meal._id}:${clock.date}:${index}`,
          meal: meal.meal,
          loggedAt,
        }));

      const log = await ctx.db
        .query("foodLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", meal.userId).eq("date", clock.date),
        )
        .unique();

      if (log) {
        const present = new Set(
          log.entries.map((entry: { id?: string }) => entry?.id),
        );
        const missing = entries.filter((entry) => !present.has(entry.id));
        if (missing.length > 0) {
          await ctx.db.patch(log._id, {
            entries: [...log.entries, ...missing],
            updatedAt: now,
          });
        }
      } else {
        await ctx.db.insert("foodLogs", {
          userId: meal.userId,
          date: clock.date,
          entries,
          updatedAt: now,
        });
      }

      await ctx.db.patch(meal._id, {
        lastLoggedDate: clock.date,
        updatedAt: now,
      });
      logged += 1;
    }
    return { due: due.length, logged };
  },
});
