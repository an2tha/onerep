/**
 * The programming brain: what the training logs actually say, computed rather
 * than narrated.
 *
 * The coach used to be handed thirty raw sessions and asked to notice that a
 * squat had stopped moving. Language models are bad at that — it is arithmetic
 * over a table, and they will cheerfully assert a trend from two data points
 * or miss one sitting in plain sight. So the arithmetic happens here, in
 * functions that can be argued with in a test, and the model receives
 * conclusions: this lift is stalled, this one is climbing, here is the case
 * for a deload. It decides what to *say* and what to propose. It does not
 * decide what the numbers are.
 *
 * Everything is pure. The Convex layer supplies logs and stores nothing.
 */

import { estimate1RM } from "../../packages/models/src/oneRm";
import { isoWeekKey, weekStartOf } from "../../packages/models/src/moments";

// ── Inputs ───────────────────────────────────────────────────────────────────

export type LoggedSet = {
  type?: string;
  reps?: number;
  weight?: number;
  completed?: boolean;
  rpe?: number;
  rir?: number;
};

export type LoggedExercise = {
  id?: string;
  name?: string;
  category?: string;
  sets?: LoggedSet[];
};

export type LoggedWorkout = {
  date: string;
  exercises?: LoggedExercise[];
};

// ── Tuning ───────────────────────────────────────────────────────────────────

/** How far back the analysis reaches. Twelve weeks is a training block. */
export const PROGRAMMING_WINDOW_DAYS = 84;
/** Below this, a lift has a history too short to have a direction. */
const MIN_SESSIONS_FOR_STATUS = 3;
/** Sessions that count as "recent" when asking whether anything improved. */
const RECENT_SESSIONS = 3;
/**
 * Movement inside this band is noise, not progress.
 *
 * Estimated 1RM swings by more than a percent on rounding alone — a 100kg
 * triple and a 102.5kg double are the same performance. Calling that an
 * improvement is how an app tells someone they are progressing while they
 * quietly stagnate for two months.
 */
const NOISE_BAND_PCT = 1.5;
/** Lifts reported to the model, most-trained first. */
const MAX_TRACKED_LIFTS = 8;
/** Weeks of set-volume history reported. */
const VOLUME_WEEKS = 6;
/** Stalled or regressing lifts before a deload is worth raising. */
const DELOAD_STALL_THRESHOLD = 2;
/** And only for someone who has actually been training hard enough to need one. */
const DELOAD_MIN_WEEKS = 3;

/** Warm-ups are not the work, and counting them flatters everybody. */
const NON_WORKING_SET_TYPES = new Set(["warmup", "warm-up", "warm_up"]);

export type LiftStatus = "progressing" | "stalled" | "regressing" | "new";

export type LiftSession = {
  date: string;
  /** Best estimated 1RM across the session's working sets. */
  e1rm: number;
  topWeight: number;
  topReps: number;
  workingSets: number;
};

export type LiftAnalysis = {
  name: string;
  sessions: number;
  lastDate: string;
  status: LiftStatus;
  /** Best estimated 1RM in the window, rounded to a believable precision. */
  bestE1rm: number;
  /** Estimated 1RM of the most recent session. */
  latestE1rm: number;
  /** Percent change per week, from a least-squares fit. Null under 3 sessions. */
  trendPctPerWeek: number | null;
  /** Plain-language next step, or null when nothing needs changing. */
  suggestion: string | null;
};

export type ProgrammingSummary = {
  windowDays: number;
  totalSessions: number;
  weeklySets: Array<{ week: string; sets: number }>;
  lifts: LiftAnalysis[];
  deload: { recommended: boolean; reason: string } | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isWorkingSet(set: LoggedSet) {
  return (
    set.completed === true &&
    typeof set.weight === "number" &&
    typeof set.reps === "number" &&
    Number.isFinite(set.weight) &&
    Number.isFinite(set.reps) &&
    set.weight > 0 &&
    set.reps > 0 &&
    !NON_WORKING_SET_TYPES.has((set.type ?? "").toLowerCase())
  );
}

/**
 * Lifts are keyed by name, case- and spacing-insensitive.
 *
 * Not by exercise id: the same movement acquires new ids as it moves between
 * the catalog, a custom entry, and a preset, and a user who renamed nothing
 * would still watch their bench press split into three unrelated histories.
 */
function liftKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function daysBetweenKeys(from: string, to: string) {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Least-squares slope of estimated 1RM against time, as percent per week.
 *
 * Regression rather than first-versus-last because a single bad session at
 * either end would otherwise decide the verdict. Returns null when the
 * sessions are too few, or all on one day, to have a direction at all.
 */
function trendPctPerWeek(sessions: LiftSession[]): number | null {
  if (sessions.length < MIN_SESSIONS_FOR_STATUS) return null;

  const origin = sessions[0].date;
  const points = sessions.map((session) => ({
    x: daysBetweenKeys(origin, session.date),
    y: session.e1rm,
  }));

  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  if (meanY <= 0) return null;

  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  if (denominator === 0) return null;

  const slopePerDay = numerator / denominator;
  return round((slopePerDay * 7 * 100) / meanY, 2);
}

/**
 * The direction of a lift, decided by best-recent against best-prior.
 *
 * Deliberately not the regression slope: a lift can have a gently positive fit
 * while its last three sessions have all fallen short of a personal best set
 * six weeks ago, and "you are progressing" is the wrong thing to tell that
 * person. What matters is whether recent work has beaten what came before.
 */
function statusOf(sessions: LiftSession[]): LiftStatus {
  if (sessions.length < MIN_SESSIONS_FOR_STATUS) return "new";

  const recent = sessions.slice(-RECENT_SESSIONS);
  const prior = sessions.slice(0, -RECENT_SESSIONS);
  // Every session is recent: fall back to comparing against everything but
  // the latest, so there is still a "before" to beat.
  const priorBest =
    prior.length > 0
      ? Math.max(...prior.map((session) => session.e1rm))
      : Math.max(...sessions.slice(0, -1).map((session) => session.e1rm));
  const recentBest = Math.max(...recent.map((session) => session.e1rm));
  if (priorBest <= 0) return "new";

  if ((recentBest - priorBest) / priorBest > NOISE_BAND_PCT / 100) {
    return "progressing";
  }

  // Regression is judged on where the lift is *now* against its best in the
  // window, not on recent-versus-prior. With a short history the recent slice
  // still contains the old peak, so a lift that has fallen away from it for
  // three straight sessions would otherwise read as merely stalled — which is
  // the one reading that would let it keep falling unremarked.
  const bestOverall = Math.max(...sessions.map((session) => session.e1rm));
  const latest = sessions[sessions.length - 1].e1rm;
  if ((bestOverall - latest) / bestOverall > NOISE_BAND_PCT / 100) {
    return "regressing";
  }

  return "stalled";
}

/**
 * What to do about it, in one sentence, or nothing.
 *
 * A lift that is climbing gets no advice. Handing someone a change every week
 * for something that is working is how a coach proves it is not listening, and
 * it is the single fastest way to teach a user to ignore every suggestion.
 */
function suggestionFor(
  status: LiftStatus,
  sessions: LiftSession[],
): string | null {
  if (status === "progressing" || status === "new") return null;

  const latest = sessions[sessions.length - 1];
  const previous = sessions[sessions.length - 2];

  // Double progression, checked before the direction verdict: reps climbing at
  // a fixed load is progress whatever an older peak says. Someone who dropped
  // to 85kg and is building 6→7→8 reps back up reads as "regressing" against a
  // 100kg single from six weeks ago, and telling them to hold would be
  // punishing them for doing exactly the right thing.
  if (
    previous &&
    latest.topWeight === previous.topWeight &&
    latest.topReps > previous.topReps
  ) {
    return `Reps went up at ${latest.topWeight}. Add the smallest jump you have and start again at the bottom of the range.`;
  }

  if (status === "regressing") {
    return `Top set is down on where it was. Hold the load and check sleep and food before adding anything.`;
  }

  return `Three sessions without a new best. Try a lighter week, or swap in a close variation for a block.`;
}

// ── The summary ──────────────────────────────────────────────────────────────

/**
 * Reduces a window of logged sessions to what a coach would actually notice.
 *
 * `today` anchors the window so the caller decides what "recent" means rather
 * than inheriting the server's clock.
 */
export function summarizeProgramming(
  workouts: LoggedWorkout[],
  today: string,
  windowDays: number = PROGRAMMING_WINDOW_DAYS,
  recovery?: { status: string; notes: string[] } | null,
): ProgrammingSummary | null {
  const anchor = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(anchor)) return null;

  const earliest = new Date(anchor);
  earliest.setUTCDate(earliest.getUTCDate() - (windowDays - 1));
  const since = earliest.toISOString().slice(0, 10);

  const inWindow = workouts
    .filter((workout) => workout.date >= since && workout.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (inWindow.length === 0) return null;

  // Per lift, per session: the best working set, and how much work it took.
  const byLift = new Map<string, { name: string; sessions: LiftSession[] }>();
  const setsByWeek = new Map<string, number>();

  for (const workout of inWindow) {
    const week = isoWeekKey(weekStartOf(workout.date));

    for (const exercise of workout.exercises ?? []) {
      const name = (exercise.name ?? "").trim();
      if (!name) continue;

      const working = (exercise.sets ?? []).filter(isWorkingSet);
      if (working.length === 0) continue;

      setsByWeek.set(week, (setsByWeek.get(week) ?? 0) + working.length);

      // Cardio has weight and reps in name only; an estimated 1RM for a
      // treadmill is noise dressed as insight.
      if ((exercise.category ?? "").toLowerCase() === "cardio") continue;

      let best: LiftSession | null = null;
      for (const set of working) {
        const e1rm = estimate1RM(set.weight as number, set.reps as number);
        if (!best || e1rm > best.e1rm) {
          best = {
            date: workout.date,
            e1rm,
            topWeight: set.weight as number,
            topReps: set.reps as number,
            workingSets: working.length,
          };
        }
      }
      if (!best) continue;

      const key = liftKey(name);
      const entry = byLift.get(key) ?? { name, sessions: [] };
      // Two logs on one date (the app allows two slots) collapse into the
      // better of the two rather than counting as two sessions of progress.
      const sameDay = entry.sessions.find(
        (session) => session.date === best!.date,
      );
      if (sameDay) {
        // Preserve the accumulated set count across the overwrite:
        // Object.assign copies best.workingSets (this log's own count), and
        // adding this log's sets on top of that would double-count it.
        const accumulated = sameDay.workingSets;
        if (best.e1rm > sameDay.e1rm) Object.assign(sameDay, best);
        sameDay.workingSets = accumulated + working.length;
      } else {
        entry.sessions.push(best);
      }
      byLift.set(key, entry);
    }
  }

  const lifts: LiftAnalysis[] = [...byLift.values()]
    .map(({ name, sessions }) => {
      sessions.sort((a, b) => a.date.localeCompare(b.date));
      const status = statusOf(sessions);
      return {
        name,
        sessions: sessions.length,
        lastDate: sessions[sessions.length - 1].date,
        status,
        bestE1rm: round(Math.max(...sessions.map((s) => s.e1rm))),
        latestE1rm: round(sessions[sessions.length - 1].e1rm),
        trendPctPerWeek: trendPctPerWeek(sessions),
        suggestion: suggestionFor(status, sessions),
      };
    })
    // Most-trained first: those are the lifts the user cares about, and the
    // ones with enough history to say anything honest about.
    .sort((a, b) => b.sessions - a.sessions || b.bestE1rm - a.bestE1rm)
    .slice(0, MAX_TRACKED_LIFTS);

  const weeklySets = [...setsByWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-VOLUME_WEEKS)
    .map(([week, sets]) => ({ week, sets }));

  return {
    windowDays,
    totalSessions: inWindow.length,
    weeklySets,
    lifts,
    deload: assessDeload(lifts, weeklySets, recovery),
  };
}

/**
 * Whether to raise a deload, and the sentence justifying it.
 *
 * Conservative on purpose. Telling someone to back off is expensive advice: it
 * costs them a week of training if it is wrong, and costs them their trust if
 * it arrives every Sunday. So it needs several lifts genuinely stuck *and* a
 * few weeks of real volume behind them — a beginner who missed a rep is not
 * overreached, they are a beginner.
 */
export function assessDeload(
  lifts: LiftAnalysis[],
  weeklySets: Array<{ week: string; sets: number }>,
  /**
   * Measured recovery, when the user's watch supplies it.
   *
   * A stall is ambiguous on its own: it could be a programme that has run its
   * course, or a person who has not slept properly in a fortnight. Those want
   * opposite responses, and until this argument existed the coach had no way
   * to tell them apart.
   */
  recovery?: { status: string; notes: string[] } | null,
): { recommended: boolean; reason: string } | null {
  const tracked = lifts.filter((lift) => lift.status !== "new");
  if (tracked.length === 0) return null;

  const stuck = tracked.filter(
    (lift) => lift.status === "stalled" || lift.status === "regressing",
  );
  const weeksTrained = weeklySets.filter((week) => week.sets > 0).length;
  const compromised = recovery?.status === "compromised";

  // Measured recovery trouble lowers the bar to a single stuck lift. It never
  // removes it: someone sleeping badly who is still adding weight to the bar
  // does not need to be told to stop, and would rightly resent being told.
  const threshold = compromised ? 1 : DELOAD_STALL_THRESHOLD;

  if (stuck.length < threshold || weeksTrained < DELOAD_MIN_WEEKS) {
    return { recommended: false, reason: "" };
  }

  const regressing = stuck.filter((lift) => lift.status === "regressing").length;
  const names = stuck
    .slice(0, 3)
    .map((lift) => lift.name)
    .join(", ");

  const training =
    regressing > 0
      ? `${stuck.length} ${stuck.length === 1 ? "lift is" : "lifts are"} stuck and ${regressing} going backwards (${names}) after ${weeksTrained} weeks of steady volume.`
      : `${stuck.length} ${stuck.length === 1 ? "lift has" : "lifts have"} stalled (${names}) across ${weeksTrained} weeks of steady volume.`;

  // The recovery sentence goes second: the training evidence is what the user
  // can see for themselves, and leading with a heart-rate statistic to justify
  // taking a week off reads like an app looking for a reason.
  const recoveryNote = compromised ? recovery?.notes[0] : undefined;

  return {
    recommended: true,
    reason: recoveryNote ? `${training} ${recoveryNote}` : training,
  };
}
