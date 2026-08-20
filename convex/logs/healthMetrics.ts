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
import type { MutationCtx } from "../_generated/server";
import {
  HEALTH_DIALS,
  HEALTH_METRICS,
  saneHealthMetric,
} from "../lib/healthMetricCatalog";
import { sanePlatformReading } from "../lib/platformHealthMetrics";
import { getAuthUser, safeGetAuthUser } from "../lib/auth";
import { RECOVERY_WINDOW_DAYS, summarizeRecovery } from "../lib/recovery";
import {
  exerciseMinutesByDate,
  listRecoveryWindow,
} from "../lib/healthMetrics";
import {
  HEALTH_SCORE_WINDOW_DAYS,
  computeHealthScore,
} from "../lib/healthScore";
import { buildCustomMetricDials } from "../lib/customProgressMetrics";
import {
  RANGE_DAYS,
  buildHealthSeries,
  shiftDate,
  type HealthRange,
} from "../lib/healthSeries";

/** One sync should never carry more than a month; anything more is a bug. */
const MAX_DAYS_PER_SYNC = 45;

const dailyMetricValidator = v.object({
  date: v.string(),
  sleepMinutes: v.optional(v.number()),
  steps: v.optional(v.number()),
  restingHeartRateBpm: v.optional(v.number()),
  hrvMs: v.optional(v.number()),
  activeEnergyKcal: v.optional(v.number()),
  // Body readings ride the same daily payload but land on a check-in rather
  // than the recovery row — see `upsertBodyReading`.
  weightKg: v.optional(v.number()),
  bodyFatPct: v.optional(v.number()),
  leanBodyMassKg: v.optional(v.number()),
  boneMassKg: v.optional(v.number()),
  basalMetabolicRateKcal: v.optional(v.number()),
  /**
   * Everything else the phone gave us, keyed by `platformHealthMetrics`.
   *
   * A bag rather than named fields because the catalogue has ~45 entries and
   * grows: naming each one here would mean a schema change every time someone
   * wants to track a signal the app has no opinion about. Only keys a custom
   * metric is actually bound to are read out of it.
   */
  readings: v.optional(v.record(v.string(), v.number())),
});

const BODY_METRIC_KEYS = [
  "weightKg",
  "bodyFatPct",
  "leanBodyMassKg",
  "boneMassKg",
  "basalMetabolicRateKcal",
] as const;

type BodyReading = Partial<Record<(typeof BODY_METRIC_KEYS)[number], number>>;

/**
 * Files a scale reading as a check-in for that day.
 *
 * Two rules, both about not losing what someone typed. A row this sync did not
 * create is left alone entirely — a number a person entered outranks whatever
 * the scale said afterwards. And only fields the reading actually carries are
 * written, so a scale that reports weight but not body fat cannot blank a body
 * fat percentage recorded by hand on the same day.
 */
async function upsertBodyReading(
  ctx: MutationCtx,
  userId: string,
  date: string,
  reading: BodyReading,
  now: number,
) {
  const fields = Object.fromEntries(
    Object.entries(reading).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(fields).length === 0) return false;

  const existing = await ctx.db
    .query("bodyMeasurements")
    .withIndex("by_userId_and_loggedAt", (q) =>
      q.eq("userId", userId).eq("loggedAt", date),
    )
    .first();

  if (existing) {
    if (existing.source !== "health") return false;
    await ctx.db.patch(existing._id, { ...fields, updatedAt: now });
    return true;
  }

  await ctx.db.insert("bodyMeasurements", {
    userId,
    clientId: `health-${date}`,
    loggedAt: date,
    source: "health",
    ...fields,
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

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

/**
 * The fields on this row a person is allowed to correct by hand.
 *
 * Read off the catalogue rather than written out again, because the catalogue
 * is what the sanity bounds live on: a field that can be overridden but has no
 * range to check against would let a typo store a 90,000-minute night.
 */
const DAILY_METRIC_FIELDS = new Set(
  HEALTH_METRICS.filter((metric) => metric.target === "daily").map(
    (metric) => metric.key,
  ),
);

type ManualHealthMetricResult = {
  date: string;
  field: string;
  value: number | null;
  manualFields: string[];
  created: boolean;
  previous: Record<string, unknown> | null;
};

/**
 * Pins one field of one day to a figure the user typed, or hands it back.
 *
 * Shared with the MCP and REST surfaces rather than duplicated there, because
 * the interesting part is not the write but the override bookkeeping, and two
 * copies of that is two chances to leave a field pinned to a number nobody can
 * see any more. `null` clears: the name comes off the list and the stored
 * reading is left where it is, so the next sync overwrites it with whatever the
 * phone actually thinks. Zeroing it instead would show a day of no sleep until
 * that sync arrived, which is exactly the lie the edit was meant to correct.
 */
async function applyManualHealthMetric(
  ctx: MutationCtx,
  userId: string,
  date: string,
  field: string,
  value: number | null,
): Promise<ManualHealthMetricResult> {
  if (!isDateKey(date)) throw new Error(`Not a date: ${date}. Use YYYY-MM-DD.`);
  if (!DAILY_METRIC_FIELDS.has(field)) {
    throw new Error(
      `Not an editable daily metric: ${field}. One of ${[...DAILY_METRIC_FIELDS].join(", ")}.`,
    );
  }

  let checked: number | undefined;
  if (value !== null) {
    checked = saneHealthMetric(field, value);
    // Refused rather than clamped. A figure outside the catalogue's range is a
    // slipped decimal point or a unit mix-up, and silently storing the nearest
    // legal number would hide both behind a plausible-looking baseline.
    if (checked === undefined) {
      throw new Error(`${field} is out of range: ${value}`);
    }
  }

  const existing = await ctx.db
    .query("healthMetrics")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).eq("date", date),
    )
    .unique();

  const now = Date.now();
  const manual = new Set(existing?.manualFields ?? []);
  if (value === null) manual.delete(field);
  else manual.add(field);
  const manualFields = [...manual];

  if (existing) {
    // The whole row as it stood, because that is the only shape the coach's
    // undo handler can put back for this table — and it is the right one, since
    // it restores the previous override list along with the previous number.
    const { _id, _creationTime, ...previous } = existing;
    void _id;
    void _creationTime;
    await ctx.db.patch(existing._id, {
      ...(checked === undefined ? {} : { [field]: checked }),
      manualFields,
      updatedAt: now,
    });
    return { date, field, value, manualFields, created: false, previous };
  }

  // Clearing an override on a day that has no row is not an error and not a
  // reason to invent one — there is nothing pinned and nothing to sync over.
  if (checked === undefined) {
    return {
      date,
      field,
      value,
      manualFields: [],
      created: false,
      previous: null,
    };
  }

  await ctx.db.insert("healthMetrics", {
    userId,
    date,
    provider: "manual",
    [field]: checked,
    manualFields,
    // The day was never read off a phone, so it has no honest sync time. Now is
    // the closest true answer: it is when this row learned its only number.
    syncedAt: now,
    updatedAt: now,
  });
  return { date, field, value, manualFields, created: true, previous: null };
}

export { applyManualHealthMetric };

/**
 * Corrects one number on one day, and keeps the correction.
 *
 * The table is a cache of the platform health store, so the honest default is
 * that the phone owns every figure in it. This is the exception: a reading the
 * user says is wrong stays wrong on every foreground sync — the client re-reads
 * the same window every few minutes — until the field is marked as theirs.
 */
export const setDailyMetric = mutation({
  args: {
    date: v.string(),
    field: v.string(),
    /** `null` gives the field back to the sync. */
    value: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    const result = await applyManualHealthMetric(
      ctx,
      user._id,
      args.date,
      args.field,
      args.value,
    );
    return {
      date: result.date,
      field: result.field,
      value: result.value,
      manualFields: result.manualFields,
    };
  },
});

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
        // Fields the user corrected are dropped from the patch, one by one. The
        // rest of the day still updates: someone who fixed a bogus resting
        // heart rate on Tuesday keeps getting Tuesday's steps.
        const patch: Record<string, number | undefined> = { ...fields };
        for (const field of existing.manualFields ?? []) delete patch[field];

        await ctx.db.patch(existing._id, {
          ...patch,
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

    // A second pass rather than a branch inside the first: body readings are
    // upserted even on days that carry no recovery signal at all, which is the
    // normal shape for someone who owns a smart scale but no watch.
    let bodyWritten = 0;
    for (const day of args.days.slice(0, MAX_DAYS_PER_SYNC)) {
      if (!isDateKey(day.date)) continue;
      const reading: BodyReading = {};
      for (const key of BODY_METRIC_KEYS) {
        const value = saneHealthMetric(key, day[key]);
        if (value !== undefined) reading[key] = value;
      }
      if (await upsertBodyReading(ctx, user._id, day.date, reading, now)) {
        bodyWritten += 1;
      }
    }

    // Custom metrics bound to a platform signal. Everything the catalogue
    // knows about is fair game here — blood glucose, SpO2, respiratory rate —
    // which is what lets someone track a reading the app has no opinion about.
    const bound = (
      await ctx.db
        .query("customProgressMetrics")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect()
    ).filter((metric) => metric.healthMetricKey);

    let customWritten = 0;
    for (const metric of bound) {
      const key = metric.healthMetricKey as string;
      for (const day of args.days.slice(0, MAX_DAYS_PER_SYNC)) {
        if (!isDateKey(day.date)) continue;
        const value = sanePlatformReading(
          key,
          day.readings?.[key] ??
            ((day as Record<string, unknown>)[key] as number | undefined),
        );
        if (value === undefined) continue;

        const existing = await ctx.db
          .query("customProgressMetricEntries")
          .withIndex("by_userId_and_metricId_and_date", (q) =>
            q
              .eq("userId", user._id)
              .eq("metricId", metric._id)
              .eq("date", day.date),
          )
          .unique();

        // A figure someone typed outranks the sensor that disagrees with it.
        if (existing?.manual) continue;
        if (existing) {
          await ctx.db.patch(existing._id, { value, updatedAt: now });
        } else {
          await ctx.db.insert("customProgressMetricEntries", {
            userId: user._id,
            metricId: metric._id,
            date: day.date,
            value,
            updatedAt: now,
          });
        }
        customWritten += 1;
      }
    }

    return { written, bodyWritten, customWritten };
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

/**
 * Everything the Health page draws, in one round trip.
 *
 * Deliberately one query rather than four. The page shows a single composite
 * number built out of all of these, and four independently-arriving
 * subscriptions would let it render a score that never existed — sleep from
 * this second, exercise minutes from the last one.
 */
export const dashboard = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    if (!isDateKey(args.today)) return null;

    const window = await listRecoveryWindow(ctx, user._id, args.today);
    const recovery = summarizeRecovery(window, args.today);

    const since = shiftDate(args.today, -(HEALTH_SCORE_WINDOW_DAYS - 1));
    const scoringDays = window.filter((row) => row.date >= since);

    return {
      today: args.today,
      windowDays: HEALTH_SCORE_WINDOW_DAYS,
      recovery,
      /**
       * Custom metrics, filed under the dial their catalogue group belongs to
       * and scored against the user's own baseline or their stated target.
       *
       * Sent whole rather than as a score per dial because the page needs
       * `hasData` to decide what to draw: a dial with readings gets a ring, one
       * without belongs in Trends where an empty series is honest rather than
       * embarrassing. A `score` of null there means "no reading" and must never
       * be rendered as a zero.
       */
      customDials: await buildCustomMetricDials(ctx, user._id, args.today),
      /** Labels and routes for the dials above, so the page holds no copy. */
      dials: HEALTH_DIALS,
      /** Oldest first, for the sparklines. */
      days: scoringDays,
      ...computeHealthScore({
        days: scoringDays,
        exerciseMinutesByDate: await exerciseMinutesByDate(
          ctx,
          user._id,
          since,
          args.today,
        ),
        recovery,
      }),
    };
  },
});

/**
 * History for the trends screens.
 *
 * Reads twice the requested range plus a baseline run-up, because every figure
 * on those screens is a comparison: the range itself, the preceding period of
 * equal length to compare it against, and — for the recovery series — the 28
 * days each daily score was computed from.
 */
export const series = query({
  args: {
    today: v.string(),
    range: v.union(v.literal("W"), v.literal("M"), v.literal("Y")),
  },
  handler: async (ctx, args) => {
    const user = await safeGetAuthUser(ctx);
    if (!user) return null;
    if (!isDateKey(args.today)) return null;

    const range = args.range as HealthRange;
    const days = RANGE_DAYS[range];
    const start = shiftDate(args.today, -(days - 1));
    const earliest = shiftDate(start, -(days + RECOVERY_WINDOW_DAYS));

    const rows = await listRecoveryWindow(
      ctx,
      user._id,
      args.today,
      // listRecoveryWindow counts back from today, so the window has to span
      // the range, the comparison period, and the baseline run-up.
      days * 2 + RECOVERY_WINDOW_DAYS,
    );

    // Check-ins across the same window, newest wins on a day with more than
    // one row. Read here rather than inside the builder so the builder stays a
    // pure function over data it was handed.
    const checkIns = await ctx.db
      .query("bodyMeasurements")
      .withIndex("by_userId_and_loggedAt", (q) =>
        q.eq("userId", user._id).gte("loggedAt", earliest),
      )
      .collect();
    const bodyByDate: Record<
      string,
      { weightKg?: number; bodyFatPct?: number }
    > = {};
    for (const row of checkIns) {
      const date = row.loggedAt.slice(0, 10);
      const held = bodyByDate[date] ?? {};
      if (row.weightKg !== undefined) held.weightKg = row.weightKg;
      if (row.bodyFatPct !== undefined) held.bodyFatPct = row.bodyFatPct;
      bodyByDate[date] = held;
    }

    return buildHealthSeries({
      rows,
      bodyByDate,
      exerciseMinutesByDate: await exerciseMinutesByDate(
        ctx,
        user._id,
        earliest,
        args.today,
      ),
      today: args.today,
      range,
    });
  },
});
