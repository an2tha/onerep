/**
 * Scores custom metrics without pretending to be a doctor.
 *
 * Start with what this file refuses to do, because that is the whole design.
 * It will not invent a threshold. There is no number in here that says a blood
 * glucose of 5.4 is good and 7.1 is bad, no respiratory rate band, no "healthy"
 * SpO2 floor. Those figures exist in the literature attached to an age, a
 * medication list, a time since the last meal and a clinician who has met you,
 * and none of that is available here. An app that ships them anyway is not
 * being helpful; it is telling someone their body is failing on the strength of
 * a number it read off a watch and a constant a developer typed at midnight.
 *
 * `healthScore.ts` grades habits against public guidance — 150 minutes a week,
 * seven hours a night — and it is right to, because those are behaviours with
 * published targets. `recovery.ts` grades measurements against the same
 * person's own last month, and it is right to, because a resting heart rate is
 * only legible as a deviation from your own. Custom metrics are the second
 * kind, so this file follows `recovery.ts`.
 *
 * Two ways a custom metric earns a score, and no third:
 *
 *   1. The user set a `target`. Then there is a stated goal, supplied by the
 *      only person entitled to state one, and distance from it is scorable.
 *   2. No target, but enough history for a baseline. Then the score is
 *      stability — how close the last few readings sit to this person's own
 *      median. It makes no claim about which direction is better, because it
 *      does not know and will not guess.
 *
 * Anything else scores `null`. Not zero. A dial with no readings has to render
 * as "no reading"; a zero is a grade, and it is one the user did not earn.
 */

/** Days of history a baseline is drawn from. Matches `recovery.ts`. */
export const CUSTOM_METRIC_WINDOW_DAYS = 28;
/** Readings averaged into "where this sits right now". */
const RECENT_DAYS = 3;
/** Below this many readings a baseline is an opinion, not a measurement. */
const MIN_BASELINE_READINGS = 7;

/**
 * Relative deviation from baseline that scores zero.
 *
 * Deliberately loose. Half of these metrics are things that swing wildly by
 * the hour — glucose after lunch, body temperature after a bath — and a curve
 * tight enough to be interesting on weight would report a five-alarm fire on
 * all of them. 50% off your own median is the point at which something has
 * genuinely changed rather than merely varied.
 */
const BASELINE_ZERO_AT = 0.5;

/**
 * Relative distance from a stated target that scores zero.
 *
 * Tighter than the baseline curve because a target is a thing someone chose to
 * aim at, and missing it by double should not still read as a pass.
 */
const TARGET_ZERO_AT = 1;

export type CustomMetricEntry = {
  /** Local day key, `YYYY-MM-DD`. */
  date: string;
  value: number;
};

export type CustomMetricInput = {
  metricId: string;
  title: string;
  unit: string;
  /** `counter` and `toggle` accumulate; `number` is a measurement. */
  kind: "counter" | "number" | "toggle";
  target?: number;
  healthMetricKey?: string;
  tab?: string;
  /** Any order; this file sorts and windows them itself. */
  entries: CustomMetricEntry[];
};

/** How a score was arrived at, so the UI never has to guess what it means. */
export type CustomMetricBasis = "target" | "baseline";

export type ScoredCustomMetric = {
  metricId: string;
  title: string;
  unit: string;
  target: number | null;
  healthMetricKey: string | null;
  /** Newest reading in the window, or null when there is none. */
  latest: { date: string; value: number } | null;
  /** Mean of the most recent readings, the figure the score is computed on. */
  recent: number | null;
  /** Median across the window. Median, so one bad week does not move it. */
  baseline: number | null;
  /** Readings inside the window. */
  readings: number;
  /** 0–100, or null when nothing here can be scored honestly. */
  score: number | null;
  basis: CustomMetricBasis | null;
  /** Whether the window carried a single reading. Drives dial vs Trends. */
  hasData: boolean;
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

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** The day `days` before `date`, on the local calendar the key describes. */
export function shiftDayKey(date: string, days: number) {
  const anchor = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(anchor)) return date;
  const shifted = new Date(anchor);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Distance from a target, as a score.
 *
 * Symmetric by default, which is the unintuitive part. For a step count you
 * would forgive an overshoot, but this file does not know whether a target is a
 * floor (protein) or a ceiling (caffeine, sodium, alcohol), and guessing wrong
 * means congratulating someone for triple the sodium they asked to stay under.
 * The one safe exception is `kind`: a counter counts things a person did, and
 * doing more of a thing you set out to do is not a miss. That comes from the
 * data model rather than from an opinion about the substance being counted.
 */
function targetScore(value: number, target: number, kind: string) {
  if (!Number.isFinite(target) || target === 0) return null;
  const error = (value - target) / Math.abs(target);
  const overshoot = error > 0;
  if (overshoot && (kind === "counter" || kind === "toggle")) return 100;
  return clamp(100 * (1 - Math.abs(error) / TARGET_ZERO_AT));
}

/**
 * Distance from the person's own median, as a score.
 *
 * 100 means "where you normally are", which is the only honest reading of a
 * number nobody has a target for. It is explicitly not a health claim: someone
 * whose glucose is consistently high scores 100 here, exactly as
 * `summarizeRecovery` gives a settled five-hour sleeper an untroubled read-out.
 * That limit is stated on the dial rather than papered over with a threshold
 * this app has no standing to set.
 */
function baselineScore(recent: number, baseline: number) {
  if (baseline === 0) return null;
  const drift = Math.abs(recent - baseline) / Math.abs(baseline);
  return clamp(100 * (1 - drift / BASELINE_ZERO_AT));
}

/** One metric's window, reduced to a score and the numbers behind it. */
export function scoreCustomMetric(
  metric: CustomMetricInput,
  today: string,
  windowDays: number = CUSTOM_METRIC_WINDOW_DAYS,
): ScoredCustomMetric {
  const since = shiftDayKey(today, -(windowDays - 1));
  const entries = metric.entries
    .filter(
      (entry) =>
        Number.isFinite(entry.value) &&
        entry.date >= since &&
        entry.date <= today,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const base: ScoredCustomMetric = {
    metricId: metric.metricId,
    title: metric.title,
    unit: metric.unit,
    target: metric.target ?? null,
    healthMetricKey: metric.healthMetricKey ?? null,
    latest: null,
    recent: null,
    baseline: null,
    readings: entries.length,
    score: null,
    basis: null,
    hasData: entries.length > 0,
  };
  if (entries.length === 0) return base;

  const last = entries[entries.length - 1];
  base.latest = { date: last.date, value: last.value };

  const values = entries.map((entry) => entry.value);
  const recent = mean(values.slice(-RECENT_DAYS));
  base.recent = recent === null ? null : round(recent);

  // A target scores from the first reading. Waiting for seven would leave a
  // user who set a goal on Monday staring at "no reading" on Tuesday, which
  // reads as the app having lost the number they just typed.
  if (metric.target !== undefined && recent !== null) {
    const score = targetScore(recent, metric.target, metric.kind);
    if (score !== null) {
      base.score = Math.round(score);
      base.basis = "target";
    }
  }

  if (entries.length >= MIN_BASELINE_READINGS) {
    const baseline = median(values);
    if (baseline !== null) base.baseline = round(baseline);
    // Baseline fills in only where no target did. A goal the user stated beats
    // a habit the app inferred.
    if (base.score === null && baseline !== null && recent !== null) {
      const score = baselineScore(recent, baseline);
      if (score !== null) {
        base.score = Math.round(score);
        base.basis = "baseline";
      }
    }
  }

  return base;
}

export type ScoredDial = {
  dial: string;
  /** 0–100, or null when not one metric under it could be scored. */
  score: number | null;
  /** True when any metric under it carried a reading in the window. */
  hasData: boolean;
  metrics: ScoredCustomMetric[];
};

/**
 * Rolls the metrics filed under one dial into a single ring.
 *
 * An unweighted mean over the scorable ones. Weighting would mean ranking a
 * user's own metrics against each other, and the app has no basis for saying
 * their glucose matters more than their hydration. Metrics that could not be
 * scored are left out of the mean rather than counted as zero — an unscorable
 * metric is a gap in the evidence, not a bad result.
 */
export function scoreDial(
  dial: string,
  metrics: ScoredCustomMetric[],
): ScoredDial {
  const scores = metrics
    .map((metric) => metric.score)
    .filter((score): score is number => score !== null);
  return {
    dial,
    score: scores.length === 0 ? null : Math.round(mean(scores) as number),
    hasData: metrics.some((metric) => metric.hasData),
    metrics,
  };
}
