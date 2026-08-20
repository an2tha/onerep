/**
 * Recovery, read from the sensors rather than from a mood.
 *
 * The coach has always been told to go conservative when recovery is poor. It
 * simply never knew: sleep reached it as a 1–5 self-report inside a check-in
 * most people never filled in, and the actual measurements sat on the phone
 * unasked. This turns a month of daily rows into the two or three sentences a
 * coach would actually say — you are down an hour a night, your resting heart
 * rate is up four beats — and nothing more.
 *
 * Everything here compares a person against themselves. Population norms for
 * resting heart rate and HRV are close to meaningless individually; the signal
 * is the deviation from someone's own baseline, which is why nothing in this
 * file contains a threshold like "below 60bpm is good".
 */

export type DailyMetrics = {
  date: string;
  sleepMinutes?: number;
  steps?: number;
  restingHeartRateBpm?: number;
  hrvMs?: number;
  /** Read by the health score rather than by the recovery summary. */
  activeEnergyKcal?: number;
  /**
   * Fields on this day the user pinned by hand. Carried through the projection
   * purely so the client can label them: without it the edit sheet forgets
   * which numbers were corrections the moment the app restarts, and offers to
   * "use synced" on a figure that already is.
   *
   * The scoring never reads this — an overridden number is just a number.
   */
  manualFields?: string[];
};

/** Days of history the baseline is drawn from. */
export const RECOVERY_WINDOW_DAYS = 28;
/** Days averaged into "how things are right now". */
const RECENT_DAYS = 3;
/** Below this many readings a baseline is an opinion, not a measurement. */
const MIN_BASELINE_READINGS = 7;

/**
 * How far a signal must move before it is worth mentioning.
 *
 * Sleep in minutes, the rest as a fraction of baseline. These are deliberately
 * wide: night-to-night variation is enormous, and an app that announces a
 * recovery problem every time someone stays up late is an app that gets its
 * notifications turned off.
 */
const SLEEP_DEFICIT_MINUTES = 45;
const RHR_ELEVATED_FRACTION = 0.05;
const HRV_SUPPRESSED_FRACTION = 0.1;
/** Whatever the baseline says, this little sleep is worth raising on its own. */
const SLEEP_FLOOR_MINUTES = 6 * 60;

export type RecoverySignal = {
  /** Mean over the most recent readings. */
  recent: number;
  /** Median over the window — median because one flu week should not move it. */
  baseline: number;
  /** recent − baseline, in the signal's own units. */
  delta: number;
  readings: number;
};

export type RecoveryStatus = "ready" | "steady" | "compromised" | "unknown";

export type RecoverySummary = {
  windowDays: number;
  days: number;
  status: RecoveryStatus;
  /** Plain sentences, already phrased for a human. At most three. */
  notes: string[];
  sleep: RecoverySignal | null;
  restingHeartRate: RecoverySignal | null;
  hrv: RecoverySignal | null;
  steps: RecoverySignal | null;
};

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * One signal's recent-versus-baseline reading.
 *
 * The baseline deliberately includes the recent days. Excluding them would
 * make a slow drift invisible — someone sleeping progressively worse for three
 * weeks would compare each bad week against the slightly-less-bad one before
 * it and never trip anything.
 */
function signalFor(
  rows: DailyMetrics[],
  pick: (row: DailyMetrics) => number | undefined,
): RecoverySignal | null {
  const values: Array<{ date: string; value: number }> = [];
  for (const row of rows) {
    const value = pick(row);
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      values.push({ date: row.date, value });
    }
  }
  if (values.length < MIN_BASELINE_READINGS) return null;

  values.sort((a, b) => a.date.localeCompare(b.date));
  const baseline = median(values.map((entry) => entry.value));
  const recent = mean(
    values.slice(-RECENT_DAYS).map((entry) => entry.value),
  );
  if (baseline === null || recent === null || baseline <= 0) return null;

  return {
    recent: round(recent),
    baseline: round(baseline),
    delta: round(recent - baseline),
    readings: values.length,
  };
}

function hours(minutes: number) {
  const whole = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.round(Math.abs(minutes) % 60);
  if (whole === 0) return `${rest}m`;
  return rest === 0 ? `${whole}h` : `${whole}h ${rest}m`;
}

/**
 * Reduces a window of daily readings to a verdict and a few sentences.
 *
 * Returns null rather than a shrug when there is nothing to say. A `status` of
 * "unknown" means readings exist but none of them cleared the minimum needed
 * to have a baseline — different from having no watch at all, and worth
 * distinguishing so the coach does not claim to have looked.
 */
export function summarizeRecovery(
  rows: DailyMetrics[],
  today: string,
  windowDays: number = RECOVERY_WINDOW_DAYS,
): RecoverySummary | null {
  const anchor = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(anchor)) return null;

  const earliest = new Date(anchor);
  earliest.setUTCDate(earliest.getUTCDate() - (windowDays - 1));
  const since = earliest.toISOString().slice(0, 10);

  const inWindow = rows
    .filter((row) => row.date >= since && row.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (inWindow.length === 0) return null;

  const sleep = signalFor(inWindow, (row) => row.sleepMinutes);
  const restingHeartRate = signalFor(
    inWindow,
    (row) => row.restingHeartRateBpm,
  );
  const hrv = signalFor(inWindow, (row) => row.hrvMs);
  const steps = signalFor(inWindow, (row) => row.steps);

  const notes: string[] = [];
  let strain = 0;

  if (sleep) {
    if (sleep.delta <= -SLEEP_DEFICIT_MINUTES) {
      strain += 1;
      notes.push(
        `Sleeping ${hours(sleep.delta)} less than usual over the last few nights.`,
      );
    } else if (sleep.recent < SLEEP_FLOOR_MINUTES) {
      strain += 1;
      notes.push(
        `Averaging ${hours(sleep.recent)} a night, which is short however you slice it.`,
      );
    }
  }

  if (restingHeartRate) {
    const rise = restingHeartRate.delta / restingHeartRate.baseline;
    if (rise >= RHR_ELEVATED_FRACTION) {
      strain += 1;
      notes.push(
        `Resting heart rate is up ${Math.round(restingHeartRate.delta)}bpm on your normal.`,
      );
    }
  }

  if (hrv) {
    const drop = -hrv.delta / hrv.baseline;
    if (drop >= HRV_SUPPRESSED_FRACTION) {
      strain += 1;
      notes.push(
        `Heart rate variability is ${Math.round(drop * 100)}% below your baseline.`,
      );
    }
  }

  const measured = [sleep, restingHeartRate, hrv].filter(
    (signal) => signal !== null,
  ).length;

  // Two independent signals pointing the same way is a pattern. One is a bad
  // night, and saying "compromised" over a bad night is how this feature earns
  // its way into the list of things people ignore.
  const status: RecoveryStatus =
    measured === 0
      ? "unknown"
      : strain >= 2
        ? "compromised"
        : strain === 1
          ? "steady"
          : "ready";

  return {
    windowDays,
    days: inWindow.length,
    status,
    notes: notes.slice(0, 3),
    sleep,
    restingHeartRate,
    hrv,
    steps,
  };
}
