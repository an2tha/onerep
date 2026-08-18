import { describe, expect, test } from "bun:test";
import { summarizeRecovery, type DailyMetrics } from "../recovery";
import {
  HEALTH_TARGETS,
  computeHealthScore,
  recoveryScore,
} from "../healthScore";

const TODAY = "2026-08-09";

/** `count` days ending on TODAY, oldest first. */
function days(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${TODAY}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (count - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

function window(
  base: Omit<DailyMetrics, "date">,
  { total = 21 } = {},
): DailyMetrics[] {
  return days(total).map((date) => ({ date, ...base }));
}

/** A week of days carrying `minutes` of exercise on three of them. */
function exerciseWeek(minutes: number) {
  const dates = days(7);
  return {
    [dates[1]]: minutes / 3,
    [dates[3]]: minutes / 3,
    [dates[5]]: minutes / 3,
  };
}

const ON_TARGET = {
  sleepMinutes: HEALTH_TARGETS.sleepMinutes,
  steps: HEALTH_TARGETS.steps,
  activeEnergyKcal: HEALTH_TARGETS.activeEnergyKcal,
  restingHeartRateBpm: 55,
  hrvMs: 60,
};

describe("computeHealthScore", () => {
  test("a person hitting every guideline scores near the top", () => {
    const rows = window(ON_TARGET);
    const result = computeHealthScore({
      days: rows.slice(-7),
      exerciseMinutesByDate: exerciseWeek(
        HEALTH_TARGETS.exerciseMinutesPerWeek,
      ),
      recovery: summarizeRecovery(rows, TODAY),
    });

    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.band).toBe("excellent");
    expect(result.recommendations).toEqual([]);
  });

  test("no data at all yields a null score rather than a zero", () => {
    const result = computeHealthScore({
      days: [],
      exerciseMinutesByDate: {},
      recovery: null,
    });

    expect(result.score).toBeNull();
    expect(result.band).toBe("unknown");
    expect(result.recoveryScore).toBeNull();
  });

  test("a missing pillar is dropped rather than scored zero", () => {
    // Steps only, and perfect. Owning no watch must not read as poor health.
    const stepsOnly = computeHealthScore({
      days: days(7).map((date) => ({ date, steps: HEALTH_TARGETS.steps })),
      exerciseMinutesByDate: {},
      recovery: null,
    });

    const steps = stepsOnly.pillars.find((pillar) => pillar.id === "steps");
    const sleep = stepsOnly.pillars.find((pillar) => pillar.id === "sleep");
    expect(sleep?.score).toBeNull();
    expect(sleep?.weight).toBe(0);
    // Exercise is present-but-zero because there are days to have trained on.
    expect(steps?.weight).toBeGreaterThan(0);
    expect(stepsOnly.score).not.toBeNull();
  });

  test("overshooting one pillar cannot paper over a broken one", () => {
    const rows = window({ ...ON_TARGET, sleepMinutes: 4 * 60, steps: 40_000 });
    const result = computeHealthScore({
      days: rows.slice(-7),
      exerciseMinutesByDate: exerciseWeek(
        HEALTH_TARGETS.exerciseMinutesPerWeek,
      ),
      recovery: summarizeRecovery(rows, TODAY),
    });

    const steps = result.pillars.find((pillar) => pillar.id === "steps");
    expect(steps?.score).toBe(100); // capped, not 500
    // Four hours a night must never read as excellent, whatever else is true.
    expect(result.score).toBeLessThanOrEqual(69);
    expect(result.band).not.toBe("excellent");
  });

  test("sleeping far too long is not scored as better than enough", () => {
    const short = computeHealthScore({
      days: days(7).map((date) => ({ date, sleepMinutes: 11 * 60 })),
      exerciseMinutesByDate: {},
      recovery: null,
    });
    const sleep = short.pillars.find((pillar) => pillar.id === "sleep");
    expect(sleep?.score).toBeLessThan(100);
  });
});

describe("recommendations", () => {
  test("shortfalls come back quantified in their own unit", () => {
    const rows = window({
      ...ON_TARGET,
      sleepMinutes: 6 * 60,
      steps: 5_000,
    });
    const result = computeHealthScore({
      days: rows.slice(-7),
      exerciseMinutesByDate: exerciseWeek(60),
      recovery: summarizeRecovery(rows, TODAY),
    });

    const titles = result.recommendations.map((item) => item.title);
    expect(titles).toContain("Go to bed 60 minutes earlier");
    expect(titles).toContain("Walk 3,000 more steps a day");
    expect(titles).toContain("Add 90 minutes of training this week");
  });

  test("ranked by points recoverable, and never more than four", () => {
    const rows = window({
      sleepMinutes: 5 * 60,
      steps: 1_000,
      activeEnergyKcal: 50,
      restingHeartRateBpm: 55,
      hrvMs: 60,
    });
    const result = computeHealthScore({
      days: rows.slice(-7),
      exerciseMinutesByDate: {},
      recovery: summarizeRecovery(rows, TODAY),
    });

    expect(result.recommendations.length).toBeLessThanOrEqual(4);
    const points = result.recommendations.map((item) => item.potentialPoints);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
    // Exercise leads rather than sleep: it is at a flat zero against a
    // quarter of the score, which is more recoverable ground than five hours
    // of sleep against three tenths of it.
    expect(result.recommendations[0]?.pillar).toBe("exercise");
  });
});

describe("the narrative", () => {
  test("names the pillar carrying the score and the one dragging it", () => {
    const rows = window({ ...ON_TARGET, steps: 1_200 });
    const result = computeHealthScore({
      days: rows.slice(-7),
      exerciseMinutesByDate: exerciseWeek(
        HEALTH_TARGETS.exerciseMinutesPerWeek,
      ),
      recovery: summarizeRecovery(rows, TODAY),
    });

    expect(result.narrative).not.toBeNull();
    expect(result.narrative!.body).toContain("Steps is the drag");
    // Every claim carries its number rather than an adjective.
    expect(result.narrative!.body).toContain("1,200 steps a day");
    // Steps at 1,200 is a failing pillar, so the cap applies and the band
    // drops to fair — the headline has to agree with the number above it.
    expect(result.narrative!.headline).toBe("One thing is dragging");
  });

  test("a single measured pillar is stated, not ranked against itself", () => {
    // Workouts recorded but no ambient daily rows: exercise is the only
    // pillar with anything behind it. Any `days` at all would add the others.
    const result = computeHealthScore({
      days: [],
      exerciseMinutesByDate: exerciseWeek(90),
      recovery: null,
    });

    const body = result.narrative!.body;
    expect(body).not.toContain("carrying it");
    expect(body).not.toContain("the drag");
  });

  test("nothing measured means no paragraph rather than an empty one", () => {
    const result = computeHealthScore({
      days: [],
      exerciseMinutesByDate: {},
      recovery: null,
    });
    expect(result.narrative).toBeNull();
  });

  test("a compromised week earns its own sentence", () => {
    const rows = days(21).map((date, index) => ({
      date,
      sleepMinutes: index >= 18 ? 4 * 60 : 8 * 60,
      restingHeartRateBpm: index >= 18 ? 68 : 55,
      steps: HEALTH_TARGETS.steps,
    }));
    const result = computeHealthScore({
      days: rows.slice(-7),
      exerciseMinutesByDate: exerciseWeek(
        HEALTH_TARGETS.exerciseMinutesPerWeek,
      ),
      recovery: summarizeRecovery(rows, TODAY),
    });

    expect(result.narrative!.body).toContain("the last few days have been hard");
  });
});

describe("recoveryScore", () => {
  test("never contradicts the status the coach was given", () => {
    const ready = summarizeRecovery(window(ON_TARGET), TODAY);
    expect(ready?.status).toBe("ready");
    expect(recoveryScore(ready)).toBeGreaterThanOrEqual(70);

    // Short sleep and an elevated resting rate: two signals, so "compromised".
    const strained = summarizeRecovery(
      days(21).map((date, index) => ({
        date,
        sleepMinutes: index >= 18 ? 4 * 60 : 8 * 60,
        restingHeartRateBpm: index >= 18 ? 68 : 55,
        hrvMs: 60,
      })),
      TODAY,
    );
    expect(strained?.status).toBe("compromised");
    const score = recoveryScore(strained);
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(50);
  });

  test("an unknown status has no score rather than a bad one", () => {
    const thin = summarizeRecovery(
      [{ date: TODAY, sleepMinutes: 420 }],
      TODAY,
    );
    expect(recoveryScore(thin)).toBeNull();
  });
});
