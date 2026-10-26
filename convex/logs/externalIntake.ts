/**
 * Nutrition and water other apps filed into the phone's health store.
 *
 * Kept in its own table rather than merged into `foodLogs` on purpose. The
 * diary is what the person wrote in this app: scored against a target, editable
 * one entry at a time, and the thing every screen already agrees about. These
 * numbers were written somewhere else and are read-only here. Merging them would
 * invent meals nobody can edit or delete, and would double every day somebody
 * logs the same lunch in two apps.
 *
 * One document per local day, upserted, newest read wins — the same model as
 * `healthMetrics`: the store is the source of truth and this is a cache of it.
 * A day with nothing plausible in it is not stored at all, so the screen can
 * treat "no row" as "nobody else logged anything" without a flag.
 */

import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { getAuthUser, safeGetAuthUser } from "../lib/auth"
import { sanePlatformReading } from "../lib/platformHealthMetrics"

/** One sync never carries more than a month and a half; more is a bug. */
const MAX_DAYS_PER_SYNC = 45

/**
 * How many package names a day keeps.
 *
 * The screen names them under the figure, and "logged in MyFitnessPal,
 * Cronometer, Samsung Health, …" stops being readable long before this cap. The
 * list is a provenance note, not a data set.
 */
const MAX_SOURCES = 12

const externalNutritionDayValidator = v.object({
  date: v.string(),
  nutrients: v.record(v.string(), v.number()),
  sources: v.array(v.string()),
})

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export const sync = mutation({
  args: {
    provider: v.union(v.literal("apple_health"), v.literal("health_connect")),
    days: v.array(externalNutritionDayValidator),
    /**
     * Oldest day this read covered, when the phone could read the window at
     * all. Rows inside the window that the phone did not report are deleted:
     * an entry somebody removed in MyFitnessPal has to disappear here too, or
     * the card keeps claiming food that no longer exists.
     *
     * Absent means "the phone could not read", which is deliberately not the
     * same as "the phone read nothing" — a shell without the native method
     * must not be allowed to wipe the history it is unable to see.
     */
    windowStart: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    const now = Date.now()
    let written = 0

    const days = args.days
      .filter((day) => isDateKey(day.date))
      .slice(0, MAX_DAYS_PER_SYNC)
    /**
     * Only a day this sync stored keeps its row.
     *
     * A day that arrives emptied is precisely the one whose stored row has to
     * go — that is a meal somebody deleted in the other app. Counting it as
     * "seen" because it was submitted left the row in place for ever, which is
     * the opposite of what the prune below is for.
     */
    const seen = new Set<string>()

    for (const day of days) {
      const nutrients: Record<string, number> = {}
      for (const [key, value] of Object.entries(day.nutrients)) {
        // The catalogue's bounds, not ours: a third-party app can write a
        // 40,000 kcal "meal", and a figure no sensor could have produced is
        // dropped rather than shown as if it were food.
        const sane = sanePlatformReading(key, value)
        if (sane !== undefined) nutrients[key] = sane
      }
      // A record that carries every field as zero is an app saying "nothing
      // here", not a meal worth a card.
      if (!Object.values(nutrients).some((value) => value > 0)) continue

      const sources = [
        ...new Set(
          day.sources.filter(
            (source) => typeof source === "string" && source.trim().length > 0
          )
        ),
      ]
        .sort()
        .slice(0, MAX_SOURCES)

      const existing = await ctx.db
        .query("externalNutrition")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).eq("date", day.date)
        )
        .unique()

      if (existing) {
        await ctx.db.patch(existing._id, {
          provider: args.provider,
          nutrients,
          sources,
          syncedAt: now,
          updatedAt: now,
        })
      } else {
        await ctx.db.insert("externalNutrition", {
          userId: user._id,
          date: day.date,
          provider: args.provider,
          nutrients,
          sources,
          syncedAt: now,
          updatedAt: now,
        })
      }
      written += 1
      seen.add(day.date)
    }

    let removed = 0
    if (args.windowStart && isDateKey(args.windowStart)) {
      const stale = await ctx.db
        .query("externalNutrition")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", user._id).gte("date", args.windowStart as string)
        )
        .collect()
      for (const row of stale) {
        if (seen.has(row.date)) continue
        await ctx.db.delete(row._id)
        removed += 1
      }
    }

    return { written, removed }
  },
})

/**
 * A day's inbound figures, or `null` when no other app logged anything.
 *
 * `nutrients` is keyed by `platformHealthMetrics`, which is where the labels and
 * units for these keys already live — the screen holds no copy of its own.
 */
export const forDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx)
    if (!user) return null
    if (!isDateKey(args.date)) return null

    const doc = await ctx.db
      .query("externalNutrition")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique()

    if (!doc) return null
    return {
      date: doc.date,
      nutrients: doc.nutrients,
      sources: doc.sources,
      syncedAt: doc.syncedAt,
    }
  },
})
