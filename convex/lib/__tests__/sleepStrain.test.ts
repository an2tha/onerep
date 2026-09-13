import { describe, expect, test } from "bun:test";
import { scoreSleep, scoreStrain } from "../sleepStrain";
describe("sleep quality", () => {
  test("missing duration remains unavailable; zero stages are not manufactured", () => {
    expect(scoreSleep({ date: "2026-09-01" }, [])).toBeNull();
    const night = scoreSleep({ date: "2026-09-01", sleepMinutes: 480 }, [])!;
    expect(night.score).toBe(100);
    expect(night.confidence).toBe("Low");
    expect(night.parts).toHaveLength(1);
    expect(night.stages).toEqual([]);
  });
  test("partial data redistributes weights and awake time affects continuity", () => {
    const night = scoreSleep(
      { date: "2026-09-01", sleepMinutes: 480, sleepAwakeMinutes: 120 },
      [],
    )!;
    expect(night.score).toBeLessThan(100);
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
    expect(n.parts.find((p) => p.key === "consistency")?.score).toBeGreaterThan(
      90,
    );
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
