/**
 * The two nudges, evaluated server-side so they can reach a phone that never
 * opened the app.
 *
 * The triggers themselves are the same pure functions the client uses, imported
 * from `@repo/models/moments`. That sharing is the whole point: a nudge that
 * fires from a cron and a moment that fires on open must agree about whether
 * this person deserves interrupting, and the client's version already encodes
 * the humility — habit thresholds, grace periods, rest days that do not count
 * as a lapse. Reimplementing that here would mean maintaining two consciences.
 *
 * Copy is templated and deterministic. There is no model call to tell someone
 * they have not logged dinner.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import {
  missedLogTrigger,
  MOMENT_IDS,
  trainingLapseTrigger,
  weekStartOf,
  zonedNow,
  dateToIso,
  localNoon,
  subtractDays,
  type MomentFoodLog,
  type MomentWorkoutLog,
} from "../../packages/models/src/moments";
import {
  canSendCoachTouch,
  COACH_TOUCH_WINDOW_MS,
  isCappedKind,
  mergeOutreachSettings,
} from "../lib/outreach";
import { proactiveCoachEnabled } from "./weeklyReview";

const SELECT_PAGE_SIZE = 200;
const MAX_PER_SWEEP = 500;
/** Enough history for the habit window and the lapse lookback both. */
const FOOD_HISTORY_DAYS = 21;
const REST_HISTORY_DAYS = 90;

/**
 * Nudges are evaluated in a narrow band of the user's evening.
 *
 * The triggers already clamp their own timing, but an hourly cron that asks
 * every hour would re-ask a question the cap silently swallowed and burn the
 * user's weekly allowance on retries. Once a day, in the window where the
 * answer can be yes, is enough.
 */
const NUDGE_WINDOW_START = 11 * 60;
const NUDGE_WINDOW_END = 22 * 60 + 30;

export const selectCandidates = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("userPreferences").paginate({
      cursor: args.cursor,
      numItems: args.limit ?? SELECT_PAGE_SIZE,
    });

    const candidates: Array<{
      userId: string;
      today: string;
      nowMinutes: number;
      timezone: string;
    }> = [];
    for (const preferences of page.page) {
      const timezone = preferences.lastActiveTimezone;
      const { todayKey, nowMinutes } = zonedNow(timezone);
      if (nowMinutes < NUDGE_WINDOW_START || nowMinutes > NUDGE_WINDOW_END) {
        continue;
      }

      // The cheap gates, applied here where the row is already in hand. The
      // trigger-data load downstream is the expensive part of the whole sweep,
      // and paying it for a user whose settings forbid the send — or who was
      // already nudged today — is the read amplification this filter removes.
      const settings = mergeOutreachSettings(preferences.coachOutreach);
      const gate = canSendCoachTouch({
        kind: "missed_log",
        settings,
        nowMinutes,
        recentTouchCount: 0,
      });
      if (!gate.allowed) continue;

      const [sentToday, recentLapse, recentCapped] = await Promise.all([
        ctx.db
          .query("coachTouches")
          .withIndex("by_userId_and_kind_and_dedupeKey", (q) =>
            q
              .eq("userId", preferences.userId)
              .eq("kind", "missed_log")
              .eq("dedupeKey", todayKey),
          )
          .first(),
        // A lapse key re-arms weekly, so any lapse touch inside the window
        // means the current key was already sent.
        ctx.db
          .query("coachTouches")
          .withIndex("by_userId_and_sentAt", (q) =>
            q
              .eq("userId", preferences.userId)
              .gte("sentAt", Date.now() - 7 * 86_400_000),
          )
          .collect(),
        ctx.db
          .query("coachTouches")
          .withIndex("by_userId_and_sentAt", (q) =>
            q
              .eq("userId", preferences.userId)
              .gte("sentAt", Date.now() - COACH_TOUCH_WINDOW_MS),
          )
          .collect(),
      ]);

      const lapseSent = recentLapse.some(
        (touch) => touch.kind === "training_lapse",
      );
      if (sentToday && lapseSent) continue;

      const cappedCount = recentCapped.filter((touch) =>
        isCappedKind(touch.kind),
      ).length;
      if (
        !canSendCoachTouch({
          kind: "missed_log",
          settings,
          nowMinutes,
          recentTouchCount: cappedCount,
        }).allowed
      ) {
        continue;
      }

      candidates.push({
        userId: preferences.userId,
        today: todayKey,
        nowMinutes,
        timezone,
      });
    }

    return { candidates, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/** The history both triggers need, and nothing else. */
export const loadTriggerData = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const foodCutoff = dateToIso(
      subtractDays(localNoon(new Date(`${args.today}T12:00:00`)), FOOD_HISTORY_DAYS),
    );
    const restCutoff = dateToIso(
      subtractDays(localNoon(new Date(`${args.today}T12:00:00`)), REST_HISTORY_DAYS),
    );

    const [foodLogs, workoutLogs, restDays, moments, weeklyPlan] = await Promise.all([
      ctx.db
        .query("foodLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", args.userId).gte("date", foodCutoff),
        )
        .collect(),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_userId_date", (q) =>
          q.eq("userId", args.userId).gte("date", restCutoff),
        )
        .collect(),
      ctx.db
        .query("restDays")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", args.userId).gte("date", restCutoff),
        )
        .collect(),
      ctx.db
        .query("momentEvents")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("coachWeeklyPlans")
        .withIndex("by_userId_and_weekStart", (q) =>
          q.eq("userId", args.userId).eq("weekStart", weekStartOf(args.today)),
        )
        .unique(),
    ]);

    // A declared deload week suspends the lapse nudge outright. The trigger
    // already discounts explicit rest days, but a plan titled "Deload" is the
    // user announcing the whole week is deliberate — and asking someone
    // mid-deload why they have not trained is how an app teaches them to
    // ignore every question it asks.
    const deloadWeek =
      weeklyPlan?.status === "active" &&
      /\bdeload\b|\brecovery week\b|\blight week\b/i.test(
        weeklyPlan.title ?? "",
      );

    return {
      foodLogs: foodLogs.map((log) => ({
        date: log.date,
        entries: (Array.isArray(log.entries) ? log.entries : []).map(
          (entry) => ({
            loggedAt: (entry as { loggedAt?: string })?.loggedAt,
          }),
        ),
      })) as MomentFoodLog[],
      workoutLogs: workoutLogs.map((log) => ({
        date: log.date,
      })) as MomentWorkoutLog[],
      restDates: restDays.map((row) => row.date),
      deloadWeek,
      // The client writes these when it shows a moment. Honouring them here is
      // what stops a user being told twice — once by a notification and once by
      // the full-screen card they already dismissed this morning.
      seenMoments: moments.map((row) => ({
        eventId: row.eventId,
        key: row.key,
      })),
    };
  },
});

export const sweep = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!proactiveCoachEnabled()) return { sent: 0, skipped: "disabled" };

    let cursor: string | null = null;
    // Only expensive trigger-data loads spend the sweep budget. Counting every
    // candidate meant the cursor never reached the later pages: with more than
    // a sweep's worth of users in the evening window, the same first five
    // hundred were considered every hour and everyone after them never was.
    let loaded = 0;
    let sent = 0;

    for (;;) {
      const batch: {
        candidates: Array<{
          userId: string;
          today: string;
          nowMinutes: number;
          timezone: string;
        }>;
        cursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.ai.nudges.selectCandidates, { cursor });

      for (const candidate of batch.candidates) {
        if (loaded >= MAX_PER_SWEEP) break;
        loaded += 1;

        const data = await ctx.runQuery(internal.ai.nudges.loadTriggerData, {
          userId: candidate.userId,
          today: candidate.today,
        });

        const seen = (eventId: string, key: string) =>
          data.seenMoments.some(
            (row: { eventId: string; key: string }) =>
              row.eventId === eventId && row.key === key,
          );

        // Training lapse first: a four-day absence is the more meaningful of
        // the two, and only one message goes out per user per sweep.
        const lapse = data.deloadWeek
          ? null
          : trainingLapseTrigger({
              workoutLogs: data.workoutLogs,
              todayKey: candidate.today,
              restDates: data.restDates,
            });
        if (lapse && !seen(MOMENT_IDS.trainingLapse, lapse.key)) {
          const outcome = await ctx.runAction(internal.push.send.sendCoachTouch, {
            userId: candidate.userId,
            kind: "training_lapse",
            dedupeKey: lapse.key,
            title: "Still here",
            body: `${lapse.idleDays} days since your last session. Not a crisis. Worth a short one today.`,
            link: "onerep://workouts",
          });
          if (outcome.sent) sent += 1;
          continue;
        }

        const missed = missedLogTrigger({
          foodLogs: data.foodLogs,
          todayKey: candidate.today,
          nowMinutes: candidate.nowMinutes,
          timeZone: candidate.timezone,
        });
        if (missed && !seen(MOMENT_IDS.missedLog, missed.key)) {
          const outcome = await ctx.runAction(internal.push.send.sendCoachTouch, {
            userId: candidate.userId,
            kind: "missed_log",
            dedupeKey: missed.key,
            title: "Nothing logged today",
            body: "You are usually done by now. Two minutes closes the day out.",
            link: "onerep://log",
          });
          if (outcome.sent) sent += 1;
        }
      }

      if (batch.isDone || loaded >= MAX_PER_SWEEP) break;
      cursor = batch.cursor;
    }

    return { sent, loaded };
  },
});
