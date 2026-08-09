/**
 * The rules governing when Coach is allowed to speak first.
 *
 * Kept pure and kept in one file, because the alternative — each caller
 * checking the toggles it happens to remember — is how an app ends up sending
 * someone four notifications on a Tuesday and losing them forever. Every send
 * goes through `sendCoachTouch`, and `sendCoachTouch` goes through here.
 */

export type CoachTouchKind = "weekly_review" | "missed_log" | "training_lapse";

export type CoachOutreachSettings = {
  enabled: boolean;
  weeklyReview: boolean;
  nudges: boolean;
  quietHours?: { startMinutes: number; endMinutes: number };
};

/**
 * Outreach is on by default, quietly, from 21:30 to 08:00.
 *
 * Defaulting to off would mean the feature never runs for anyone who does not
 * go looking for a settings screen, which is everyone. Defaulting to on with a
 * hard cap and a real off switch is the honest trade.
 */
export const DEFAULT_COACH_OUTREACH: CoachOutreachSettings = {
  enabled: true,
  weeklyReview: true,
  nudges: true,
  quietHours: { startMinutes: 21 * 60 + 30, endMinutes: 8 * 60 },
};

/** Coach-initiated messages allowed in any rolling seven days. */
export const COACH_TOUCH_CAP_PER_WEEK = 3;
export const COACH_TOUCH_WINDOW_MS = 7 * 86_400_000;

/**
 * The weekly review does not spend from the cap.
 *
 * It is the one message the user was told to expect, arriving when they were
 * told it would. Letting three stray nudges crowd out the thing they actually
 * signed up for would be exactly backwards.
 */
const CAPPED_KINDS: ReadonlySet<CoachTouchKind> = new Set([
  "missed_log",
  "training_lapse",
]);

export function isCappedKind(kind: CoachTouchKind) {
  return CAPPED_KINDS.has(kind);
}

export function mergeOutreachSettings(
  value?: Partial<CoachOutreachSettings> | null,
): CoachOutreachSettings {
  return {
    enabled: value?.enabled ?? DEFAULT_COACH_OUTREACH.enabled,
    weeklyReview: value?.weeklyReview ?? DEFAULT_COACH_OUTREACH.weeklyReview,
    nudges: value?.nudges ?? DEFAULT_COACH_OUTREACH.nudges,
    quietHours: value?.quietHours ?? DEFAULT_COACH_OUTREACH.quietHours,
  };
}

/**
 * Whether `minutes` falls inside the silent window.
 *
 * Quiet hours nearly always wrap midnight, so the wrapped case is the normal
 * one rather than the edge case: start 1290, end 480 means silence from 21:30
 * until 08:00 the next morning.
 */
export function isQuietHour(
  minutes: number,
  quietHours: CoachOutreachSettings["quietHours"],
) {
  if (!quietHours) return false;
  const { startMinutes, endMinutes } = quietHours;
  if (startMinutes === endMinutes) return false;
  return startMinutes < endMinutes
    ? minutes >= startMinutes && minutes < endMinutes
    : minutes >= startMinutes || minutes < endMinutes;
}

/**
 * Flat rather than a tagged union on purpose: `apps/mobile/tsconfig.app.json`
 * sets `strict: false`, so narrowing on a boolean literal does not work there
 * and `if (!decision.allowed)` would not reveal `reason`. Same reason the
 * app's own validators return a flat shape.
 */
export type OutreachDecision = {
  allowed: boolean;
  /** Present only when `allowed` is false. */
  reason?: string;
};

/**
 * The whole gate, in one call.
 *
 * `recentTouches` is every capped send inside the rolling window; the dedupe
 * check is the caller's, since only it knows the key that identifies "this
 * exact thing, already said".
 */
export function canSendCoachTouch({
  kind,
  settings,
  nowMinutes,
  recentTouchCount,
}: {
  kind: CoachTouchKind;
  settings: CoachOutreachSettings;
  /** Minutes-of-day in the user's own timezone, not the server's. */
  nowMinutes: number;
  recentTouchCount: number;
}): OutreachDecision {
  if (!settings.enabled) {
    return { allowed: false, reason: "outreach disabled" };
  }
  if (kind === "weekly_review" && !settings.weeklyReview) {
    return { allowed: false, reason: "weekly review disabled" };
  }
  if (kind !== "weekly_review" && !settings.nudges) {
    return { allowed: false, reason: "nudges disabled" };
  }
  if (isQuietHour(nowMinutes, settings.quietHours)) {
    return { allowed: false, reason: "quiet hours" };
  }
  if (isCappedKind(kind) && recentTouchCount >= COACH_TOUCH_CAP_PER_WEEK) {
    return { allowed: false, reason: "weekly frequency cap reached" };
  }
  return { allowed: true };
}
