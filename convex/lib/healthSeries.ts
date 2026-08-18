/**
 * Daily readings, reshaped into something you can draw.
 *
 * The scoring in `./healthScore` answers "how am I doing"; this answers "and
 * is that better or worse than it was", which needs history rather than a
 * verdict. Everything here is pure so the bucketing and the period-over-period
 * arithmetic can be tested without a database.
 *
 * Two rules run through all of it. Missing days stay missing — a day with no
 * reading is a gap in the chart, never a zero, because a watch left on the
 * charger is not a day of no sleep. And every comparison is against the same
 * person's immediately preceding period of the same length, so a monthly
 * average is judged against last month rather than against a population.
 */

import {
  RECOVERY_WINDOW_DAYS,
  summarizeRecovery,
  type DailyMetrics,
} from "./recovery";
import { recoveryScore } from "./healthScore";

export type HealthRange = "W" | "M" | "Y";

/** Days shown for each range. A year is 52 whole weeks, not 365 ragged days. */
export const RANGE_DAYS: Record<HealthRange, number> = {
  W: 7,
  M: 30,
  Y: 364,
};

/** Ranges past this length are averaged into weekly buckets to stay legible. */
const WEEKLY_BUCKET_FROM_DAYS = 90;

export type HealthMetricId =
  | "sleep"
  | "recovery"
  | "steps"
  | "energy"
  | "hrv"
  | "restingHeartRate"
  | "exercise";

export type SeriesPoint = {
  /** The day, or the first day of the bucket. */
  date: string;
  /** Days folded into this point. 1 for daily ranges. */
  span: number;
  /** null means nothing was recorded — draw a gap, not a floor. */
  value: number | null;
};

export type MetricSeries = {
  id: HealthMetricId;
  label: string;
  unit: string;
  /** Which direction counts as improvement, for colouring the delta. */
  betterWhen: "higher" | "lower";
  points: SeriesPoint[];
  /** Mean over the range, ignoring gaps. */
  average: number | null;
  /** The same mean over the preceding period of equal length. */
  previousAverage: number | null;
  /** Signed change against `previousAverage`, as a percentage. */
  deltaPercent: number | null;
  /** Most recent reading in the range. */
  latest: number | null;
  /** Best and worst readings, for the chart's scale and its callouts. */
  min: number | null;
  max: number | null;
};

const METRIC_META: Record<
  HealthMetricId,
  { label: string; unit: string; betterWhen: "higher" | "lower" }
> = {
  sleep: { label: "Sleep", unit: "min", betterWhen: "higher" },
  recovery: { label: "Recovery score", unit: "", betterWhen: "higher" },
  steps: { label: "Steps", unit: "", betterWhen: "higher" },
  energy: { label: "Active calories", unit: "kcal", betterWhen: "higher" },
  hrv: { label: "Heart rate variability", unit: "ms", betterWhen: "higher" },
  restingHeartRate: {
    label: "Resting heart rate",
    unit: "bpm",
    betterWhen: "lower",
  },
  exercise: { label: "Exercise minutes", unit: "min", betterWhen: "higher" },
};

/** YYYY-MM-DD arithmetic, anchored at noon so DST cannot shift the day. */
export function shiftDate(date: string, days: number) {
  const anchor = new Date(`${date}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** Every date from `start` to `end` inclusive, oldest first. */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function mean(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, places = 1) {
  if (value === null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * The recovery score as it would have read on each day.
 *
 * Recomputed per day against only the readings that existed up to that day,
 * rather than against the whole history. Using the full window would let a
 * good month retroactively improve a bad Tuesday, and the chart would stop
 * matching what the app actually told the person at the time.
 */
export function recoveryScoreByDate(
  rows: DailyMetrics[],
  dates: string[],
): Record<string, number> {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const scores: Record<string, number> = {};

  for (const date of dates) {
    const since = shiftDate(date, -(RECOVERY_WINDOW_DAYS - 1));
    const window = sorted.filter(
      (row) => row.date >= since && row.date <= date,
    );
    if (window.length === 0) continue;
    const score = recoveryScore(summarizeRecovery(window, date));
    if (score !== null) scores[date] = score;
  }

  return scores;
}

/**
 * Folds a day-keyed lookup into the points a chart draws.
 *
 * Buckets are averages rather than sums even for counted things like steps,
 * because a bucket with two missing days would otherwise read as a collapse
 * rather than as a partial week.
 */
function pointsFor(
  dates: string[],
  valueFor: (date: string) => number | null,
  bucketDays: number,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];

  for (let index = 0; index < dates.length; index += bucketDays) {
    const bucket = dates.slice(index, index + bucketDays);
    const values = bucket
      .map(valueFor)
      .filter((value): value is number => value !== null);
    points.push({
      date: bucket[0],
      span: bucket.length,
      value: round(mean(values)),
    });
  }

  return points;
}

export type HealthSeriesInput = {
  /** Rows covering the range *and* the preceding comparison period. */
  rows: DailyMetrics[];
  exerciseMinutesByDate: Record<string, number>;
  today: string;
  range: HealthRange;
};

/**
 * One series per metric, plus the comparison against the previous period.
 *
 * Returns every metric even when a metric has no readings at all — a chart
 * that vanishes when the data does leaves the person wondering whether the
 * feature broke. An all-null series renders as "nothing recorded", which is
 * an answer.
 */
export function buildHealthSeries({
  rows,
  exerciseMinutesByDate,
  today,
  range,
}: HealthSeriesInput): {
  range: HealthRange;
  start: string;
  end: string;
  bucketDays: number;
  metrics: Record<HealthMetricId, MetricSeries>;
} {
  const days = RANGE_DAYS[range];
  const start = shiftDate(today, -(days - 1));
  const previousStart = shiftDate(start, -days);
  const previousEnd = shiftDate(start, -1);
  const bucketDays = days >= WEEKLY_BUCKET_FROM_DAYS ? 7 : 1;

  const dates = dateRange(start, today);
  const previousDates = dateRange(previousStart, previousEnd);

  const byDate = new Map(rows.map((row) => [row.date, row]));
  // Recovery needs its own baseline history, so it is computed across both
  // periods at once rather than per period.
  const recoveries = recoveryScoreByDate(rows, [...previousDates, ...dates]);

  const readers: Record<HealthMetricId, (date: string) => number | null> = {
    sleep: (date) => byDate.get(date)?.sleepMinutes ?? null,
    steps: (date) => byDate.get(date)?.steps ?? null,
    energy: (date) => byDate.get(date)?.activeEnergyKcal ?? null,
    hrv: (date) => byDate.get(date)?.hrvMs ?? null,
    restingHeartRate: (date) =>
      byDate.get(date)?.restingHeartRateBpm ?? null,
    recovery: (date) => recoveries[date] ?? null,
    // Exercise is the one metric where an absent day is a real zero: the
    // health store records every session, so "no row" means "did not train".
    exercise: (date) =>
      byDate.has(date) || exerciseMinutesByDate[date] !== undefined
        ? Math.round(exerciseMinutesByDate[date] ?? 0)
        : null,
  };

  const metrics = {} as Record<HealthMetricId, MetricSeries>;

  for (const id of Object.keys(METRIC_META) as HealthMetricId[]) {
    const read = readers[id];
    const points = pointsFor(dates, read, bucketDays);
    const current = dates
      .map(read)
      .filter((value): value is number => value !== null);
    const previous = previousDates
      .map(read)
      .filter((value): value is number => value !== null);

    const average = mean(current);
    const previousAverage = mean(previous);
    const deltaPercent =
      average === null || previousAverage === null || previousAverage === 0
        ? null
        : ((average - previousAverage) / previousAverage) * 100;

    const latest = [...dates]
      .reverse()
      .map(read)
      .find((value) => value !== null);

    metrics[id] = {
      id,
      ...METRIC_META[id],
      points,
      average: round(average),
      previousAverage: round(previousAverage),
      deltaPercent: round(deltaPercent),
      latest: latest ?? null,
      min: current.length > 0 ? Math.min(...current) : null,
      max: current.length > 0 ? Math.max(...current) : null,
    };
  }

  return { range, start, end: today, bucketDays, metrics };
}
