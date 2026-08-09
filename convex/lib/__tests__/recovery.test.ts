import { describe, expect, test } from "bun:test";
import { summarizeRecovery, type DailyMetrics } from "../recovery";

const TODAY = "2026-08-09";

/** `count` days ending on TODAY, oldest first. */
function days(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${TODAY}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (count - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

/**
 * A steady baseline with the last `recentCount` days overridden — the shape
 * every one of these questions actually takes.
 */
function withRecent(
  base: Omit<DailyMetrics, "date">,
  recent: Omit<DailyMetrics, "date">,
  { total = 21, recentCount = 3 } = {},
): DailyMetrics[] {
  const dates = days(total);
  return dates.map((date, index) => ({
    date,
    ...(index >= total - recentCount ? recent : base),
  }));
}

describe("having enough to say anything", () => {
  test("no rows at all is null, not a shrug", () => {
    expect(summarizeRecovery([], TODAY)).toBeNull();
  });

  test("a handful of readings is not a baseline", () => {
    const summary = summarizeRecovery(
      days(4).map((date) => ({ date, sleepMinutes: 420 })),
      TODAY,
    );
    expect(summary!.status).toBe("unknown");
    expect(summary!.sleep).toBeNull();
  });

  test("rows outside the window do not prop up a baseline", () => {
    const stale = days(40)
      .slice(0, 10)
      .map((date) => ({ date, sleepMinutes: 420 }));
    const summary = summarizeRecovery(stale, TODAY, 28);
    // Everything is older than the window, so there is nothing to summarise.
    expect(summary).toBeNull();
  });
});

describe("reading the signals", () => {
  test("a steady sleeper with a steady heart is ready", () => {
    const summary = summarizeRecovery(
      withRecent(
        { sleepMinutes: 450, restingHeartRateBpm: 55 },
        { sleepMinutes: 445, restingHeartRateBpm: 55 },
      ),
      TODAY,
    );
    expect(summary!.status).toBe("ready");
    expect(summary!.notes).toEqual([]);
  });

  test("an hour less sleep is noticed and named in hours", () => {
    const summary = summarizeRecovery(
      withRecent({ sleepMinutes: 450 }, { sleepMinutes: 380 }),
      TODAY,
    );
    expect(summary!.notes[0]).toContain("1h 10m less");
    expect(summary!.sleep!.delta).toBeLessThan(0);
  });

  test("one bad signal is steady, not a crisis", () => {
    const summary = summarizeRecovery(
      withRecent(
        { sleepMinutes: 450, restingHeartRateBpm: 55 },
        { sleepMinutes: 380, restingHeartRateBpm: 55 },
      ),
      TODAY,
    );
    // A short week happens. Calling it "compromised" is how this feature gets
    // itself ignored.
    expect(summary!.status).toBe("steady");
  });

  test("two signals agreeing is a pattern worth calling", () => {
    const summary = summarizeRecovery(
      withRecent(
        { sleepMinutes: 450, restingHeartRateBpm: 55 },
        { sleepMinutes: 380, restingHeartRateBpm: 60 },
      ),
      TODAY,
    );
    expect(summary!.status).toBe("compromised");
    expect(summary!.notes).toHaveLength(2);
    expect(summary!.notes[1]).toContain("Resting heart rate is up 5bpm");
  });

  test("suppressed variability counts as a signal", () => {
    const summary = summarizeRecovery(
      withRecent(
        { sleepMinutes: 450, hrvMs: 60 },
        { sleepMinutes: 380, hrvMs: 48 },
      ),
      TODAY,
    );
    expect(summary!.status).toBe("compromised");
    expect(summary!.notes.some((note) => note.includes("variability"))).toBe(
      true,
    );
  });

  test("chronically short sleep is raised even when it is the norm", () => {
    // Baseline and recent are both 5h20. Nothing deviated, so a pure
    // deviation model would say "ready" to someone running on five hours.
    const summary = summarizeRecovery(
      withRecent({ sleepMinutes: 320 }, { sleepMinutes: 320 }),
      TODAY,
    );
    expect(summary!.status).toBe("steady");
    expect(summary!.notes[0]).toContain("5h 20m");
  });

  test("a slow drift is visible because the baseline includes recent days", () => {
    // Sleep decaying steadily across three weeks: each week is only slightly
    // worse than the last, which is exactly the pattern a trailing-baseline
    // comparison would miss entirely.
    const dates = days(21);
    const drifting = dates.map((date, index) => ({
      date,
      sleepMinutes: 480 - index * 8,
    }));
    const summary = summarizeRecovery(drifting, TODAY);
    expect(summary!.sleep!.delta).toBeLessThan(-45);
    expect(summary!.notes.length).toBeGreaterThan(0);
  });
});

describe("robustness", () => {
  test("the baseline is a median, so one wrecked night does not move it", () => {
    const dates = days(21);
    const rows = dates.map((date, index) => ({
      date,
      // One two-hour night in the middle of an otherwise consistent month.
      sleepMinutes: index === 10 ? 120 : 450,
    }));
    const summary = summarizeRecovery(rows, TODAY);
    expect(summary!.sleep!.baseline).toBe(450);
    expect(summary!.status).toBe("ready");
  });

  test("missing and zero readings are skipped rather than averaged in", () => {
    const dates = days(21);
    const rows = dates.map((date, index) => ({
      date,
      sleepMinutes: 450,
      // The watch was off the wrist for a stretch: no heart rate at all.
      restingHeartRateBpm: index < 10 ? undefined : 55,
    }));
    const summary = summarizeRecovery(rows, TODAY);
    expect(summary!.restingHeartRate!.readings).toBe(11);
    expect(summary!.restingHeartRate!.baseline).toBe(55);
  });

  test("a phone with steps and nothing else is a normal row", () => {
    const summary = summarizeRecovery(
      days(21).map((date) => ({ date, steps: 8000 })),
      TODAY,
    );
    // Steps alone say nothing about recovery, so there is no verdict to give.
    expect(summary!.status).toBe("unknown");
    expect(summary!.steps!.baseline).toBe(8000);
    expect(summary!.notes).toEqual([]);
  });

  test("the block stays small enough to earn its place in the budget", () => {
    const summary = summarizeRecovery(
      withRecent(
        { sleepMinutes: 450, restingHeartRateBpm: 55, hrvMs: 60, steps: 9000 },
        { sleepMinutes: 360, restingHeartRateBpm: 62, hrvMs: 45, steps: 4000 },
      ),
      TODAY,
    );
    expect(JSON.stringify(summary).length).toBeLessThan(800);
  });
});
