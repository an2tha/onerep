/**
 * The one list of health signals the app knows about.
 *
 * Four things have to agree on this set: the native plugins decide which record
 * types to request permission for, the sync decides what to upload, Settings
 * draws a switch per entry, and the MCP tools expose them for reading and
 * editing. When those drifted apart the symptom was a metric a user could turn
 * on and never receive, so they all read this file instead.
 *
 * This is the list of daily values the sync reads and the `healthMetrics` table
 * stores a column for, which is narrower than the set of things the app treats
 * as first-class. Exercise minutes is the one that catches people out: it is
 * scored, it has a dial, and it is deliberately absent here, because its
 * minutes are summed from workout sessions in `healthWorkouts` rather than read
 * as a per-day figure. An entry for it would draw a switch that turns nothing
 * off. See its note in `platformHealthMetrics.ts`.
 *
 * `sane` bounds are the same idea as the ones in `logs/healthMetrics.ts`: a
 * health store aggregates third-party apps, and one badly-behaved writer must
 * not be able to poison a baseline. Out of range drops the field, never the day.
 */

import { platformMetric } from "./platformHealthMetrics";

export type HealthMetricGroup = "activity" | "recovery" | "body";

export type HealthMetricDefinition = {
  key: string;
  label: string;
  /** What the number means, shown under the switch in Settings. */
  detail: string;
  group: HealthMetricGroup;
  unit: string;
  min: number;
  max: number;
  /**
   * Body metrics land on a check-in rather than the daily recovery row, so a
   * weight read from the watch shows up in the same place a typed one does.
   */
  target: "daily" | "measurement";
  /** Off by default when the signal is intimate rather than merely personal. */
  defaultEnabled: boolean;
};

export const HEALTH_METRICS: HealthMetricDefinition[] = [
  {
    key: "steps",
    label: "Steps",
    detail: "Daily step count",
    group: "activity",
    unit: "steps",
    min: 0,
    max: 200000,
    target: "daily",
    defaultEnabled: true,
  },
  {
    key: "activeEnergyKcal",
    label: "Active calories",
    detail: "Energy burned beyond resting",
    group: "activity",
    unit: "kcal",
    min: 0,
    max: 20000,
    target: "daily",
    defaultEnabled: true,
  },
  {
    key: "sleepMinutes",
    label: "Sleep",
    detail: "Time asleep, credited to the waking day",
    group: "recovery",
    unit: "min",
    min: 0,
    max: 1440,
    target: "daily",
    defaultEnabled: true,
  },
  {
    key: "restingHeartRateBpm",
    label: "Resting heart rate",
    detail: "Averaged across the day's readings",
    group: "recovery",
    unit: "bpm",
    min: 20,
    max: 200,
    target: "daily",
    defaultEnabled: true,
  },
  {
    key: "hrvMs",
    label: "Heart rate variability",
    detail: "RMSSD, averaged across the day",
    group: "recovery",
    unit: "ms",
    min: 1,
    max: 500,
    target: "daily",
    defaultEnabled: true,
  },
  {
    key: "weightKg",
    label: "Weight",
    detail: "Scale readings, added to your check-ins",
    group: "body",
    unit: "kg",
    min: 20,
    max: 500,
    target: "measurement",
    defaultEnabled: true,
  },
  {
    key: "bodyFatPct",
    label: "Body fat",
    detail: "Percentage from a smart scale or caliper entry",
    group: "body",
    unit: "%",
    min: 1,
    max: 75,
    target: "measurement",
    defaultEnabled: true,
  },
  {
    key: "leanBodyMassKg",
    label: "Lean body mass",
    detail: "Everything that is not fat",
    group: "body",
    unit: "kg",
    min: 10,
    max: 300,
    target: "measurement",
    defaultEnabled: false,
  },
  {
    key: "boneMassKg",
    label: "Bone mass",
    detail: "Reported by some smart scales",
    group: "body",
    unit: "kg",
    min: 0.5,
    max: 20,
    target: "measurement",
    defaultEnabled: false,
  },
  {
    key: "basalMetabolicRateKcal",
    label: "Basal metabolic rate",
    detail: "Resting energy, used to sanity-check your targets",
    group: "body",
    unit: "kcal",
    min: 500,
    max: 6000,
    target: "measurement",
    defaultEnabled: false,
  },
];

export const HEALTH_METRIC_KEYS = HEALTH_METRICS.map((metric) => metric.key);

const BY_KEY = new Map(HEALTH_METRICS.map((metric) => [metric.key, metric]));

export function healthMetric(key: string): HealthMetricDefinition | undefined {
  return BY_KEY.get(key);
}

export const HEALTH_METRIC_GROUP_LABELS: Record<HealthMetricGroup, string> = {
  activity: "Activity",
  recovery: "Recovery",
  body: "Body",
};

/** Groups in display order, each with its metrics in catalogue order. */
export function healthMetricGroups(): {
  group: HealthMetricGroup;
  label: string;
  metrics: HealthMetricDefinition[];
}[] {
  const order: HealthMetricGroup[] = ["activity", "recovery", "body"];
  return order.map((group) => ({
    group,
    label: HEALTH_METRIC_GROUP_LABELS[group],
    metrics: HEALTH_METRICS.filter((metric) => metric.group === group),
  }));
}

export function defaultHealthMetricSelection(): Record<string, boolean> {
  return Object.fromEntries(
    HEALTH_METRICS.map((metric) => [metric.key, metric.defaultEnabled]),
  );
}

/**
 * A stored selection merged over the defaults.
 *
 * Absent keys take the default rather than counting as off, so a metric added
 * in a later release turns itself on for people who never opened this screen —
 * and one they explicitly switched off stays off.
 */
export function resolveHealthMetricSelection(
  stored: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const resolved = defaultHealthMetricSelection();
  if (!stored) return resolved;
  for (const [key, enabled] of Object.entries(stored)) {
    if (key in resolved) resolved[key] = enabled === true;
  }
  return resolved;
}

export function enabledHealthMetricKeys(
  stored: Record<string, boolean> | undefined,
): string[] {
  const resolved = resolveHealthMetricSelection(stored);
  return HEALTH_METRIC_KEYS.filter((key) => resolved[key]);
}

/** Drops a reading the catalogue says a sensor could not have produced. */
export function saneHealthMetric(
  key: string,
  value: number | undefined,
): number | undefined {
  const metric = BY_KEY.get(key);
  if (!metric) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < metric.min || value > metric.max) return undefined;
  return value;
}

/**
 * The areas the Health hero can show a dial for.
 *
 * Separate from the metric catalogue above: a dial is a screen you can open,
 * not a signal read off the phone. "Body" has no score and no target — there
 * is no honest number to grade a weight against — so it draws its latest
 * reading rather than a ring.
 */
export type HealthDialDefinition = {
  key: string;
  label: string;
  detail: string;
  route: string;
  defaultEnabled: boolean;
};

export const HEALTH_DIALS: HealthDialDefinition[] = [
  {
    key: "recovery",
    label: "Recovery",
    detail: "Whether today is a day to push",
    route: "/health/recovery",
    defaultEnabled: true,
  },
  {
    key: "sleep",
    label: "Sleep",
    detail: "Asleep time against your baseline",
    route: "/health/sleep",
    defaultEnabled: true,
  },
  {
    key: "activity",
    label: "Activity",
    detail: "Exercise minutes and steps",
    route: "/health/activity",
    defaultEnabled: true,
  },
  {
    key: "heart",
    label: "Heart",
    detail: "Resting rate and variability",
    route: "/health/heart",
    defaultEnabled: true,
  },
  {
    key: "body",
    label: "Body",
    detail: "Weight and composition",
    route: "/health/body",
    defaultEnabled: true,
  },
  {
    key: "nutrition",
    label: "Nutrition",
    detail: "What you ate, against what you asked for",
    route: "/health/nutrition",
    defaultEnabled: true,
  },
  {
    key: "vitals",
    label: "Vitals",
    detail: "Glucose, pressure, oxygen, temperature",
    route: "/health/vitals",
    defaultEnabled: true,
  },
  {
    key: "mindfulness",
    label: "Mindfulness",
    detail: "Time spent deliberately doing nothing",
    route: "/health/mindfulness",
    defaultEnabled: true,
  },
  {
    /**
     * Off by default, like the intimate rows in the metric catalogue above.
     * A cycle dial that appears on the home screen of a phone someone else
     * might glance at is a disclosure the app made on their behalf.
     */
    key: "reproductive",
    label: "Cycle",
    detail: "Cycle tracking, in your own hand",
    route: "/health/reproductive",
    defaultEnabled: false,
  },
];

export const HEALTH_DIAL_KEYS = HEALTH_DIALS.map((dial) => dial.key);

export const HEALTH_DIAL_BY_KEY = new Map(
  HEALTH_DIALS.map((dial) => [dial.key, dial]),
);

/**
 * Which dial a platform-catalogue group belongs to.
 *
 * The five original dials were written for the handful of signals the app
 * scores itself, and three whole groups of the platform catalogue had nowhere
 * to land: a custom metric bound to blood glucose or mindful minutes was synced
 * faithfully and then shown nowhere, which is the failure this map exists to
 * fix. Every group in `PlatformMetricGroup` must appear here — a missing one
 * means a metric that syncs into a void.
 *
 * `vitals` gets its own dial rather than folding into `heart`. The heart dial
 * is a screen about resting rate and variability; putting a finger-prick
 * glucose reading behind a ring labelled "Heart" would be a filing error the
 * user has to mentally undo every time they open it. The heart-rate family is
 * pulled back out by `HEART_KEYS` below, because splitting walking heart rate
 * away from the resting rate it is a companion to would be the same mistake in
 * the other direction.
 */
const DIAL_BY_GROUP: Record<string, string> = {
  activity: "activity",
  vitals: "vitals",
  body: "body",
  nutrition: "nutrition",
  sleep: "sleep",
  reproductive: "reproductive",
  mindfulness: "mindfulness",
};

/** Vitals that are about the heart specifically, and belong on its dial. */
const HEART_KEYS = new Set([
  "restingHeartRateBpm",
  "heartRateBpm",
  "hrvMs",
  "walkingHeartRateAvgBpm",
  "heartRateRecoveryBpm",
]);

/**
 * The dial a catalogue key files under, or null when the key is not one.
 *
 * Null rather than a fallback dial on purpose: a key the catalogue has never
 * heard of is a typo or a metric bound against an older build, and quietly
 * filing it under "Body" would hide both.
 */
export function healthDialForMetricKey(key: string | undefined): string | null {
  if (!key) return null;
  if (HEART_KEYS.has(key)) return "heart";
  const metric = platformMetric(key);
  if (!metric) return null;
  return DIAL_BY_GROUP[metric.group] ?? null;
}

/**
 * Where an unbound custom metric goes.
 *
 * It has no catalogue key and therefore no group, so there is nothing to
 * classify it by except what the user already told us when they made it: the
 * Progress tab they filed it under. That is a stated intent rather than a
 * guess, which makes it better evidence than anything the app could infer from
 * a title. Training maps onto Activity because the app has no separate
 * training dial and one of those two names is the user's word for it.
 */
const DIAL_BY_TAB: Record<string, string> = {
  body: "body",
  nutrition: "nutrition",
  training: "activity",
};

export function healthDialForCustomMetric(metric: {
  healthMetricKey?: string;
  tab?: string;
}): string | null {
  const bound = healthDialForMetricKey(metric.healthMetricKey);
  if (bound) return bound;
  return metric.tab ? (DIAL_BY_TAB[metric.tab] ?? null) : null;
}

export function resolveHealthDialSelection(
  stored: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const resolved = Object.fromEntries(
    HEALTH_DIALS.map((dial) => [dial.key, dial.defaultEnabled]),
  );
  if (!stored) return resolved;
  for (const [key, enabled] of Object.entries(stored)) {
    if (key in resolved) resolved[key] = enabled === true;
  }
  return resolved;
}
