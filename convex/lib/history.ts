/**
 * The long view: months, not days.
 *
 * The workspace's raw windows are two weeks of food and twelve of training,
 * which is the right size for answering "what should I do on Thursday" and
 * useless for "am I actually getting anywhere". A human coach carries a year in
 * their head; ours carried a fortnight. This is the cheap version of the
 * difference — a handful of precomputed monthly rows, each one a few hundred
 * characters, covering half a year.
 *
 * Precomputed rather than derived on read, because deriving it would mean
 * pulling six months of food logs into every single coach turn. A month's
 * numbers stop changing once the month ends, so computing them once and
 * storing the result is both cheaper and, for closed months, exactly as
 * correct.
 */

export type HistoryFoodDay = {
  date: string;
  entries?: Array<{ calories?: number; protein?: number }>;
};

export type HistoryWorkout = {
  date: string;
  exercises?: Array<{ sets?: Array<{ completed?: boolean; type?: string }> }>;
};

export type HistoryMeasurement = {
  loggedAt: string;
  weightKg?: number;
};

export type MonthSummary = {
  /** `YYYY-MM`. */
  month: string;
  sessions: number;
  activeDays: number;
  sets: number;
  loggedFoodDays: number;
  daysInMonth: number;
  avgCalories: number | null;
  avgProtein: number | null;
  weightStartKg: number | null;
  weightEndKg: number | null;
};

/** Months of history carried into the workspace. */
export const HISTORY_MONTHS = 6;

const NON_WORKING_SET_TYPES = new Set(["warmup", "warm-up", "warm_up"]);

export function monthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function daysInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return 30;
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}

/** The `HISTORY_MONTHS` month keys ending with the one containing `today`. */
export function recentMonthKeys(today: string, count = HISTORY_MONTHS) {
  const anchor = new Date(`${today}T12:00:00Z`);
  const keys: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - index, 1),
    );
    keys.push(date.toISOString().slice(0, 7));
  }
  return keys;
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

/**
 * Reduces one calendar month of raw rows to a single summary.
 *
 * Callers pass only that month's rows; filtering happens here anyway so a
 * sloppy query cannot quietly inflate a month with its neighbours.
 */
export function summarizeMonth({
  month,
  foodDays,
  workouts,
  measurements,
}: {
  month: string;
  foodDays: HistoryFoodDay[];
  workouts: HistoryWorkout[];
  measurements: HistoryMeasurement[];
}): MonthSummary {
  const monthFood = foodDays.filter(
    (day) => monthKey(day.date) === month && (day.entries?.length ?? 0) > 0,
  );
  const monthWorkouts = workouts.filter(
    (workout) => monthKey(workout.date) === month,
  );

  const dailyCalories: number[] = [];
  const dailyProtein: number[] = [];
  for (const day of monthFood) {
    let calories = 0;
    let protein = 0;
    for (const entry of day.entries ?? []) {
      calories += entry.calories ?? 0;
      protein += entry.protein ?? 0;
    }
    dailyCalories.push(calories);
    dailyProtein.push(protein);
  }

  let sets = 0;
  for (const workout of monthWorkouts) {
    for (const exercise of workout.exercises ?? []) {
      for (const set of exercise.sets ?? []) {
        if (
          set.completed === true &&
          !NON_WORKING_SET_TYPES.has((set.type ?? "").toLowerCase())
        ) {
          sets += 1;
        }
      }
    }
  }

  // Weights are ordered by their own timestamp rather than assumed sorted: the
  // month's first and last readings are the whole point of the field, and a
  // backdated entry would otherwise reverse the trend.
  const monthWeights = measurements
    .filter(
      (entry) =>
        monthKey(entry.loggedAt.slice(0, 10)) === month &&
        typeof entry.weightKg === "number",
    )
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  return {
    month,
    sessions: monthWorkouts.length,
    activeDays: new Set(monthWorkouts.map((workout) => workout.date)).size,
    sets,
    loggedFoodDays: monthFood.length,
    daysInMonth: daysInMonth(month),
    avgCalories: average(dailyCalories),
    avgProtein: average(dailyProtein),
    weightStartKg:
      monthWeights.length > 0
        ? round(monthWeights[0].weightKg as number)
        : null,
    weightEndKg:
      monthWeights.length > 0
        ? round(monthWeights[monthWeights.length - 1].weightKg as number)
        : null,
  };
}

export type HistoryBlock = {
  months: MonthSummary[];
  /** Kilograms per month across the span, or null without two readings. */
  weightTrendKgPerMonth: number | null;
  /** Fraction of days logged across the span, 0–1. */
  loggingConsistency: number | null;
};

/**
 * The block handed to the model.
 *
 * Months with nothing in them are dropped rather than shown as zeros: a gap in
 * someone's history is not the same as a month they trained zero times, and
 * only one of those is worth a coach mentioning.
 */
export function buildHistoryBlock(
  summaries: MonthSummary[],
): HistoryBlock | null {
  const months = summaries
    .filter(
      (summary) =>
        summary.sessions > 0 ||
        summary.loggedFoodDays > 0 ||
        summary.weightEndKg !== null,
    )
    .sort((a, b) => a.month.localeCompare(b.month));

  if (months.length === 0) return null;

  const weighed = months.filter((summary) => summary.weightEndKg !== null);
  const first = weighed[0];
  const last = weighed[weighed.length - 1];
  const span = weighed.length > 1 ? monthsBetween(first.month, last.month) : 0;

  const weightTrendKgPerMonth =
    span > 0 && first.weightStartKg !== null && last.weightEndKg !== null
      ? round((last.weightEndKg - first.weightStartKg) / span, 2)
      : null;

  const totalDays = months.reduce(
    (sum, summary) => sum + summary.daysInMonth,
    0,
  );
  const loggedDays = months.reduce(
    (sum, summary) => sum + summary.loggedFoodDays,
    0,
  );

  return {
    months,
    weightTrendKgPerMonth,
    loggingConsistency: totalDays > 0 ? round(loggedDays / totalDays, 2) : null,
  };
}

function monthsBetween(from: string, to: string) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}
