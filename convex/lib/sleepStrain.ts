import { shiftDate } from "./healthSeries";

/** Versioned, explainable wellness estimates. These are not clinical measures. */
export const SCORE_VERSION = 2;
export type SleepDay = {
  cardiacMinutes?: Record<string, number>;
  date: string;
  sleepMinutes?: number;
  provider?: string;
  updatedAt?: number;
  manualFields?: string[];
  sleepDeepMinutes?: number;
  sleepRemMinutes?: number;
  sleepLightMinutes?: number;
  sleepAwakeMinutes?: number;
  sleepStartMinutes?: number;
  sleepEndMinutes?: number;
  mainSleepMinutes?: number;
  napMinutes?: number;
  sleepStartedAt?: number;
  sleepEndedAt?: number;
  steps?: number;
  activeEnergyKcal?: number;
  restingHeartRateBpm?: number;
  hrvMs?: number;
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const valid = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export const median = (ns: number[]) => {
  const sorted = [...ns].sort((a, b) => a - b);
  return sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)]! +
        sorted[Math.floor(sorted.length / 2)]!) /
        2
    : null;
};
const circularDelta = (a: number, b: number) =>
  Math.abs(((a - b + 2160) % 1440) - 720);
export type SleepGoal = { date: string; targetMinutes: number };
const mainDuration = (day: SleepDay) =>
  valid(day.mainSleepMinutes) && day.mainSleepMinutes > 0
    ? day.mainSleepMinutes
    : day.sleepMinutes;
export function sleepGoalOn(date: string, goals: SleepGoal[], fallback = 480) {
  return (
    [...goals]
      .filter((goal) => goal.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.targetMinutes ??
    fallback
  );
}

/** One stable quantity: main-period duration as a percentage of the dated goal.
 * Other readings explain the night; their availability never changes this percentage.
 */
export function scoreSleep(
  day: SleepDay,
  history: SleepDay[],
  target = 480,
  goals: SleepGoal[] = [],
  initialTarget = target,
) {
  if (!valid(day.sleepMinutes) || day.sleepMinutes <= 0) return null;
  const minutes = mainDuration(day)!;
  const source = (d: SleepDay) =>
    d.manualFields?.includes("sleepMinutes")
      ? "manual"
      : (d.provider ?? "unknown");
  const priorAll = history
    .filter((d) => d.date < day.date && d.date >= shiftDate(day.date, -28))
    .sort((a, b) => a.date.localeCompare(b.date));
  const prior = priorAll.filter((d) => source(d) === source(day));
  const durations = prior
    .map(mainDuration)
    .filter(valid)
    .filter((n) => n > 0);
  const baseline = durations.length >= 7 ? median(durations) : null;
  const sorted = [...durations].sort((a, b) => a - b);
  const usualRange =
    baseline === null
      ? null
      : {
          low: sorted[Math.floor((sorted.length - 1) * 0.25)]!,
          high: sorted[Math.ceil((sorted.length - 1) * 0.75)]!,
        };
  const awake = valid(day.sleepAwakeMinutes) ? day.sleepAwakeMinutes : null;
  const efficiency =
    awake === null ? null : (minutes / (minutes + awake)) * 100;
  const stages = [
    {
      key: "sleepLightMinutes",
      label: "Light",
      minutes: day.sleepLightMinutes,
    },
    { key: "sleepDeepMinutes", label: "Deep", minutes: day.sleepDeepMinutes },
    { key: "sleepRemMinutes", label: "REM", minutes: day.sleepRemMinutes },
  ].filter((s): s is { key: string; label: string; minutes: number } =>
    valid(s.minutes),
  );
  const stageTotal = stages.reduce((sum, stage) => sum + stage.minutes, 0);
  const validStages = stageTotal <= minutes + 5 ? stages : [];
  const timings = prior.filter(
    (d) => valid(d.sleepStartMinutes) && valid(d.sleepEndMinutes),
  );
  const timingShift =
    valid(day.sleepStartMinutes) &&
    valid(day.sleepEndMinutes) &&
    timings.length >= 7
      ? median(
          timings.map(
            (d) =>
              (circularDelta(day.sleepStartMinutes!, d.sleepStartMinutes!) +
                circularDelta(day.sleepEndMinutes!, d.sleepEndMinutes!)) /
              2,
          ),
        )
      : null;
  // Include all recorded sources for the calendar-week goal comparison, but
  // never mix sources when calculating a person's usual range.
  const recent = [
    ...history.filter(
      (d) => d.date >= shiftDate(day.date, -6) && d.date < day.date,
    ),
    day,
  ].filter((d) => valid(d.sleepMinutes) && d.sleepMinutes > 0);
  const shortfall = recent.reduce(
    (sum, d) =>
      sum +
      Math.max(0, sleepGoalOn(d.date, goals, initialTarget) - mainDuration(d)!),
    0,
  );
  const coverageKeys = [
    "duration",
    ...(awake !== null ? ["awake"] : []),
    ...(validStages.length ? ["stages"] : []),
    ...(valid(day.sleepStartMinutes) && valid(day.sleepEndMinutes)
      ? ["timing"]
      : []),
  ];
  const previous = priorAll
    .filter((d) => valid(d.sleepMinutes) && d.sleepMinutes > 0)
    .at(-1);
  const previousCoverage = previous
    ? [
        "duration",
        ...(valid(previous.sleepAwakeMinutes) ? ["awake"] : []),
        ...([
          previous.sleepLightMinutes,
          previous.sleepDeepMinutes,
          previous.sleepRemMinutes,
        ].some(valid)
          ? ["stages"]
          : []),
        ...(valid(previous.sleepStartMinutes) && valid(previous.sleepEndMinutes)
          ? ["timing"]
          : []),
      ]
    : [];
  const providerChanged = Boolean(previous && source(previous) !== source(day));
  const coverageChanged = Boolean(
    previous && coverageKeys.join() !== previousCoverage.join(),
  );
  const score = Math.round(clamp((minutes / target) * 100));
  const observations = [
    baseline !== null
      ? `${Math.round(Math.abs(minutes - baseline))} minutes ${minutes >= baseline ? "more" : "less"} main sleep than your recent median.`
      : "Seven recorded nights from the same source are needed for your usual range.",
  ];
  if (providerChanged)
    observations.push(
      "Your sleep source changed. The usual range uses only this source.",
    );
  if (coverageChanged)
    observations.push(
      "The available readings changed. Duration goal progress still uses only recorded duration.",
    );
  if (stageTotal > minutes + 5)
    observations.push(
      "Stage totals exceed main sleep duration and are excluded.",
    );
  return {
    date: day.date,
    score,
    minutes,
    baseline,
    usualRange,
    baselineNights: durations.length,
    target,
    efficiency,
    awake,
    timingShift,
    // Retained for older clients. New interfaces show coverageKeys directly.
    confidence:
      coverageKeys.length === 4
        ? "High"
        : coverageKeys.length > 1
          ? "Medium"
          : "Low",
    coverageKeys,
    provider: source(day),
    providerChanged,
    coverageChanged,
    updatedAt: day.updatedAt ?? null,
    band: minutes < target ? "Below duration goal" : "Duration goal met",
    parts: [
      {
        key: "duration",
        label: "Duration goal progress",
        score,
        weight: 100,
        detail: `${Math.round(minutes)} minutes of main sleep against the ${target}-minute goal for this waking day. Stages and other readings do not affect this percentage.`,
      },
    ],
    stages: validStages,
    unclassifiedMinutes: Math.max(
      0,
      minutes - validStages.reduce((sum, s) => sum + s.minutes, 0),
    ),
    napMinutes: day.napMinutes ?? null,
    totalMinutes: day.sleepMinutes,
    startedAt: day.sleepStartedAt ?? null,
    endedAt: day.sleepEndedAt ?? null,
    startMinutes: day.sleepStartMinutes ?? null,
    endMinutes: day.sleepEndMinutes ?? null,
    shortfall: Math.round(shortfall),
    shortfallNights: recent.length,
    shortfallStart: shiftDate(day.date, -6),
    observations,
    focus:
      minutes < target - 30
        ? "duration"
        : timingShift !== null && timingShift > 60
          ? "timing"
          : awake !== null && awake > 45
            ? "interruptions"
            : "continue",
    tip:
      minutes < target - 30
        ? "Make room for 20–30 extra minutes of sleep tonight, if your schedule allows."
        : timingShift !== null && timingShift > 60
          ? "Consider a familiar sleep and wake window tonight, if it fits your schedule."
          : awake !== null && awake > 45
            ? "Notice whether noise, light, or temperature interrupted you; change one thing tonight."
            : "Keep your usual routine and notice how rested you feel tomorrow.",
    version: SCORE_VERSION,
  };
}
export type LoadSession = {
  id: string;
  name: string;
  date: string;
  startedAt?: number;
  minutes: number;
  energy?: number;
  heartRate?: number;
  hardSets?: number;
  effort?: number;
  zoneLoad?: number;
};
export function scoreStrain(
  day: SleepDay | undefined,
  sessions: LoadSession[],
  history: SleepDay[],
) {
  const workoutEnergy = sessions.reduce((s, w) => s + (w.energy ?? 0), 0);
  const energy = valid(day?.activeEnergyKcal)
    ? Math.max(0, day!.activeEnergyKcal! - workoutEnergy)
    : null;
  const steps = valid(day?.steps) ? day!.steps! : null;
  const prior = history.filter(
    (d) =>
      d.date < (day?.date ?? "9999") && (!day || d.provider === day.provider),
  );
  const energyBaseline =
    median(prior.map((d) => d.activeEnergyKcal).filter(valid)) ?? 400;
  const cardiacCoverage = Object.values(day?.cardiacMinutes ?? {}).reduce(
    (sum, n) => sum + (valid(n) ? n : 0),
    0,
  );
  const restingBaseline =
    day?.restingHeartRateBpm ??
    median(prior.map((d) => d.restingHeartRateBpm).filter(valid));
  const resting = restingBaseline ?? 60;
  const cardiacLoad = Object.entries(day?.cardiacMinutes ?? {}).reduce(
    (sum, [bpm, minutes]) =>
      sum +
      (valid(minutes)
        ? minutes * Math.max(0, (Number(bpm) - resting) / 60)
        : 0),
    0,
  );
  const physiological =
    cardiacCoverage >= 120
      ? Math.round(100 * (1 - Math.exp(-cardiacLoad / 180)))
      : energy !== null
        ? Math.round(
            clamp(
              100 * (1 - Math.exp(-energy / Math.max(250, energyBaseline))),
            ),
          )
        : steps !== null
          ? Math.round(clamp(100 * (1 - Math.exp(-steps / 10000))))
          : null;
  const workouts = sessions.map((w) => {
    const effort = valid(w.effort)
      ? Math.max(1, Math.min(10, w.effort))
      : w.heartRate
        ? Math.max(2, Math.min(8, (w.heartRate - 60) / 15))
        : 4;
    const load = Math.max(
      w.zoneLoad ?? w.minutes * effort,
      (w.hardSets ?? 0) * effort * 6,
    );
    return {
      ...w,
      load: Math.round(load),
      estimated: !w.effort && !w.zoneLoad,
    };
  });
  const training = workouts.length
    ? Math.round(
        100 * (1 - Math.exp(-workouts.reduce((s, w) => s + w.load, 0) / 500)),
      )
    : null;
  const weighted = [
    {
      key: "physiological",
      label: "Physiological strain",
      score: physiological,
      weight: 55,
    },
    { key: "training", label: "Training load", score: training, weight: 45 },
  ].filter((p) => p.score !== null);
  const totalWeight = weighted.reduce((s, p) => s + p.weight, 0);
  const score = totalWeight
    ? Math.round(
        weighted.reduce((s, p) => s + p.score! * p.weight, 0) / totalWeight,
      )
    : null;
  return {
    score,
    physiological,
    cardiacCoverage,
    cardiacLoad: Math.round(cardiacLoad),
    training,
    workouts,
    parts: weighted.map((p) => ({
      ...p,
      contribution: Math.round((p.score! * p.weight) / totalWeight),
      weight: Math.round((p.weight / totalWeight) * 100),
    })),
    confidence:
      cardiacCoverage >= 720 &&
      restingBaseline !== null &&
      training !== null &&
      workouts.every((w) => !w.estimated)
        ? "High"
        : physiological !== null &&
            training !== null &&
            workouts.every((w) => !w.estimated)
          ? "Medium"
          : "Low",
    band:
      score === null
        ? "No readings"
        : score < 25
          ? "Restful"
          : score < 50
            ? "Light"
            : score < 70
              ? "Moderate"
              : score < 85
                ? "High"
                : "Very high",
    explanation:
      cardiacCoverage >= 120
        ? `${cardiacCoverage} sampled minutes outside recorded workouts. Heart-rate demand uses ${restingBaseline === null ? "an estimated 60 bpm resting reference" : "your resting baseline"}; unsampled gaps are left unknown.`
        : energy !== null
          ? "Daily active energy, less known workout energy, estimates whole-day demand. Steps are not added again."
          : steps !== null
            ? "Steps provide a basic whole-day estimate. Workout overlap cannot be fully removed without energy data."
            : "Whole-day measurements are unavailable. Training alone can still provide a partial score.",
    version: 1,
  };
}
