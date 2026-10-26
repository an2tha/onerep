import { describe, expect, test } from "bun:test";
import { scoreSleep, scoreStrain } from "../sleepStrain";
describe("sleep duration and context", () => {
  test("invalid main-period detail falls back consistently to recorded duration", () => {
    const history = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-09-0${i + 1}`,
      sleepMinutes: 420,
      mainSleepMinutes: 0,
    }));
    const night = scoreSleep(
      { date: "2026-09-08", sleepMinutes: 420, mainSleepMinutes: 0 },
      history,
    )!;
    expect(night.minutes).toBe(420);
    expect(night.baseline).toBe(420);
    expect(night.shortfall).toBe(420);
  });
  test("missing duration remains unavailable; zero stages are not manufactured", () => {
    expect(scoreSleep({ date: "2026-09-01" }, [])).toBeNull();
    const night = scoreSleep({ date: "2026-09-01", sleepMinutes: 480 }, [])!;
    expect(night.score).toBe(100);
    expect(night.confidence).toBe("Low");
    expect(night.parts).toHaveLength(1);
    expect(night.stages).toEqual([]);
  });
  test("awake time remains visible without changing duration goal progress", () => {
    const night = scoreSleep(
      { date: "2026-09-01", sleepMinutes: 480, sleepAwakeMinutes: 120 },
      [],
    )!;
    expect(night.score).toBe(100);
    expect(night.parts.reduce((s, p) => s + p.weight, 0)).toBe(100);
    expect(night.efficiency).toBe(80);
  });
  test("overlapping stage totals are excluded", () => {
    const n = scoreSleep(
      {
        date: "2026-09-01",
        sleepMinutes: 400,
        sleepDeepMinutes: 200,
        sleepRemMinutes: 200,
        sleepLightMinutes: 200,
      },
      [],
    )!;
    expect(n.stages).toEqual([]);
    expect(n.parts).toHaveLength(1);
  });
  test("future nights and different devices cannot contaminate baselines", () => {
    const n = scoreSleep(
      { date: "2026-09-01", sleepMinutes: 480, provider: "apple_health" },
      [
        { date: "2026-09-02", sleepMinutes: 900, provider: "apple_health" },
        { date: "2026-08-30", sleepMinutes: 200, provider: "health_connect" },
      ],
    )!;
    expect(n.baseline).toBeNull();
  });
  test("midnight wrap does not create a 24 hour timing deviation", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      date: `2026-08-${20 + i}`,
      sleepMinutes: 480,
      sleepStartMinutes: 1430,
      sleepEndMinutes: 470,
    }));
    const n = scoreSleep(
      {
        date: "2026-09-01",
        sleepMinutes: 480,
        sleepStartMinutes: 10,
        sleepEndMinutes: 490,
      },
      history,
    )!;
    expect(n.timingShift).toBe(20);
    expect(n.score).toBe(100);
  });
});
describe("strain", () => {
  test("sampled cardiac demand is used only with enough coverage", () => {
    const sparse = scoreStrain(
      { date: "2026-09-01", cardiacMinutes: { "120": 10 } },
      [],
      [],
    );
    const measured = scoreStrain(
      {
        date: "2026-09-01",
        restingHeartRateBpm: 60,
        cardiacMinutes: { "120": 180 },
      },
      [],
      [],
    );
    expect(sparse.physiological).toBeNull();
    expect(measured.physiological).toBeGreaterThan(0);
    expect(measured.cardiacCoverage).toBe(180);
  });
  test("missing readings are unknown", () =>
    expect(scoreStrain(undefined, [], []).score).toBeNull());
  test("recorded zero is meaningful", () =>
    expect(
      scoreStrain({ date: "2026-09-01", activeEnergyKcal: 0 }, [], []).score,
    ).toBe(0));
  test("workout energy is removed and steps are not added on top", () => {
    const a = scoreStrain(
      { date: "2026-09-01", activeEnergyKcal: 500, steps: 20000 },
      [{ id: "1", name: "Run", date: "2026-09-01", minutes: 40, energy: 500 }],
      [],
    );
    expect(a.physiological).toBe(0);
    expect(a.training).toBeGreaterThan(0);
  });
  test("training is monotonic and bounded", () => {
    const w = {
      id: "1",
      name: "Lift",
      date: "2026-09-01",
      minutes: 40,
      hardSets: 10,
      effort: 8,
    };
    const low = scoreStrain(undefined, [w], []),
      high = scoreStrain(undefined, [{ ...w, minutes: 120, hardSets: 30 }], []);
    expect(high.score!).toBeGreaterThan(low.score!);
    expect(high.score!).toBeLessThanOrEqual(100);
  });
});

describe("stable sleep comparisons", () => {
  const day = {
    date: "2026-09-10",
    provider: "apple_health",
    sleepMinutes: 360,
  };
  test("additional data and a completed baseline never inflate a short night", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      ...day,
      date: `2026-09-0${i + 1}`,
      sleepStartMinutes: 0,
      sleepEndMinutes: 360,
      sleepDeepMinutes: 60,
      sleepRemMinutes: 60,
      sleepLightMinutes: 240,
    }));
    const sparse = scoreSleep(day, [])!;
    const rich = scoreSleep(
      {
        ...day,
        sleepAwakeMinutes: 0,
        sleepStartMinutes: 0,
        sleepEndMinutes: 360,
        sleepDeepMinutes: 60,
        sleepRemMinutes: 60,
        sleepLightMinutes: 240,
      },
      history,
    )!;
    expect(sparse.score).toBe(75);
    expect(rich.score).toBe(75);
    expect(rich.band).toBe("Below duration goal");
    expect(rich.usualRange).toEqual({ low: 360, high: 360 });
    expect(rich.coverageChanged).toBe(true);
  });
  test("shortfall uses calendar days, main sleep, and each day's goal without credit", () => {
    const result = scoreSleep(
      { ...day, sleepMinutes: 500, mainSleepMinutes: 360, napMinutes: 140 },
      [
        { ...day, date: "2026-09-01", sleepMinutes: 100 },
        { ...day, date: "2026-09-04", sleepMinutes: 300 },
        { ...day, date: "2026-09-05", sleepMinutes: 700 },
        { ...day, date: "2026-09-07", sleepMinutes: 420 },
        { ...day, date: "2026-09-08", sleepMinutes: 0 },
      ],
      450,
      [{ date: "2026-09-07", targetMinutes: 450 }],
      480,
    )!;
    expect(result.shortfall).toBe(180 + 30 + 90);
    expect(result.shortfallNights).toBe(4);
    expect(result.napMinutes).toBe(140);
    expect(result.totalMinutes).toBe(500);
  });
  test("sparse, stale, and corrected readings do not create a usual range", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      ...day,
      date: `2026-07-${10 + i}`,
      sleepMinutes: 480,
    }));
    expect(scoreSleep(day, history)!.baseline).toBeNull();
    const corrected = scoreSleep({ ...day, manualFields: ["sleepMinutes"] }, [
      { ...day, date: "2026-09-09" },
    ])!;
    expect(corrected.provider).toBe("manual");
    expect(corrected.providerChanged).toBe(true);
    expect(corrected.baseline).toBeNull();
  });
});
