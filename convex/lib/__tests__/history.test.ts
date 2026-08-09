import { describe, expect, test } from "bun:test";
import {
  buildHistoryBlock,
  daysInMonth,
  recentMonthKeys,
  summarizeMonth,
  type MonthSummary,
} from "../history";

function summary(overrides: Partial<MonthSummary> = {}): MonthSummary {
  return {
    month: "2026-07",
    sessions: 12,
    activeDays: 12,
    sets: 400,
    loggedFoodDays: 25,
    daysInMonth: 31,
    avgCalories: 2400,
    avgProtein: 160,
    weightStartKg: 80,
    weightEndKg: 79,
    ...overrides,
  };
}

describe("month arithmetic", () => {
  test("knows how long a month is, including February", () => {
    expect(daysInMonth("2026-01")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
  });

  test("walks back across a year boundary", () => {
    expect(recentMonthKeys("2026-02-09", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("summarizing one month", () => {
  const base = {
    month: "2026-07",
    foodDays: [
      {
        date: "2026-07-01",
        entries: [
          { calories: 600, protein: 40 },
          { calories: 900, protein: 60 },
        ],
      },
      { date: "2026-07-02", entries: [{ calories: 2000, protein: 140 }] },
      // Neighbouring months must not leak in, however the caller queried.
      { date: "2026-06-30", entries: [{ calories: 9999, protein: 999 }] },
      // A day with no entries is not a logged day.
      { date: "2026-07-03", entries: [] },
    ],
    workouts: [
      {
        date: "2026-07-01",
        exercises: [
          {
            sets: [
              { completed: true, type: "normal" },
              { completed: true, type: "warmup" },
              { completed: false, type: "normal" },
            ],
          },
        ],
      },
      { date: "2026-07-05", exercises: [{ sets: [{ completed: true }] }] },
      { date: "2026-08-01", exercises: [{ sets: [{ completed: true }] }] },
    ],
    measurements: [
      { loggedAt: "2026-07-28T08:00:00Z", weightKg: 78.4 },
      { loggedAt: "2026-07-02T08:00:00Z", weightKg: 80.2 },
      { loggedAt: "2026-06-01T08:00:00Z", weightKg: 90 },
    ],
  };

  test("counts only the month's own days", () => {
    const result = summarizeMonth(base);
    expect(result.loggedFoodDays).toBe(2);
    expect(result.sessions).toBe(2);
    expect(result.avgCalories).toBe(1750); // (1500 + 2000) / 2
    expect(result.avgProtein).toBe(120);
  });

  test("warm-ups and unfinished sets are not work", () => {
    expect(summarizeMonth(base).sets).toBe(2);
  });

  test("weight start and end come from the month's own readings, in order", () => {
    const result = summarizeMonth(base);
    // Deliberately supplied out of order: a backdated entry would otherwise
    // reverse the trend.
    expect(result.weightStartKg).toBe(80.2);
    expect(result.weightEndKg).toBe(78.4);
  });

  test("an unused month summarizes to nothing rather than crashing", () => {
    const result = summarizeMonth({
      month: "2026-03",
      foodDays: [],
      workouts: [],
      measurements: [],
    });
    expect(result.sessions).toBe(0);
    expect(result.avgCalories).toBeNull();
    expect(result.weightEndKg).toBeNull();
  });
});

describe("the block handed to the model", () => {
  test("nothing at all is null", () => {
    expect(buildHistoryBlock([])).toBeNull();
  });

  test("empty months are dropped rather than shown as zeroes", () => {
    // A gap in someone's history is not the same as a month they trained zero
    // times, and only one of those is worth a coach mentioning.
    const block = buildHistoryBlock([
      summary({ month: "2026-05" }),
      summary({
        month: "2026-06",
        sessions: 0,
        loggedFoodDays: 0,
        weightStartKg: null,
        weightEndKg: null,
      }),
      summary({ month: "2026-07" }),
    ]);
    expect(block!.months.map((month) => month.month)).toEqual([
      "2026-05",
      "2026-07",
    ]);
  });

  test("weight trend is per month across the span", () => {
    const block = buildHistoryBlock([
      summary({ month: "2026-05", weightStartKg: 84, weightEndKg: 83 }),
      summary({ month: "2026-07", weightStartKg: 80, weightEndKg: 78 }),
    ]);
    // 84 → 78 across two months.
    expect(block!.weightTrendKgPerMonth).toBe(-3);
  });

  test("one weighed month is not a trend", () => {
    const block = buildHistoryBlock([summary({ month: "2026-07" })]);
    expect(block!.weightTrendKgPerMonth).toBeNull();
  });

  test("consistency is logged days over calendar days", () => {
    const block = buildHistoryBlock([
      summary({ month: "2026-07", loggedFoodDays: 31, daysInMonth: 31 }),
    ]);
    expect(block!.loggingConsistency).toBe(1);
  });

  test("months come out in order however they went in", () => {
    const block = buildHistoryBlock([
      summary({ month: "2026-07" }),
      summary({ month: "2026-05" }),
      summary({ month: "2026-06" }),
    ]);
    expect(block!.months.map((month) => month.month)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  test("six months stay small enough to be worth the budget", () => {
    const block = buildHistoryBlock(
      recentMonthKeys("2026-08-09", 6).map((month) => summary({ month })),
    );
    expect(JSON.stringify(block).length).toBeLessThan(1200);
  });
});
