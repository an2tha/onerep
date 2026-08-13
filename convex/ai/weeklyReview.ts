/**
 * The Sunday review: the coach reading the week back to the user, unasked.
 *
 * This is the first thing in the product that speaks first, so it is built to
 * be skippable in every direction. Generation is idempotent per week, the
 * model's proposals are stored as intent rather than applied, the push is a
 * doorbell rather than the content, and the whole sweep is behind an
 * environment switch. A weekly review that misfires should cost a user one
 * ignorable card, never a mutated training plan.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  env,
} from "../_generated/server";
import { buildCoachWorkspace, type CoachWorkspace } from "./coachWorkspace";
import { hasOpenAiApiKey, requestOpenAiJson } from "./provider";
import { renderSystemPrompt } from "./prompts.generated";
import {
  normalizeCoachOperations,
  validateCoachOperations,
  type CoachOperation,
} from "../../packages/models/src/coach";
import {
  isoWeekKey,
  weekStartOf,
  WEEK_CLOSE_MINUTES,
  zonedNow,
} from "../../packages/models/src/moments";
import { mergeOutreachSettings } from "../lib/outreach";
import { hasActiveProEntitlement } from "../billing/entitlement";
import { byokKeyFor } from "./byok";

/** Users examined per sweep page. The cron runs hourly; there is no rush. */
const SELECT_PAGE_SIZE = 200;
/** Reviews generated per hourly sweep, across all timezones due in it. */
const MAX_PER_SWEEP = 500;
/** A review nobody answered is superseded rather than left lying around. */
const REVIEW_TTL_MS = 7 * 86_400_000;

/** "Active" for review purposes: any log inside this window. */
const ACTIVITY_WINDOW_DAYS = 14;

const MAX_SUMMARY_LINES = 3;

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const MAX_OPERATIONS = 3;

function clamp(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function proactiveCoachEnabled() {
  return env.COACH_PROACTIVE_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Whether the weekly review is restricted to Pro subscribers.
 *
 * Off by default: the review is the retention argument for the whole feature
 * and its per-user cost is already bounded at one model call a week by the
 * per-week idempotency — that idempotent row IS the budget. The switch exists
 * so the moment the economics say otherwise, no deploy is needed.
 */
function reviewsProOnly() {
  return env.COACH_REVIEW_PRO_ONLY?.trim().toLowerCase() === "true";
}

export const reviewEligibility = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => ({
    isPro: await hasActiveProEntitlement(ctx, args.userId),
    // A user paying the provider directly has already settled the economics
    // the Pro gate exists to protect.
    byok: (await byokKeyFor(ctx, args.userId)) !== null,
  }),
});

// ── Selection ────────────────────────────────────────────────────────────────

/**
 * Users whose local clock has just crossed Sunday evening.
 *
 * Selection reads `userPreferences` because that table is written the first
 * time the app syncs a timezone, which makes having a row a fair proxy for
 * being a user at all — and the timezone is the entire question here. Crons
 * run in UTC; Sunday evening does not.
 */
export const selectDueBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("userPreferences").paginate({
      cursor: args.cursor,
      numItems: args.limit ?? SELECT_PAGE_SIZE,
    });

    const due: Array<{ userId: string; today: string; weekStart: string }> = [];
    for (const preferences of page.page) {
      const { todayKey, nowMinutes } = zonedNow(preferences.lastActiveTimezone);
      const isSunday = new Date(`${todayKey}T12:00:00Z`).getUTCDay() === 0;
      if (!isSunday || nowMinutes < WEEK_CLOSE_MINUTES) continue;

      const settings = mergeOutreachSettings(preferences.coachOutreach);
      if (!settings.enabled || !settings.weeklyReview) continue;

      // Two indexed lookups to establish a pulse. Without them, every dormant
      // account that ever synced a timezone got the most expensive query in
      // the codebase run on its behalf every Sunday, so that weekHasSubstance
      // could tell it what the index already knew.
      const activeSince = shiftDateKey(todayKey, -(ACTIVITY_WINDOW_DAYS - 1));
      const [recentWorkout, recentFood] = await Promise.all([
        ctx.db
          .query("workoutLogs")
          .withIndex("by_userId_date", (q) =>
            q.eq("userId", preferences.userId).gte("date", activeSince),
          )
          .first(),
        ctx.db
          .query("foodLogs")
          .withIndex("by_userId_date", (q) =>
            q.eq("userId", preferences.userId).gte("date", activeSince),
          )
          .first(),
      ]);
      if (!recentWorkout && !recentFood) continue;

      due.push({
        userId: preferences.userId,
        today: todayKey,
        weekStart: weekStartOf(todayKey),
      });
    }

    return { due, cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const findReview = internalQuery({
  args: { userId: v.string(), weekStart: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("coachReviews")
      .withIndex("by_userId_and_weekStart", (q) =>
        q.eq("userId", args.userId).eq("weekStart", args.weekStart),
      )
      .unique(),
});

/**
 * The hourly sweep. Fans each due user out into their own action so one
 * user's provider failure is one missing review, not five hundred.
 */
export const enqueueDue = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!proactiveCoachEnabled()) return { scheduled: 0, skipped: "disabled" };
    if (!hasOpenAiApiKey()) return { scheduled: 0, skipped: "ai unavailable" };

    let cursor: string | null = null;
    let scheduled = 0;

    for (;;) {
      const batch: {
        due: Array<{ userId: string; today: string; weekStart: string }>;
        cursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.ai.weeklyReview.selectDueBatch, {
        cursor,
      });

      for (const candidate of batch.due) {
        if (scheduled >= MAX_PER_SWEEP) break;
        const existing = await ctx.runQuery(internal.ai.weeklyReview.findReview, {
          userId: candidate.userId,
          weekStart: candidate.weekStart,
        });
        if (existing) continue;
        // Spread the fan-out: five hundred simultaneous model calls is a rate
        // limit, not a feature.
        await ctx.scheduler.runAfter(
          scheduled * 250,
          internal.ai.weeklyReview.generateForUser,
          { userId: candidate.userId, today: candidate.today },
        );
        scheduled += 1;
      }

      if (batch.isDone || scheduled >= MAX_PER_SWEEP) break;
      cursor = batch.cursor;
    }

    return { scheduled };
  },
});

// ── Generation ───────────────────────────────────────────────────────────────

export const loadWorkspace = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: (ctx, args) => buildCoachWorkspace(ctx, args),
});

export const saveReview = internalMutation({
  args: {
    userId: v.string(),
    weekStart: v.string(),
    weekKey: v.string(),
    headline: v.string(),
    summary: v.array(v.string()),
    focus: v.optional(v.string()),
    proposedOperations: v.array(v.any()),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("coachReviews")
      .withIndex("by_userId_and_weekStart", (q) =>
        q.eq("userId", args.userId).eq("weekStart", args.weekStart),
      )
      .unique();
    // Two sweeps racing the same user must not produce two Sunday cards.
    if (existing) return existing._id;

    // Last week's card stops being an offer the moment a newer one exists.
    const stale = await ctx.db
      .query("coachReviews")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "pending"),
      )
      .collect();
    const now = Date.now();
    for (const row of stale) {
      await ctx.db.patch(row._id, { status: "expired", updatedAt: now });
    }

    return ctx.db.insert("coachReviews", {
      userId: args.userId,
      weekStart: args.weekStart,
      weekKey: args.weekKey,
      status: "pending",
      headline: args.headline,
      summary: args.summary,
      focus: args.focus,
      proposedOperations: args.proposedOperations,
      appliedOperations: [],
      requestId: args.requestId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Whether the week holds enough for a review to be about anything.
 *
 * A user who logged nothing gets silence. There is no reading of seven empty
 * days that helps anybody, and "you didn't train at all!" arriving unbidden on
 * a Sunday evening is the single fastest way to be uninstalled.
 *
 * A user with personalized insights switched off has neither array at all, and
 * so is never reviewed. That is the correct reading of the switch: a review is
 * inference about behaviour, which is the thing they turned off.
 */
function weekHasSubstance(workspace: CoachWorkspace, weekStart: string) {
  // The workspace is a union — the privacy-off branch simply lacks these keys
  // rather than emptying them — so read them defensively rather than narrowing
  // on a flag that would go stale the next time the gate moves.
  const dated = (value: unknown) =>
    (Array.isArray(value) ? value : []).filter(
      (row) =>
        typeof (row as { date?: unknown })?.date === "string" &&
        (row as { date: string }).date >= weekStart,
    ) as Array<{ date: string }>;

  const workouts = dated(
    (workspace as { recentWorkouts?: unknown }).recentWorkouts,
  ).length;
  const foodDays = new Set(
    dated((workspace as { foodEntries?: unknown }).foodEntries).map(
      (entry) => entry.date,
    ),
  ).size;
  return workouts >= 1 || foodDays >= 3;
}

function normalizeReview(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const headline = clamp(input.headline, 160);
  if (!headline) return null;

  // One sentence the coach will still be able to read in October. Optional:
  // a week that defined nothing should not have something invented for it.
  const digest = clamp(input.digest, 240);

  const summary = (Array.isArray(input.summary) ? input.summary : [])
    .map((line) => clamp(line, 200))
    .filter(Boolean)
    .slice(0, MAX_SUMMARY_LINES);

  const focus = clamp(input.focus, 200);

  let operations: CoachOperation[] = [];
  try {
    operations = normalizeCoachOperations(input.proposedOperations).slice(
      0,
      MAX_OPERATIONS,
    );
    // Proposals that could never be applied are worse than no proposals: the
    // user taps approve and gets an error for something they did not write.
    if (validateCoachOperations(operations).length > 0) operations = [];
  } catch {
    operations = [];
  }

  return {
    headline,
    summary,
    focus: focus || undefined,
    digest: digest || undefined,
    operations,
  };
}

export const generateForUser = internalAction({
  args: { userId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    if (!proactiveCoachEnabled()) return { generated: false };
    const userKey: string | null = await ctx.runQuery(
      internal.ai.byok.getKeyForUser,
      { userId: args.userId },
    );
    if (!hasOpenAiApiKey(userKey)) return { generated: false };

    const weekStart = weekStartOf(args.today);
    const weekKey = isoWeekKey(weekStart);
    const requestId = `weekly-review-${args.userId}-${weekKey}`.slice(0, 120);

    const existing = await ctx.runQuery(internal.ai.weeklyReview.findReview, {
      userId: args.userId,
      weekStart,
    });
    if (existing) return { generated: false };

    // The long view is rebuilt before anything can fail, not after the model
    // succeeds: monthly summaries and memory hygiene are independent of the
    // review, and a provider outage should not also cost this user their
    // history for the week. Selection already established a pulse.
    await ctx.runMutation(internal.ai.coachHistory.recomputeMonths, {
      userId: args.userId,
      today: args.today,
    });
    await ctx.runMutation(internal.ai.coachHistory.consolidateMemories, {
      userId: args.userId,
    });

    if (reviewsProOnly()) {
      const eligibility: { isPro: boolean; byok: boolean } = await ctx.runQuery(
        internal.ai.weeklyReview.reviewEligibility,
        { userId: args.userId },
      );
      if (!eligibility.isPro && !eligibility.byok) return { generated: false };
    }

    const workspace: CoachWorkspace = await ctx.runQuery(
      internal.ai.weeklyReview.loadWorkspace,
      { userId: args.userId, today: args.today },
    );
    if (!weekHasSubstance(workspace, weekStart)) return { generated: false };

    // What became of last week's advice. A coach who proposes a deload, gets
    // dismissed, and proposes it again next Sunday without acknowledging the
    // dismissal is a horoscope; the difference is accountability, and this is
    // where it enters the context.
    const previous = await ctx.runQuery(internal.ai.weeklyReview.findReview, {
      userId: args.userId,
      weekStart: shiftDateKey(weekStart, -7),
    });
    const previousReview = previous
      ? {
          headline: previous.headline,
          focus: previous.focus ?? null,
          proposals: (previous.proposedOperations as Array<{ summary?: string }>)
            .map((operation, index) => ({
              summary: operation.summary ?? "(unlabelled proposal)",
              outcome: previous.appliedOperations.includes(index)
                ? ("applied" as const)
                : previous.status === "pending" || previous.status === "expired"
                  ? ("unanswered" as const)
                  : ("dismissed" as const),
            }))
            .slice(0, MAX_OPERATIONS),
        }
      : null;

    let parsed: ReturnType<typeof normalizeReview> = null;
    try {
      const content = await requestOpenAiJson({
        apiKey: userKey,
        system: renderSystemPrompt("coach_weekly_review"),
        user: JSON.stringify({
          weekStart,
          weekEnd: args.today,
          previousReview,
          workspace,
          responseShape: {
            headline: "one sentence, at most 18 words, using their numbers",
            summary: [
              "at most three sentences, each at most 22 words, specific",
            ],
            focus: "one sentence naming one change for next week",
            digest:
              "one sentence worth remembering in six months, or omit it",
            proposedOperations: [
              {
                type: "create_workout_preset | create_workout_plan | update_routine | save_goal | save_weekly_plan",
                summary: "why this change, in a human sentence",
                assumptions: ["only where they matter"],
                warnings: ["only where they matter"],
              },
            ],
          },
        }),
        maxTokens: 1400,
      });
      parsed = normalizeReview(JSON.parse(content));
    } catch (error) {
      // No fallback review. A templated "good week!" nobody asked for is worse
      // than the silence of a week that quietly did not get one, and unlike
      // chat there is no user waiting on a reply to disappoint.
      console.warn("Weekly review generation failed", {
        userId: args.userId,
        error,
      });
      return { generated: false };
    }

    if (!parsed) return { generated: false };

    await ctx.runMutation(internal.ai.weeklyReview.saveReview, {
      userId: args.userId,
      weekStart,
      weekKey,
      headline: parsed.headline,
      summary: parsed.summary,
      focus: parsed.focus,
      proposedOperations: parsed.operations,
      requestId,
    });

    if (parsed.digest) {
      await ctx.runMutation(internal.ai.coachHistory.recordEpisode, {
        userId: args.userId,
        weekKey,
        digest: parsed.digest,
      });
    }

    await ctx.runAction(internal.push.send.sendCoachTouch, {
      userId: args.userId,
      kind: "weekly_review",
      dedupeKey: weekKey,
      title: "Your week, reviewed",
      // The headline is the notification. A teaser that hides the content
      // behind a tap is a tactic, and the user can smell it.
      body: parsed.headline,
      link: "onerep://coach/review",
    });

    return { generated: true };
  },
});

/** Pending reviews nobody answered eventually stop being offers. */
export const expireStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - REVIEW_TTL_MS;
    const stale = await ctx.db
      .query("coachReviews")
      .withIndex("by_status_and_createdAt", (q) =>
        q.eq("status", "pending").lte("createdAt", cutoff),
      )
      .take(200);
    let expired = 0;
    for (const review of stale) {
      await ctx.db.patch(review._id, {
        status: "expired",
        updatedAt: Date.now(),
      });
      expired += 1;
    }
    return { expired };
  },
});
