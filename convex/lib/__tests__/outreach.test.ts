import { describe, expect, test } from "bun:test";
import {
  canSendCoachTouch,
  COACH_TOUCH_CAP_PER_WEEK,
  DEFAULT_COACH_OUTREACH,
  isQuietHour,
  mergeOutreachSettings,
  type CoachOutreachSettings,
} from "../outreach";
import { zonedNow } from "../../../packages/models/src/moments";

const settings = (overrides: Partial<CoachOutreachSettings> = {}) =>
  mergeOutreachSettings(overrides);

describe("quiet hours", () => {
  test("the wrapped window is the normal case", () => {
    const quiet = { startMinutes: 21 * 60 + 30, endMinutes: 8 * 60 };
    expect(isQuietHour(22 * 60, quiet)).toBe(true);
    expect(isQuietHour(3 * 60, quiet)).toBe(true);
    expect(isQuietHour(7 * 60 + 59, quiet)).toBe(true);
    expect(isQuietHour(8 * 60, quiet)).toBe(false);
    expect(isQuietHour(13 * 60, quiet)).toBe(false);
    expect(isQuietHour(21 * 60 + 29, quiet)).toBe(false);
  });

  test("a same-day window does not wrap", () => {
    const quiet = { startMinutes: 9 * 60, endMinutes: 17 * 60 };
    expect(isQuietHour(12 * 60, quiet)).toBe(true);
    expect(isQuietHour(20 * 60, quiet)).toBe(false);
    expect(isQuietHour(3 * 60, quiet)).toBe(false);
  });

  test("an empty window silences nothing", () => {
    expect(isQuietHour(3 * 60, { startMinutes: 60, endMinutes: 60 })).toBe(
      false,
    );
    expect(isQuietHour(3 * 60, undefined)).toBe(false);
  });
});

describe("the gate", () => {
  const noon = 12 * 60;

  test("lets an ordinary nudge through", () => {
    expect(
      canSendCoachTouch({
        kind: "missed_log",
        settings: settings(),
        nowMinutes: noon,
        recentTouchCount: 0,
      }),
    ).toEqual({ allowed: true });
  });

  test("the master switch outranks everything", () => {
    for (const kind of ["weekly_review", "missed_log"] as const) {
      const decision = canSendCoachTouch({
        kind,
        settings: settings({ enabled: false }),
        nowMinutes: noon,
        recentTouchCount: 0,
      });
      expect(decision.allowed).toBe(false);
    }
  });

  test("category switches are independent", () => {
    const nudgesOff = settings({ nudges: false });
    expect(
      canSendCoachTouch({
        kind: "missed_log",
        settings: nudgesOff,
        nowMinutes: noon,
        recentTouchCount: 0,
      }).allowed,
    ).toBe(false);
    expect(
      canSendCoachTouch({
        kind: "weekly_review",
        settings: nudgesOff,
        nowMinutes: noon,
        recentTouchCount: 0,
      }).allowed,
    ).toBe(true);
  });

  test("nobody is woken at three in the morning", () => {
    expect(
      canSendCoachTouch({
        kind: "weekly_review",
        settings: settings(),
        nowMinutes: 3 * 60,
        recentTouchCount: 0,
      }).allowed,
    ).toBe(false);
  });

  test("the cap holds, and the weekly review is exempt from it", () => {
    const spent = {
      settings: settings(),
      nowMinutes: noon,
      recentTouchCount: COACH_TOUCH_CAP_PER_WEEK,
    };
    expect(
      canSendCoachTouch({ kind: "training_lapse", ...spent }).allowed,
    ).toBe(false);
    // The one message the user was told to expect must not be crowded out by
    // three stray nudges.
    expect(canSendCoachTouch({ kind: "weekly_review", ...spent }).allowed).toBe(
      true,
    );
  });

  test("one below the cap still sends", () => {
    expect(
      canSendCoachTouch({
        kind: "missed_log",
        settings: settings(),
        nowMinutes: noon,
        recentTouchCount: COACH_TOUCH_CAP_PER_WEEK - 1,
      }).allowed,
    ).toBe(true);
  });
});

describe("settings defaults", () => {
  test("absent preferences mean the documented defaults", () => {
    expect(mergeOutreachSettings(undefined)).toEqual(DEFAULT_COACH_OUTREACH);
    expect(mergeOutreachSettings(null)).toEqual(DEFAULT_COACH_OUTREACH);
  });

  test("a partial object keeps the switches it does not mention", () => {
    const merged = mergeOutreachSettings({ nudges: false });
    expect(merged.nudges).toBe(false);
    expect(merged.enabled).toBe(true);
    expect(merged.weeklyReview).toBe(true);
  });
});

describe("the user's clock, not the server's", () => {
  // 2026-08-09T23:30:00Z: still Sunday evening in London, already Monday
  // morning in Tokyo, and Sunday afternoon in Los Angeles.
  const instant = new Date("2026-08-09T23:30:00Z");

  test("reads the local day and minute-of-day", () => {
    expect(zonedNow("Europe/London", instant)).toEqual({
      todayKey: "2026-08-10",
      nowMinutes: 30,
    });
    expect(zonedNow("Asia/Tokyo", instant)).toEqual({
      todayKey: "2026-08-10",
      nowMinutes: 8 * 60 + 30,
    });
    expect(zonedNow("America/Los_Angeles", instant)).toEqual({
      todayKey: "2026-08-09",
      nowMinutes: 16 * 60 + 30,
    });
  });

  test("midnight is zero, not twenty-four hundred", () => {
    const midnight = new Date("2026-08-09T00:00:00Z");
    expect(zonedNow("UTC", midnight)).toEqual({
      todayKey: "2026-08-09",
      nowMinutes: 0,
    });
  });

  test("a garbled timezone costs one badly-timed nudge, not the sweep", () => {
    expect(() => zonedNow("Not/AZone", instant)).not.toThrow();
    expect(zonedNow("Not/AZone", instant).todayKey).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});
