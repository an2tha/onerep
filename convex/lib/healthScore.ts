/**
 * Two numbers and a short list of things to do about them.
 *
 * `summarizeRecovery` in `./recovery` answers "how are you today" by comparing
 * someone against their own last month. That is the right question for a coach
 * deciding whether to move a squat session, and the wrong one for a health
 * page: a person who sleeps five hours every night has a flat baseline and
 * therefore an untroubled recovery read-out, which is a technically correct
 * answer nobody should be given.
 *
 * So there are two scores here. The **recovery** score stays deviation-based
 * and short-term, because that is what recovery means. The **health** score is
 * absolute, measured against public guidance — 150 minutes of exercise a week,
 * seven hours a night, the rest below — because habits are the thing it is
 * grading, and habits need a fixed ruler.
 *
 * Every pillar can be missing. Nothing here assumes a watch.
 */

import type { RecoverySummary } from "./recovery";

/** Days of history the pillars are averaged over. */
export const HEALTH_SCORE_WINDOW_DAYS = 7;

export type HealthPillarId =
  | "sleep"
  | "steps"
  | "exercise"
  | "energy"
  | "cardio";

export type HealthPillar = {
  id: HealthPillarId;
  label: string;
  /** 0–100, or null when nothing measured this pillar. */
  score: number | null;
  /** Share of the final score, renormalized over the pillars that have data. */
  weight: number;
  /** The measured value, in the unit named by `unit`. */
  value: number | null;
  /** What `value` is being graded against. */
  target: number;
  unit: "minutesPerNight" | "stepsPerDay" | "minutesPerWeek" | "kcalPerDay" | "index";
  /** One line of plain language: what was measured, against what. */
  detail: string;
};

export type HealthRecommendation = {
  pillar: HealthPillarId;
  /** Imperative, specific, and quantified. Never "try to sleep more". */
  title: string;
  /** Why this one is at the top of the list. */
  detail: string;
  /**
   * The same ask as `title`, split so a card can lead with the figure.
   *
   * A card that opens with a number and three words is read at a glance; the
   * sentence form is kept for the detail pages, where there is room to explain
   * and the reader has already chosen the subject.
   */
  amount: number;
  /** "min", "steps", "kcal", "bpm", "%". Never a word longer than the number. */
  unit: string;
  /** Four or five words at the outside. Lowercase, no full stop. */
  action: string;
  /** Points the overall score would gain if this pillar reached target. */
  potentialPoints: number;
};

/**
 * The read-out in prose.
 *
 * A ring and five bars tell you what happened; they do not tell you which of
 * the five mattered. This is the sentence a coach would open with — the score,
 * the pillar carrying it, the pillar dragging it, and the number attached to
 * each. Assembled from the same values the tiles render, so it can never
 * disagree with them.
 */
export type HealthNarrative = {
  /** Three or four words. The verdict, not a greeting. */
  headline: string;
  /** Two to four sentences, every claim carrying its number. */
  body: string;
};

export type HealthScoreResult = {
  /** 0–100 across the habit pillars, or null when nothing is measured. */
  score: number | null;
  /** 0–100 short-term readiness, or null without a usable baseline. */
  recoveryScore: number | null;
  band: "excellent" | "solid" | "fair" | "poor" | "unknown";
  pillars: HealthPillar[];
  recommendations: HealthRecommendation[];
  /** The paragraph at the top of the page. Never null once anything is measured. */
  narrative: HealthNarrative | null;
  /** Days in the window that carried at least one reading. */
  measuredDays: number;
};

/**
 * Targets, and where they come from.
 *
 * Steps and active energy are the soft ones — 8,000 rather than the folkloric
 * 10,000, which came from a 1960s pedometer's brand name and has been quietly
 * walked back by every cohort study since. The exercise figure is the WHO's
 * 150 minutes of moderate activity a week. Sleep is the low end of the adult
 * range rather than the middle, because grading someone poor at 7h 15m would
 * be picking a fight with the evidence.
 */
export const HEALTH_TARGETS = {
  sleepMinutes: 7 * 60,
  steps: 8_000,
  exerciseMinutesPerWeek: 150,
  activeEnergyKcal: 400,
} as const;

const BASE_WEIGHTS: Record<HealthPillarId, number> = {
  sleep: 0.3,
  exercise: 0.25,
  cardio: 0.2,
  steps: 0.15,
  energy: 0.1,
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** A pillar at or below this is not a weak spot, it is a problem. */
const FAILING_PILLAR = 60;
/** The best the overall score may read while one pillar is failing. */
const CAPPED_BY_FAILING_PILLAR = 69;

function mean(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Fraction of target, as a score, with credit for overshooting capped.
 *
 * Capped because twice the target is not twice the health — 16,000 steps is
 * not twice as good as 8,000, and letting one heroic pillar paper over a
 * broken one is exactly the failure mode that makes composite scores useless.
 */
function attainment(value: number, target: number) {
  if (target <= 0) return null;
  return clamp((value / target) * 100);
}

/**
 * Sleep is the one pillar with a ceiling as well as a floor.
 *
 * Ten hours a night, night after night, is not a better result than eight; in
 * the cohort data it tracks about as badly as six. So the curve comes back
 * down past nine hours instead of pinning at 100.
 */
function sleepScore(minutes: number) {
  const target = HEALTH_TARGETS.sleepMinutes;
  if (minutes <= target) return clamp((minutes / target) * 100);
  const excess = minutes - 9 * 60;
  return excess <= 0 ? 100 : clamp(100 - (excess / 60) * 15);
}

/**
 * The cardiovascular pillar, which is the only one graded on a curve.
 *
 * Resting heart rate and HRV have no defensible absolute targets — a fit
 * 25-year-old and a fit 60-year-old differ by more than any threshold could
 * survive — so this one alone stays relative to the person's own baseline.
 * A steady reading scores well; drift in the wrong direction costs.
 */
function cardioScore(recovery: RecoverySummary | null) {
  if (!recovery) return null;
  const parts: number[] = [];

  const rhr = recovery.restingHeartRate;
  if (rhr && rhr.baseline > 0) {
    // Up 10% on your own resting rate is a bad fortnight, not a bad life; the
    // scale is set so that costs about half the pillar rather than all of it.
    const rise = rhr.delta / rhr.baseline;
    parts.push(clamp(100 - Math.max(0, rise) * 500));
  }

  const hrv = recovery.hrv;
  if (hrv && hrv.baseline > 0) {
    const drop = -hrv.delta / hrv.baseline;
    parts.push(clamp(100 - Math.max(0, drop) * 250));
  }

  const score = mean(parts);
  return score === null ? null : Math.round(score);
}

/**
 * Recovery as a number rather than a word.
 *
 * `summarizeRecovery` already decides ready/steady/compromised, and this must
 * not disagree with it — a page showing "Ready" next to a 41 is a page nobody
 * trusts twice. So the status sets the band and the signals only move the
 * number inside it.
 */
export function recoveryScore(recovery: RecoverySummary | null): number | null {
  if (!recovery || recovery.status === "unknown") return null;

  const centre =
    recovery.status === "ready" ? 85 : recovery.status === "steady" ? 62 : 35;

  let adjustment = 0;
  const sleep = recovery.sleep;
  if (sleep && sleep.baseline > 0) {
    // ±1 hour against your own normal is worth ±10 points, tapered.
    adjustment += Math.max(-12, Math.min(12, (sleep.delta / 60) * 10));
  }
  const hrv = recovery.hrv;
  if (hrv && hrv.baseline > 0) {
    adjustment += Math.max(-10, Math.min(10, (hrv.delta / hrv.baseline) * 60));
  }
  const rhr = recovery.restingHeartRate;
  if (rhr && rhr.baseline > 0) {
    adjustment += Math.max(-10, Math.min(10, (-rhr.delta / rhr.baseline) * 120));
  }

  return Math.round(clamp(centre + adjustment));
}

function formatHours(minutes: number) {
  const whole = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (whole === 0) return `${rest}m`;
  return rest === 0 ? `${whole}h` : `${whole}h ${rest}m`;
}

const number = (value: number) => Math.round(value).toLocaleString("en-US");

export type HealthScoreInput = {
  /** Daily rows in the scoring window, any order. */
  days: Array<{
    date: string;
    sleepMinutes?: number;
    steps?: number;
    activeEnergyKcal?: number;
    restingHeartRateBpm?: number;
    hrvMs?: number;
  }>;
  /** Minutes of recorded exercise per local day, from the workout store. */
  exerciseMinutesByDate: Record<string, number>;
  /** The deviation read-out the cardio pillar and recovery score lean on. */
  recovery: RecoverySummary | null;
};

/**
 * The whole read-out: pillars, two scores, and what to do about the worst one.
 *
 * Weights are renormalized over the pillars that actually have readings, the
 * same way `computeReadiness` does it on the client — a missing pillar must
 * dilute nobody's score, because "you own no watch" is not a health finding.
 */
export function computeHealthScore({
  days,
  exerciseMinutesByDate,
  recovery,
}: HealthScoreInput): HealthScoreResult {
  const sleepValues = days
    .map((day) => day.sleepMinutes)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const stepValues = days
    .map((day) => day.steps)
    .filter((value): value is number => typeof value === "number" && value >= 0);
  const energyValues = days
    .map((day) => day.activeEnergyKcal)
    .filter((value): value is number => typeof value === "number" && value >= 0);

  const sleepAvg = mean(sleepValues);
  const stepsAvg = mean(stepValues);
  const energyAvg = mean(energyValues);

  // Exercise is the one pillar read as a weekly total rather than a daily
  // average, because that is the unit the guideline is written in and because
  // three hard days and four rest days is a normal week, not a failing one.
  const exerciseWeekly = Object.values(exerciseMinutesByDate).reduce(
    (sum, minutes) => sum + minutes,
    0,
  );
  const hasExerciseData =
    Object.keys(exerciseMinutesByDate).length > 0 || days.length > 0;

  const cardio = cardioScore(recovery);

  const pillars: HealthPillar[] = [
    {
      id: "sleep",
      label: "Sleep",
      score: sleepAvg === null ? null : Math.round(sleepScore(sleepAvg)),
      weight: BASE_WEIGHTS.sleep,
      value: sleepAvg,
      target: HEALTH_TARGETS.sleepMinutes,
      unit: "minutesPerNight",
      detail:
        sleepAvg === null
          ? "No sleep recorded yet"
          : `${formatHours(sleepAvg)} a night against a ${formatHours(HEALTH_TARGETS.sleepMinutes)} target`,
    },
    {
      id: "exercise",
      label: "Exercise minutes",
      score: hasExerciseData
        ? Math.round(
            attainment(exerciseWeekly, HEALTH_TARGETS.exerciseMinutesPerWeek) ?? 0,
          )
        : null,
      weight: BASE_WEIGHTS.exercise,
      value: hasExerciseData ? exerciseWeekly : null,
      target: HEALTH_TARGETS.exerciseMinutesPerWeek,
      unit: "minutesPerWeek",
      detail: hasExerciseData
        ? `${Math.round(exerciseWeekly)} of ${HEALTH_TARGETS.exerciseMinutesPerWeek} minutes this week`
        : "No sessions recorded yet",
    },
    {
      id: "cardio",
      label: "Cardiovascular",
      score: cardio,
      weight: BASE_WEIGHTS.cardio,
      value: recovery?.restingHeartRate?.recent ?? null,
      target: recovery?.restingHeartRate?.baseline ?? 0,
      unit: "index",
      detail:
        cardio === null
          ? "Needs about a week of heart-rate readings"
          : recovery?.restingHeartRate
            ? `Resting ${Math.round(recovery.restingHeartRate.recent)}bpm against your ${Math.round(recovery.restingHeartRate.baseline)}bpm normal`
            : "Tracking heart-rate variability against your own baseline",
    },
    {
      id: "steps",
      label: "Steps",
      score:
        stepsAvg === null
          ? null
          : Math.round(attainment(stepsAvg, HEALTH_TARGETS.steps) ?? 0),
      weight: BASE_WEIGHTS.steps,
      value: stepsAvg,
      target: HEALTH_TARGETS.steps,
      unit: "stepsPerDay",
      detail:
        stepsAvg === null
          ? "No step data yet"
          : `${number(stepsAvg)} a day against a ${number(HEALTH_TARGETS.steps)} target`,
    },
    {
      id: "energy",
      label: "Active calories",
      score:
        energyAvg === null
          ? null
          : Math.round(attainment(energyAvg, HEALTH_TARGETS.activeEnergyKcal) ?? 0),
      weight: BASE_WEIGHTS.energy,
      value: energyAvg,
      target: HEALTH_TARGETS.activeEnergyKcal,
      unit: "kcalPerDay",
      detail:
        energyAvg === null
          ? "No active energy recorded yet"
          : `${number(energyAvg)} kcal a day against a ${number(HEALTH_TARGETS.activeEnergyKcal)} kcal target`,
    },
  ];

  const measured = pillars.filter((pillar) => pillar.score !== null);
  const totalWeight = measured.reduce((sum, pillar) => sum + pillar.weight, 0);
  for (const pillar of pillars) {
    pillar.weight =
      pillar.score === null || totalWeight === 0 ? 0 : pillar.weight / totalWeight;
  }

  const weighted =
    measured.length === 0
      ? null
      : Math.round(
          pillars.reduce(
            (sum, pillar) => sum + (pillar.score ?? 0) * pillar.weight,
            0,
          ),
        );

  // A weighted mean will happily call four hours of sleep a night "excellent"
  // as long as the step count is heroic, which is the single most common way
  // a composite health score becomes a lie. So one badly failing pillar caps
  // the whole thing below the top band, however good the others are.
  const worst = Math.min(
    ...measured.map((pillar) => pillar.score ?? 100),
  );
  const score =
    weighted === null
      ? null
      : worst < FAILING_PILLAR
        ? Math.min(weighted, CAPPED_BY_FAILING_PILLAR)
        : weighted;

  const band: HealthScoreResult["band"] =
    score === null
      ? "unknown"
      : score >= 85
        ? "excellent"
        : score >= 70
          ? "solid"
          : score >= 50
            ? "fair"
            : "poor";

  return {
    score,
    recoveryScore: recoveryScore(recovery),
    band,
    pillars,
    narrative: buildNarrative(score, band, pillars, recovery),
    recommendations: buildRecommendations(pillars, {
      sleepAvg,
      stepsAvg,
      energyAvg,
      exerciseWeekly,
      recovery,
    }),
    measuredDays: days.length,
  };
}

/**
 * What to actually do, worst pillar first.
 *
 * Ranked by points recoverable — weight times the gap to 100 — rather than by
 * how bad each pillar looks on its own, because the pillar someone is worst at
 * is not always the one worth their Tuesday. Everything is quantified in the
 * unit of the thing being asked for: an extra 2,300 steps, forty more minutes,
 * a bedtime half an hour earlier. Advice you cannot check you have followed is
 * not advice.
 */
function buildRecommendations(
  pillars: HealthPillar[],
  context: {
    sleepAvg: number | null;
    stepsAvg: number | null;
    energyAvg: number | null;
    exerciseWeekly: number;
    recovery: RecoverySummary | null;
  },
): HealthRecommendation[] {
  const recommendations: HealthRecommendation[] = [];

  const potential = (pillar: HealthPillar) =>
    Math.round(pillar.weight * (100 - (pillar.score ?? 100)));

  for (const pillar of pillars) {
    if (pillar.score === null || pillar.score >= 95) continue;
    const points = potential(pillar);

    if (pillar.id === "sleep" && context.sleepAvg !== null) {
      const shortfall = HEALTH_TARGETS.sleepMinutes - context.sleepAvg;
      if (shortfall > 10) {
        recommendations.push({
          pillar: "sleep",
          title: `Go to bed ${Math.round(shortfall)} minutes earlier`,
          amount: Math.round(shortfall),
          unit: "min",
          action: "earlier to bed",
          detail: `${formatHours(context.sleepAvg)} a night now. Same alarm, earlier lights-out.`,
          potentialPoints: points,
        });
      } else if (context.sleepAvg > 9 * 60) {
        recommendations.push({
          pillar: "sleep",
          title: "Pull your wake time forward",
          amount: Math.round(context.sleepAvg - HEALTH_TARGETS.sleepMinutes),
          unit: "min",
          action: "over the useful range",
          detail: `${formatHours(context.sleepAvg)} a night is past the point of returns.`,
          potentialPoints: points,
        });
      }
      continue;
    }

    if (pillar.id === "exercise") {
      const shortfall =
        HEALTH_TARGETS.exerciseMinutesPerWeek - context.exerciseWeekly;
      if (shortfall > 5) {
        const sessions = Math.max(1, Math.round(shortfall / 30));
        recommendations.push({
          pillar: "exercise",
          title: `Add ${Math.round(shortfall)} minutes of training this week`,
          amount: Math.round(shortfall),
          unit: "min",
          action: "more training this week",
          detail: `${sessions} more ${sessions === 1 ? "session" : "sessions"} of 30 minutes, hard enough that talking is work.`,
          potentialPoints: points,
        });
      }
      continue;
    }

    if (pillar.id === "steps" && context.stepsAvg !== null) {
      const shortfall = HEALTH_TARGETS.steps - context.stepsAvg;
      if (shortfall > 200) {
        recommendations.push({
          pillar: "steps",
          title: `Walk ${number(shortfall)} more steps a day`,
          amount: Math.round(shortfall),
          unit: "steps",
          action: "more a day",
          detail: `About ${Math.max(1, Math.round(shortfall / 110))} minutes of walking.`,
          potentialPoints: points,
        });
      }
      continue;
    }

    if (pillar.id === "energy" && context.energyAvg !== null) {
      const shortfall = HEALTH_TARGETS.activeEnergyKcal - context.energyAvg;
      if (shortfall > 25) {
        recommendations.push({
          pillar: "energy",
          title: `Find ${number(shortfall)} more active kcal a day`,
          amount: Math.round(shortfall),
          unit: "kcal",
          action: "more a day",
          detail: "Cycling, stairs, carrying the shopping — all of it counts.",
          potentialPoints: points,
        });
      }
      continue;
    }

    if (pillar.id === "cardio") {
      const rhr = context.recovery?.restingHeartRate;
      const hrv = context.recovery?.hrv;
      if (rhr && rhr.delta > 0) {
        recommendations.push({
          pillar: "cardio",
          title: "Take the intensity down for a few days",
          amount: Math.round(rhr.delta),
          unit: "bpm",
          action: "above normal, ease off",
          detail: `Resting heart rate is ${Math.round(rhr.delta)}bpm above your normal. Easy aerobic work, early night.`,
          potentialPoints: points,
        });
      } else if (hrv && hrv.delta < 0) {
        recommendations.push({
          pillar: "cardio",
          title: "Protect the next two nights",
          amount: Math.round((-hrv.delta / hrv.baseline) * 100),
          unit: "%",
          action: "under baseline, sleep on it",
          detail: `HRV is ${Math.round((-hrv.delta / hrv.baseline) * 100)}% under baseline. Sleep moves this one; little else does.`,
          potentialPoints: points,
        });
      }
    }
  }

  return recommendations
    .sort((a, b) => b.potentialPoints - a.potentialPoints)
    .slice(0, 4);
}

/**
 * Headlines, by verdict.
 *
 * Short, declarative, and none of them congratulatory in the way that makes
 * an app feel like a slot machine. "Holding" is praise enough for a score in
 * the nineties; anyone who got there knows what they did.
 */
const HEADLINES: Record<HealthScoreResult["band"], string> = {
  excellent: "Holding the line",
  solid: "Mostly on track",
  fair: "One thing is dragging",
  poor: "Let's turn this around",
  unknown: "Not enough to go on",
};

/** The pillar's value, said the way a person would say it. */
function pillarValue(pillar: HealthPillar): string {
  if (pillar.value === null) return "nothing recorded";
  switch (pillar.unit) {
    case "minutesPerNight":
      return `${formatHours(pillar.value)} a night`;
    case "minutesPerWeek":
      return `${Math.round(pillar.value)} of ${pillar.target} minutes this week`;
    case "stepsPerDay":
      return `${number(pillar.value)} steps a day`;
    case "kcalPerDay":
      return `${number(pillar.value)} active kcal a day`;
    case "index":
      return `${Math.round(pillar.value)}bpm resting`;
  }
}

/**
 * The opening paragraph.
 *
 * Deliberately built from the pillars rather than written per-case: there are
 * five pillars and four bands, and a switch over every combination would be
 * forty branches of copy nobody would keep true as the scoring changed.
 */
function buildNarrative(
  score: number | null,
  band: HealthScoreResult["band"],
  pillars: HealthPillar[],
  recovery: RecoverySummary | null,
): HealthNarrative | null {
  const measured = pillars.filter((pillar) => pillar.score !== null);
  if (score === null || measured.length === 0) return null;

  const ranked = [...measured].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  );
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  // Deliberately terse. The score, the day count and the signal count are all
  // already on screen next to this paragraph; restating them in prose is how a
  // summary turns into a wall nobody reads twice.
  const sentences: string[] = []

  if (measured.length === 1) {
    sentences.push(`${best.label} is all that is measured: ${pillarValue(best)}.`);
  } else if (best.id === worst.id || (best.score ?? 0) - (worst.score ?? 0) < 12) {
    sentences.push(`Nothing stands out either way — ${pillarValue(best)}.`);
  } else {
    sentences.push(
      `${worst.label} is the drag, at ${pillarValue(worst)}. ${best.label} is carrying it at ${pillarValue(best)}.`,
    );
  }

  // Recovery runs on a separate clock from the habit score, so it only earns a
  // clause when it disagrees with the headline.
  if (recovery?.status === "compromised" && recovery.notes.length > 0) {
    sentences.push(recovery.notes[0]);
  }

  return { headline: HEADLINES[band], body: sentences.join(" ") };
}
