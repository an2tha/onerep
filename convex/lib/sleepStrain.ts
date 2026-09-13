/** Versioned, explainable wellness estimates. These are not clinical measures. */
export const SCORE_VERSION = 1;
export type SleepDay = {
  cardiacMinutes?: Record<string, number>;
  date: string;
  sleepMinutes?: number;
  provider?: string;
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
export function scoreSleep(day: SleepDay, history: SleepDay[], target = 480) {
  if (!valid(day.sleepMinutes) || day.sleepMinutes <= 0) return null;
  const prior = history
    .filter((d) => d.date < day.date && d.provider === day.provider)
    .slice(-28);
  const minutes = day.mainSleepMinutes ?? day.sleepMinutes;
  const baseline = median(
    prior.map((d) => d.mainSleepMinutes ?? d.sleepMinutes).filter(valid),
  );
  const parts: {
    key: string;
    label: string;
    score: number;
    weight: number;
    detail: string;
  }[] = [
    {
      key: "duration",
      label: "Duration",
      score: clamp((minutes / target) * 100),
      weight: 40,
      detail: `${Math.round(minutes)} minutes asleep against your ${target}-minute goal.`,
    },
  ];
  const awake = valid(day.sleepAwakeMinutes) ? day.sleepAwakeMinutes : null;
  const efficiency =
    awake === null ? null : (minutes / (minutes + awake)) * 100;
  if (efficiency !== null)
    parts.push({
      key: "continuity",
      label: "Continuity",
      score: clamp(efficiency),
      weight: 25,
      detail: `${Math.round(awake!)} minutes awake during the recorded sleep period; ${Math.round(efficiency)}% recorded sleep efficiency.`,
    });
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
  const stageTotal = stages.reduce((sum, s) => sum + s.minutes, 0);
  const stagesValid =
    stages.length === 3 &&
    stageTotal <= minutes + 5 &&
    stageTotal >= minutes * 0.8;
  const stageBaseline = median(
    prior
      .filter(
        (d) =>
          valid(d.sleepDeepMinutes) &&
          valid(d.sleepRemMinutes) &&
          valid(d.sleepMinutes) &&
          d.sleepMinutes > 0,
      )
      .map((d) => (d.sleepDeepMinutes! + d.sleepRemMinutes!) / d.sleepMinutes!),
  );
  if (
    stagesValid &&
    stageBaseline !== null &&
    prior.filter((d) => valid(d.sleepDeepMinutes) && valid(d.sleepRemMinutes))
      .length >= 7 &&
    stageBaseline > 0
  ) {
    const ratio = (day.sleepDeepMinutes! + day.sleepRemMinutes!) / minutes;
    parts.push({
      key: "stages",
      label: "Stage pattern",
      score: clamp(100 - Math.max(0, stageBaseline - ratio) * 100),
      weight: 20,
      detail:
        "A modest adjustment for deep and REM time versus your own device history; stages are estimates.",
    });
  }
  const timings = prior.filter(
    (d) => valid(d.sleepStartMinutes) && valid(d.sleepEndMinutes),
  );
  let timingShift: number | null = null;
  if (
    valid(day.sleepStartMinutes) &&
    valid(day.sleepEndMinutes) &&
    timings.length >= 7
  ) {
    timingShift = median(
      timings.map(
        (d) =>
          (circularDelta(day.sleepStartMinutes!, d.sleepStartMinutes!) +
            circularDelta(day.sleepEndMinutes!, d.sleepEndMinutes!)) /
          2,
      ),
    );
    parts.push({
      key: "consistency",
      label: "Consistency",
      score: clamp(100 - timingShift! / 3),
      weight: 15,
      detail: `Sleep and wake times differ by about ${Math.round(timingShift!)} minutes from recent nights.`,
    });
  }
  const weight = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round(
    parts.reduce((s, p) => s + p.score * p.weight, 0) / weight,
  );
  const confidence =
    parts.length === 4
      ? "High"
      : awake !== null || stagesValid
        ? "Medium"
        : "Low";
  const recent = [...prior.slice(-6), day];
  const shortfall = recent.reduce(
    (s, d) =>
      s + (valid(d.sleepMinutes) ? Math.max(0, target - d.sleepMinutes) : 0),
    0,
  );
  const observations = [
    baseline !== null
      ? `${Math.round(Math.abs(minutes - baseline))} minutes ${minutes >= baseline ? "more" : "less"} sleep than your baseline.`
      : "Your baseline will grow as more nights arrive.",
  ];
  if (timingShift !== null && timingShift > 60)
    observations.push("Your sleep schedule shifted by more than an hour.");
  if (awake !== null && awake > 45)
    observations.push(
      "A noticeable part of the recorded night was spent awake.",
    );
  if (stageTotal > minutes + 5)
    observations.push(
      "Stage totals overlap or exceed sleep duration; stage scoring is excluded.",
    );
  return {
    date: day.date,
    score,
    confidence,
    minutes,
    baseline,
    target,
    efficiency,
    awake,
    band:
      score >= 90
        ? "Restorative"
        : score >= 75
          ? "Good"
          : score >= 60
            ? "Fair"
            : "Short or disrupted",
    parts: parts.map((p) => ({
      ...p,
      weight: Math.round((p.weight / weight) * 100),
    })),
    stages: stageTotal <= minutes + 5 ? stages : [],
    unclassifiedMinutes:
      stageTotal > minutes + 5 ? minutes : Math.max(0, minutes - stageTotal),
    napMinutes: day.napMinutes ?? null,
    startedAt: day.sleepStartedAt ?? null,
    endedAt: day.sleepEndedAt ?? null,
    shortfall: Math.round(shortfall),
    shortfallNights: recent.length,
    observations,
    tip:
      minutes < target - 30
        ? "Try making room for 20–30 extra minutes of sleep tonight, if your schedule allows."
        : timingShift !== null && timingShift > 60
          ? "Try returning to a familiar sleep and wake window tonight."
          : awake !== null && awake > 45
            ? "Notice whether noise, light, or temperature interrupted you; change one thing tonight."
            : "Keep the routine that worked and notice how rested you feel tomorrow.",
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
    version: SCORE_VERSION,
  };
}
