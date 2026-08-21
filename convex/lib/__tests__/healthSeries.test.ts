import { describe, expect, test } from "bun:test";
import type { DailyMetrics } from "../recovery";
import { RANGE_DAYS, buildHealthSeries, shiftDate } from "../healthSeries";

const TODAY = "2026-08-09";

/** `count` days ending on TODAY, oldest first. */
function days(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    shiftDate(TODAY, -(count - 1 - index)),
  );
}

function rows(
  count: number,
  build: (date: string, index: number) => Omit<DailyMetrics, "date">,
): DailyMetrics[] {
  return days(count).map((date, index) => ({ date, ...build(date, index) }));
}

describe("shiftDate", () => {
  test("crosses month and year boundaries", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("buildHealthSeries", () => {
  test("a weekly range is seven daily points ending today", () => {
    const series = buildHealthSeries({
      rows: rows(30, () => ({ steps: 5_000 })),
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "W",
    });

    expect(series.metrics.steps.points).toHaveLength(7);
    expect(series.bucketDays).toBe(1);
    expect(series.end).toBe(TODAY);
    expect(series.metrics.steps.points.at(-1)!.date).toBe(TODAY);
  });

  test("a year is folded into weekly buckets rather than 364 slivers", () => {
    const series = buildHealthSeries({
      rows: rows(400, () => ({ steps: 5_000 })),
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "Y",
    });

    expect(series.bucketDays).toBe(7);
    expect(series.metrics.steps.points).toHaveLength(RANGE_DAYS.Y / 7);
    expect(series.metrics.steps.points[0].span).toBe(7);
  });

  test("missing days stay null rather than becoming zero", () => {
    // Only every other day has a reading.
    const sparse = rows(7, () => ({ steps: 6_000 })).filter(
      (_, index) => index % 2 === 0,
    );
    const series = buildHealthSeries({
      rows: sparse,
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "W",
    });

    const values = series.metrics.steps.points.map((point) => point.value);
    expect(values).toContain(null);
    // The average must ignore the gaps, not average them in as zeroes.
    expect(series.metrics.steps.average).toBe(6_000);
  });

  test("the delta compares against the preceding period of equal length", () => {
    // Last week 8,000 steps a day, the week before 4,000.
    const series = buildHealthSeries({
      rows: rows(14, (_, index) => ({ steps: index < 7 ? 4_000 : 8_000 })),
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "W",
    });

    expect(series.metrics.steps.average).toBe(8_000);
    expect(series.metrics.steps.previousAverage).toBe(4_000);
    expect(series.metrics.steps.deltaPercent).toBe(100);
  });

  test("no previous period means no delta rather than a fake improvement", () => {
    const series = buildHealthSeries({
      rows: rows(7, () => ({ steps: 8_000 })),
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "W",
    });

    expect(series.metrics.steps.average).toBe(8_000);
    expect(series.metrics.steps.previousAverage).toBeNull();
    expect(series.metrics.steps.deltaPercent).toBeNull();
  });

  test("a metric with no readings still returns a drawable empty series", () => {
    const series = buildHealthSeries({
      rows: rows(7, () => ({ steps: 8_000 })),
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "W",
    });

    const hrv = series.metrics.hrv;
    expect(hrv.points).toHaveLength(7);
    expect(hrv.points.every((point) => point.value === null)).toBe(true);
    expect(hrv.average).toBeNull();
    expect(hrv.min).toBeNull();
  });

  test("resting heart rate is marked as better when lower", () => {
    const series = buildHealthSeries({
      rows: rows(7, () => ({ restingHeartRateBpm: 55 })),
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "W",
    });

    expect(series.metrics.restingHeartRate.betterWhen).toBe("lower");
    expect(series.metrics.hrv.betterWhen).toBe("higher");
  });

  test("an untrained day with a health row counts as zero exercise, not a gap", () => {
    const trainedOn = shiftDate(TODAY, -2);
    const series = buildHealthSeries({
      rows: rows(7, () => ({ steps: 5_000 })),
      exerciseMinutesByDate: { [trainedOn]: 45 },
      today: TODAY,
      range: "W",
    });

    const points = series.metrics.exercise.points;
    expect(points.find((point) => point.date === trainedOn)!.value).toBe(45);
    // Every other day has a metrics row, so "did not train" is a real zero.
    expect(points.every((point) => point.value !== null)).toBe(true);
    expect(series.metrics.exercise.max).toBe(45);
  });

  test("exercise on a day with no health row at all is still recorded", () => {
    const series = buildHealthSeries({
      rows: [],
      exerciseMinutesByDate: { [TODAY]: 30 },
      today: TODAY,
      range: "W",
    });

    const points = series.metrics.exercise.points;
    expect(points.find((point) => point.date === TODAY)!.value).toBe(30);
    // Days with neither a row nor a session are unmeasured, not zeroes.
    expect(points.filter((point) => point.value === null)).toHaveLength(6);
  });

  test("recovery is scored per day against only what was known by then", () => {
    // Three weeks of steady readings, then a hard patch.
    const series = buildHealthSeries({
      rows: rows(60, (_, index) => ({
        sleepMinutes: index >= 57 ? 4 * 60 : 8 * 60,
        restingHeartRateBpm: index >= 57 ? 68 : 55,
        hrvMs: 60,
      })),
      exerciseMinutesByDate: {},
      today: TODAY,
      range: "W",
    });

    const points = series.metrics.recovery.points;
    expect(points.at(-1)!.value).not.toBeNull();
    // The strained tail must score below the settled days that preceded it.
    expect(points.at(-1)!.value!).toBeLessThan(points[0]!.value!);
  });
});
