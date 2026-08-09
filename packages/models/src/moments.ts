/**
 * Trigger logic for the nudge moments, kept pure and kept *here* — in the
 * shared package — because both sides of the wire now ask the same question.
 * The client asks it to decide whether to show a full-screen moment; the
 * server asks it to decide whether to knock on someone's phone. Two answers to
 * "should we interrupt this person" is one answer too many.
 *
 * Every trigger returns a key or null. The key is the scope one showing
 * covers; null is the answer most of the time, and should be.
 */

/**
 * The built-in moments, by id. Shared with the developer menu, which opens
 * them by name and would otherwise be guessing at string literals.
 */
export const MOMENT_IDS = {
  missedLog: "moment.missed-log",
  trainingLapse: "moment.training-lapse",
  weeklyReport: "moment.weekly-report",
  weeklyReview: "moment.weekly-review",
} as const;

export type MomentId = (typeof MOMENT_IDS)[keyof typeof MOMENT_IDS];

export type MomentFoodEntry = {
  loggedAt?: string;
  calories?: number;
  protein?: number;
};

export type MomentFoodLog = {
  date: string;
  entries?: MomentFoodEntry[];
};

export type MomentWorkoutLog = {
  date: string;
  durationSeconds?: number;
  exercises?: Array<{ sets?: Array<{ completed?: boolean }> }>;
};

export type MomentBodyMeasurement = {
  loggedAt: string;
  weightKg?: number;
};

/** Days of history the "usual time" estimate looks at. */
const HABIT_WINDOW_DAYS = 14;
/** Below this many logged days there is no habit to be late for. */
const MIN_HABIT_DAYS = 3;
/** How long after the usual time to wait before saying anything. */
const NUDGE_GRACE_MINUTES = 45;
/** The estimate is clamped here: nobody gets asked at 07:00 or at midnight. */
const EARLIEST_NUDGE_MINUTES = 11 * 60;
const LATEST_NUDGE_MINUTES = 22 * 60 + 30;

/** Days off before a lapse is worth a word. */
const LAPSE_DAYS = 4;
/** And the lapse only counts for someone who was training in the first place. */
const LAPSE_HISTORY_DAYS = 60;
const LAPSE_MIN_SESSIONS = 3;

/** Sunday evening is when the week is over in every sense that matters. */
export const WEEK_CLOSE_MINUTES = 18 * 60;

/** Format a Date as YYYY-MM-DD using the local calendar day. */
export function dateToIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Return a copy normalized to local noon for calendar-day calculations. */
export function localNoon(date: Date = new Date()): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

/** Return a new Date offset by `days` (negative = future). */
export function subtractDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() - days);
  return shifted;
}

export function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Wall-clock parts of an instant in a named zone.
 *
 * The client can read a phone's clock and be right by construction. The server
 * cannot: it runs in UTC, and "has this person missed their usual 20:00 log"
 * asked in UTC is a question about somebody else. Every caller that compares
 * an absolute timestamp against a human's day passes the zone explicitly.
 */
function zonedParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  // `hour12: false` yields 24 for midnight in some engines; the day already
  // rolled over, so the minute-of-day is zero.
  const hour = Number(value("hour")) % 24;
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: hour * 60 + Number(value("minute")),
  };
}

/**
 * The user's own "now": which day it is where they are, and how far into it.
 *
 * Invalid zones fall back to the server's clock rather than throwing — a
 * garbled timezone string should cost someone a badly-timed nudge at worst,
 * never a failed cron sweep for everyone in the batch.
 */
export function zonedNow(
  timeZone: string | undefined,
  at: Date = new Date(),
): { todayKey: string; nowMinutes: number } {
  if (timeZone) {
    try {
      const { dateKey, minutes } = zonedParts(at, timeZone);
      return { todayKey: dateKey, nowMinutes: minutes };
    } catch {
      // Fall through to the server clock.
    }
  }
  return { todayKey: dateToIso(at), nowMinutes: minutesOfDay(at) };
}

/**
 * Minutes-of-day for an ISO timestamp, in `timeZone` when given and in the
 * runtime's own zone otherwise. Null if the timestamp is nonsense.
 */
export function loggedAtMinutes(
  loggedAt: string | undefined,
  timeZone?: string,
) {
  if (!loggedAt) return null;
  const at = new Date(loggedAt);
  if (Number.isNaN(at.getTime())) return null;
  if (timeZone) {
    try {
      return zonedParts(at, timeZone).minutes;
    } catch {
      return minutesOfDay(at);
    }
  }
  return minutesOfDay(at);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Whole calendar days between two YYYY-MM-DD keys, `from` earlier. */
export function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

function entriesOf(log: MomentFoodLog | undefined) {
  return log?.entries ?? [];
}

/**
 * The hour this user is usually done logging, as minutes past midnight.
 *
 * Taken from the last entry of each recent day rather than the first: the
 * question the nudge asks is whether the day went unlogged, and breakfast
 * being late is not that.
 */
export function usualLogMinutes(
  foodLogs: MomentFoodLog[],
  todayKey: string,
  windowDays = HABIT_WINDOW_DAYS,
  timeZone?: string,
) {
  const earliest = dateToIso(
    subtractDays(localNoon(new Date(`${todayKey}T12:00:00`)), windowDays),
  );

  const lastEntryPerDay: number[] = [];
  for (const log of foodLogs) {
    if (log.date >= todayKey || log.date < earliest) continue;
    const minutes = entriesOf(log)
      .map((entry) => loggedAtMinutes(entry.loggedAt, timeZone))
      .filter((value): value is number => value !== null);
    if (minutes.length === 0) continue;
    lastEntryPerDay.push(Math.max(...minutes));
  }

  if (lastEntryPerDay.length < MIN_HABIT_DAYS) return null;
  const typical = median(lastEntryPerDay);
  if (typical === null) return null;
  return clamp(typical, EARLIEST_NUDGE_MINUTES, LATEST_NUDGE_MINUTES);
}

/** Days in the last `windowDays` (today excluded) that carry any food entry. */
export function loggedDaysInWindow(
  foodLogs: MomentFoodLog[],
  todayKey: string,
  windowDays: number,
) {
  const earliest = dateToIso(
    subtractDays(localNoon(new Date(`${todayKey}T12:00:00`)), windowDays),
  );
  return foodLogs.filter(
    (log) =>
      log.date < todayKey && log.date >= earliest && entriesOf(log).length > 0,
  ).length;
}

/**
 * "You have not logged today, and it is past the time you usually have."
 *
 * Returns today's date key when the question is fair to ask, otherwise null.
 */
export function missedLogTrigger({
  foodLogs,
  todayKey,
  nowMinutes,
  timeZone,
}: {
  foodLogs: MomentFoodLog[];
  todayKey: string;
  nowMinutes: number;
  /** Omitted on the client, where the runtime clock is already the user's. */
  timeZone?: string;
}): { key: string; usualMinutes: number } | null {
  const today = foodLogs.find((log) => log.date === todayKey);
  if (entriesOf(today).length > 0) return null;

  if (loggedDaysInWindow(foodLogs, todayKey, 7) < MIN_HABIT_DAYS) return null;

  const usualMinutes = usualLogMinutes(
    foodLogs,
    todayKey,
    HABIT_WINDOW_DAYS,
    timeZone,
  );
  if (usualMinutes === null) return null;
  if (nowMinutes < usualMinutes + NUDGE_GRACE_MINUTES) return null;

  return { key: todayKey, usualMinutes };
}

/** The days between two keys, exclusive of `from` and inclusive of `to`. */
export function daysAfter(from: string, to: string) {
  const span = daysBetween(from, to);
  if (span <= 0) return [];
  const start = localNoon(new Date(`${from}T12:00:00`));
  return Array.from({ length: span }, (_, index) =>
    dateToIso(subtractDays(start, -(index + 1))),
  );
}

/**
 * "You have not trained in a while."
 *
 * Days the user has marked as deliberate rest do not count toward the gap — a
 * planned deload is not a lapse, and being asked about it every week is how
 * an app teaches someone to ignore it. The key re-arms once a week, so a real
 * absence is one question every seven days rather than one every morning.
 */
export function trainingLapseTrigger({
  workoutLogs,
  todayKey,
  restDates = [],
}: {
  workoutLogs: MomentWorkoutLog[];
  todayKey: string;
  restDates?: string[];
}): {
  key: string;
  daysSince: number;
  idleDays: number;
  idleDates: string[];
  lastWorkoutDate: string | null;
} | null {
  const past = workoutLogs
    .map((log) => log.date)
    .filter((date) => date <= todayKey)
    .sort();

  const recentCutoff = dateToIso(
    subtractDays(
      localNoon(new Date(`${todayKey}T12:00:00`)),
      LAPSE_HISTORY_DAYS,
    ),
  );
  const recentSessions = new Set(past.filter((date) => date >= recentCutoff));
  if (recentSessions.size < LAPSE_MIN_SESSIONS) return null;

  const lastWorkoutDate = past.at(-1) ?? null;
  if (!lastWorkoutDate) return null;

  const daysSince = daysBetween(lastWorkoutDate, todayKey);
  if (daysSince < LAPSE_DAYS) return null;

  const rested = new Set(restDates);
  const idleDates = daysAfter(lastWorkoutDate, todayKey).filter(
    (date) => !rested.has(date),
  );
  const idleDays = idleDates.length;
  if (idleDays < LAPSE_DAYS) return null;

  const week = Math.floor(idleDays / 7);
  return {
    key: `${lastWorkoutDate}:${week}`,
    daysSince,
    idleDays,
    idleDates,
    lastWorkoutDate,
  };
}

// ── The week ─────────────────────────────────────────────────────────────────

/** Monday of the ISO week containing `dateKey`. */
export function weekStartOf(dateKey: string) {
  const ref = localNoon(new Date(`${dateKey}T12:00:00`));
  const dow = ref.getDay(); // 0 = Sunday
  return dateToIso(subtractDays(ref, dow === 0 ? 6 : dow - 1));
}

/** `2026-W32`, the ISO week the Monday `weekStart` belongs to. */
export function isoWeekKey(weekStart: string) {
  const date = new Date(`${weekStart}T12:00:00Z`);
  // Thursday decides the ISO year, which is the entire trick.
  date.setUTCDate(date.getUTCDate() + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12));
  const offset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - offset + 3);
  const week =
    1 +
    Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * The most recently finished week, from Sunday evening onwards.
 *
 * Before that the week is still being written, and a report on a week with a
 * Sunday session still in it is a report that is wrong.
 */
export function completedWeek(todayKey: string, nowMinutes: number) {
  const ref = localNoon(new Date(`${todayKey}T12:00:00`));
  const isSunday = ref.getDay() === 0;
  const thisWeekStart = weekStartOf(todayKey);

  if (isSunday && nowMinutes >= WEEK_CLOSE_MINUTES) {
    return { start: thisWeekStart, end: todayKey };
  }

  const previousStart = dateToIso(
    subtractDays(localNoon(new Date(`${thisWeekStart}T12:00:00`)), 7),
  );
  return {
    start: previousStart,
    end: dateToIso(
      subtractDays(localNoon(new Date(`${thisWeekStart}T12:00:00`)), 1),
    ),
  };
}
