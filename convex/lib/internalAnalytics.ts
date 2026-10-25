import type { AnalyticsReport } from "@repo/models";
export type { AnalyticsCohort, AnalyticsReport } from "@repo/models";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export function commaSeparated(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function excludedAnalyticsAccount(
  user: { userId: string; email: string },
  excludedIds: Set<string>,
  excludedEmails: Set<string>,
) {
  const email = user.email.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  return (
    excludedIds.has(user.userId) ||
    excludedEmails.has(email) ||
    /(^|\.)(test|invalid|localhost)$/.test(domain) ||
    /(^|\.)example\.(com|net|org)$/.test(domain)
  );
}

export type AnalyticsAccount = {
  userId: string;
  signupAt: number | null;
  excluded: boolean;
};
export type AnalyticsWorkout = {
  userId: string;
  loggedAt: number;
  date: string;
};
type UserActivity = {
  signupAt: number | null;
  hasWorkout: boolean;
  days: Set<string>;
  invalidDay: boolean;
  invalidTime: boolean;
  active7: boolean;
  active30: boolean;
  activePrevious7: boolean;
  activePrevious30: boolean;
  activeWeeks: number;
  activated: boolean;
  returned: boolean;
};

function validTimestamp(value: number | null, now: number): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= now;
}

function weekStart(timestamp: number) {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}

/** Retains only two distinct dates per user. No exercises or health data enter this reducer. */
export function createAnalyticsAccumulator(now: number) {
  const currentWeek = weekStart(now);
  const users = new Map<string, UserActivity>();
  const excluded = new Set<string>();
  const quality = {
    excludedAccounts: 0,
    unknownSignupAccounts: 0,
    unlinkedWorkoutRecords: 0,
    invalidWorkoutDates: 0,
    invalidLogTimes: 0,
  };
  return {
    account(account: AnalyticsAccount) {
      if (account.excluded) {
        excluded.add(account.userId);
        quality.excludedAccounts++;
        return;
      }
      const signupAt = validTimestamp(account.signupAt, now)
        ? account.signupAt
        : null;
      if (signupAt === null) quality.unknownSignupAccounts++;
      users.set(account.userId, {
        signupAt,
        hasWorkout: false,
        days: new Set(),
        invalidDay: false,
        invalidTime: false,
        active7: false,
        active30: false,
        activePrevious7: false,
        activePrevious30: false,
        activeWeeks: 0,
        activated: false,
        returned: false,
      });
    },
    workout(log: AnalyticsWorkout) {
      if (excluded.has(log.userId)) return;
      const user = users.get(log.userId);
      if (!user) {
        quality.unlinkedWorkoutRecords++;
        return;
      }
      // Future writes belong to the next refresh, not this report's cutoff.
      if (Number.isFinite(log.loggedAt) && log.loggedAt > now) return;
      user.hasWorkout = true;
      const day = Date.parse(`${log.date}T00:00:00Z`);
      if (
        /^\d{4}-\d{2}-\d{2}$/.test(log.date) &&
        Number.isFinite(day) &&
        new Date(day).toISOString().slice(0, 10) === log.date
      ) {
        if (user.days.size < 2) user.days.add(log.date);
      } else {
        user.invalidDay = true;
        quality.invalidWorkoutDates++;
      }
      if (!validTimestamp(log.loggedAt, now)) {
        user.invalidTime = true;
        quality.invalidLogTimes++;
        return;
      }
      if (log.loggedAt >= now - WEEK) user.active7 = true;
      if (log.loggedAt >= now - 30 * DAY) user.active30 = true;
      if (log.loggedAt >= now - 2 * WEEK && log.loggedAt < now - WEEK)
        user.activePrevious7 = true;
      if (log.loggedAt >= now - 60 * DAY && log.loggedAt < now - 30 * DAY)
        user.activePrevious30 = true;
      const weekOffset = Math.floor(
        (currentWeek - weekStart(log.loggedAt)) / WEEK,
      );
      if (weekOffset >= 0 && weekOffset < 26)
        user.activeWeeks |= 1 << weekOffset;
      if (user.signupAt !== null) {
        const age = log.loggedAt - user.signupAt;
        if (age >= 0 && age < WEEK) user.activated = true;
        if (age >= WEEK && age < 2 * WEEK) user.returned = true;
      }
    },
    finish(): AnalyticsReport {
      const comparisons: AnalyticsReport["comparisons"] = {
        signups7: 0,
        signupsPrevious7: 0,
        signups30: 0,
        signupsPrevious30: 0,
        activePrevious7: 0,
        activePrevious30: 0,
      };
      const weekly: AnalyticsReport["weekly"] = Array.from(
        { length: 26 },
        (_, index) => ({
          week: new Date(currentWeek - (25 - index) * WEEK)
            .toISOString()
            .slice(0, 10),
          signups: 0,
          activeUsers: 0,
          partial: index === 25,
        }),
      );
      const totals: AnalyticsReport["totals"] = {
        signups: users.size,
        workoutUsers: 0,
        repeatDayUsers: 0,
        active7: 0,
        active30: 0,
      };
      const cohorts = new Map<
        number,
        {
          signups: number;
          activated: number;
          retained: number;
          unknown: boolean;
        }
      >();
      let repeatUnknown = false;
      let active7Unknown = false;
      let active30Unknown = false;
      let previous7Unknown = false;
      let previous30Unknown = false;
      let weeklyActivityUnknown = false;
      for (const user of users.values()) {
        if (user.hasWorkout) totals.workoutUsers++;
        if (user.days.size >= 2) totals.repeatDayUsers!++;
        else if (user.invalidDay) repeatUnknown = true;
        if (user.active7) totals.active7!++;
        else if (user.invalidTime) active7Unknown = true;
        if (user.active30) totals.active30!++;
        else if (user.invalidTime) active30Unknown = true;
        if (user.activePrevious7) comparisons.activePrevious7!++;
        else if (user.invalidTime) previous7Unknown = true;
        if (user.activePrevious30) comparisons.activePrevious30!++;
        else if (user.invalidTime) previous30Unknown = true;
        if (user.invalidTime) weeklyActivityUnknown = true;
        for (let offset = 0; offset < 26; offset++) {
          if (user.activeWeeks & (1 << offset))
            weekly[25 - offset].activeUsers!++;
        }
        if (user.signupAt === null) continue;
        if (user.signupAt >= now - WEEK) comparisons.signups7!++;
        else if (user.signupAt >= now - 2 * WEEK)
          comparisons.signupsPrevious7!++;
        if (user.signupAt >= now - 30 * DAY) comparisons.signups30!++;
        else if (user.signupAt >= now - 60 * DAY)
          comparisons.signupsPrevious30!++;
        const signupOffset = Math.floor(
          (currentWeek - weekStart(user.signupAt)) / WEEK,
        );
        if (signupOffset >= 0 && signupOffset < 26)
          weekly[25 - signupOffset].signups!++;
        const week = weekStart(user.signupAt);
        const cohort = cohorts.get(week) ?? {
          signups: 0,
          activated: 0,
          retained: 0,
          unknown: false,
        };
        cohort.signups++;
        if (user.activated) cohort.activated++;
        if (user.activated && user.returned) cohort.retained++;
        if (user.invalidTime) cohort.unknown = true;
        cohorts.set(week, cohort);
      }
      if (repeatUnknown) totals.repeatDayUsers = null;
      if (active7Unknown) totals.active7 = null;
      if (active30Unknown) totals.active30 = null;
      if (previous7Unknown) comparisons.activePrevious7 = null;
      if (previous30Unknown) comparisons.activePrevious30 = null;
      if (quality.unknownSignupAccounts > 0) {
        comparisons.signups7 =
          comparisons.signupsPrevious7 =
          comparisons.signups30 =
          comparisons.signupsPrevious30 =
            null;
      }
      for (const week of weekly) {
        if (quality.unknownSignupAccounts > 0) week.signups = null;
        if (weeklyActivityUnknown) week.activeUsers = null;
      }
      return {
        asOf: now,
        totals,
        quality,
        comparisons,
        weekly,
        cohorts: [...cohorts.entries()]
          .sort(([a], [b]) => b - a)
          .map(([week, cohort]) => {
            const activationStatus = cohort.unknown
              ? "unavailable"
              : now < week + 2 * WEEK
                ? "pending"
                : "available";
            const retentionStatus = cohort.unknown
              ? "unavailable"
              : now < week + 3 * WEEK
                ? "pending"
                : "available";
            return {
              week: new Date(week).toISOString().slice(0, 10),
              signups: cohort.signups,
              activated:
                activationStatus === "available" ? cohort.activated : null,
              retained:
                retentionStatus === "available" ? cohort.retained : null,
              activationStatus,
              retentionStatus,
            };
          }),
      };
    },
  };
}
