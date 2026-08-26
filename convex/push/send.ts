/**
 * The one door every coach-initiated message goes through.
 *
 * Callers do not check toggles, quiet hours, or the frequency cap. They ask to
 * send; this decides. That is deliberate: the moment a second code path learns
 * how to reach a user's phone is the moment the guarantees stop being
 * guarantees, and the whole feature rests on the promise that Coach speaks
 * rarely and can be silenced completely.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  canSendCoachTouch,
  COACH_TOUCH_WINDOW_MS,
  isCappedKind,
  mergeOutreachSettings,
  type CoachTouchKind,
} from "../lib/outreach";
import { zonedNow } from "../../packages/models/src/moments";
import { hasApnsCredentials, resolveApnsConfig, sendApnsPush } from "./apns";
import { resolveFcmConfig, sendPush } from "./fcm";

export const coachTouchKind = v.union(
  v.literal("weekly_review"),
  v.literal("missed_log"),
  v.literal("training_lapse"),
);

/** Everything the gate needs, in one read. */
export const loadGateState = internalQuery({
  args: {
    userId: v.string(),
    kind: coachTouchKind,
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const [preferences, duplicate, recent] = await Promise.all([
      ctx.db
        .query("userPreferences")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("coachTouches")
        .withIndex("by_userId_and_kind_and_dedupeKey", (q) =>
          q
            .eq("userId", args.userId)
            .eq("kind", args.kind)
            .eq("dedupeKey", args.dedupeKey),
        )
        .first(),
      ctx.db
        .query("coachTouches")
        .withIndex("by_userId_and_sentAt", (q) =>
          q
            .eq("userId", args.userId)
            .gte("sentAt", Date.now() - COACH_TOUCH_WINDOW_MS),
        )
        .collect(),
    ]);

    return {
      settings: mergeOutreachSettings(preferences?.coachOutreach),
      timezone: preferences?.lastActiveTimezone,
      alreadySent: duplicate !== null,
      recentTouchCount: recent.filter((touch) => isCappedKind(touch.kind))
        .length,
    };
  },
});

export const recordTouch = internalMutation({
  args: {
    userId: v.string(),
    kind: coachTouchKind,
    dedupeKey: v.string(),
    delivered: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("coachTouches", {
      userId: args.userId,
      kind: args.kind,
      dedupeKey: args.dedupeKey,
      sentAt: Date.now(),
      delivered: args.delivered,
    });
  },
});

export type CoachTouchOutcome = {
  sent: boolean;
  /** Present when nothing was sent; the gate's own words. */
  reason?: string;
  delivered: number;
};

/**
 * Send one coach-initiated message, if the rules allow it.
 *
 * Returns rather than throws when the answer is no. A user with outreach off
 * is not an error condition, and a cron sweeping a thousand accounts must not
 * treat the nine hundred silent ones as failures.
 */
export const sendCoachTouch = internalAction({
  args: {
    userId: v.string(),
    kind: coachTouchKind,
    dedupeKey: v.string(),
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CoachTouchOutcome> => {
    const kind = args.kind as CoachTouchKind;
    const gate: {
      settings: ReturnType<typeof mergeOutreachSettings>;
      timezone?: string;
      alreadySent: boolean;
      recentTouchCount: number;
    } = await ctx.runQuery(internal.push.send.loadGateState, {
      userId: args.userId,
      kind: args.kind,
      dedupeKey: args.dedupeKey,
    });

    if (gate.alreadySent) {
      return { sent: false, reason: "already sent", delivered: 0 };
    }

    const { nowMinutes } = zonedNow(gate.timezone);
    const decision = canSendCoachTouch({
      kind,
      settings: gate.settings,
      nowMinutes,
      recentTouchCount: gate.recentTouchCount,
    });
    if (!decision.allowed) {
      return { sent: false, reason: decision.reason, delivered: 0 };
    }

    // Two transports, one gate. Android tokens are FCM registration ids and
    // iOS tokens are APNs device tokens; they are not interchangeable, and a
    // deployment may hold credentials for one platform and not the other.
    const fcmConfig = resolveFcmConfig();
    const apnsConfig = resolveApnsConfig();
    if (!fcmConfig && !apnsConfig) {
      // The review or nudge still exists server-side and will surface as a
      // moment on next open. Push is the doorbell, not the house.
      return { sent: false, reason: "push not configured", delivered: 0 };
    }

    const tokens: Array<{
      _id: Id<"pushTokens">;
      token: string;
      platform: "ios" | "android";
    }> = await ctx.runQuery(internal.push.tokens.listForUser, {
      userId: args.userId,
    });
    if (tokens.length === 0) {
      return { sent: false, reason: "no registered devices", delivered: 0 };
    }

    const message = {
      title: args.title,
      body: args.body,
      link: args.link,
      data: { kind: args.kind, dedupeKey: args.dedupeKey },
    };

    const delivered: Id<"pushTokens">[] = [];
    const dead: Id<"pushTokens">[] = [];
    let unroutable = 0;
    for (const row of tokens) {
      // A device whose transport this deployment cannot speak is left exactly
      // as it was found. It is not dead, it is unaddressable from here, and
      // deleting it would cost the user a registration over a missing
      // environment variable.
      const result =
        row.platform === "ios"
          ? apnsConfig
            ? await sendApnsPush(apnsConfig, row.token, message)
            : null
          : fcmConfig
            ? await sendPush(fcmConfig, row.token, message)
            : null;
      if (!result) {
        unroutable += 1;
        continue;
      }
      if (result.ok) delivered.push(row._id);
      else if (!result.retriable) dead.push(row._id);
      else
        console.warn("Coach push failed", {
          kind: args.kind,
          error: result.error,
        });
    }

    if (unroutable === tokens.length) {
      // Nothing was attempted, so nothing should be remembered — least of all
      // the dedupe key, which would suppress this send for good once the
      // missing platform's credentials finally land.
      return {
        sent: false,
        reason: "push not configured for these devices",
        delivered: 0,
      };
    }

    if (delivered.length > 0 || dead.length > 0) {
      await ctx.runMutation(internal.push.tokens.reconcile, {
        delivered,
        dead,
      });
    }

    // Recorded even when every device rejected it: the dedupe key exists to
    // stop the next sweep re-deciding the same thing, and a user whose tokens
    // are all stale should not have that question reopened hourly.
    await ctx.runMutation(internal.push.send.recordTouch, {
      userId: args.userId,
      kind: args.kind,
      dedupeKey: args.dedupeKey,
      delivered: delivered.length,
    });

    return { sent: delivered.length > 0, delivered: delivered.length };
  },
});
