import { describe, expect, test } from "bun:test";
import {
  assessDeload,
  summarizeProgramming,
  type LoggedWorkout,
} from "../programming";

const TODAY = "2026-08-09";

/** A session of one lift, n sets at the given load and reps. */
function session(
  date: string,
  name: string,
  weight: number,
  reps: number,
  sets = 3,
  extra: Partial<{ category: string }> = {},
): LoggedWorkout {
  return {
    date,
    exercises: [
      {
        id: `ex_${name}`,
        name,
        ...extra,
        sets: Array.from({ length: sets }, () => ({
          type: "normal",
          weight,
          reps,
          completed: true,
        })),
      },
    ],
  };
}

/** Dates counting back from TODAY, oldest first. */
function daysAgo(...offsets: number[]) {
  return offsets.map((offset) => {
    const date = new Date(`${TODAY}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
  });
}

describe("reading a lift's direction", () => {
  test("a load that keeps climbing is progressing", () => {
    const [d1, d2, d3, d4] = daysAgo(28, 21, 14, 7);
    const summary = summarizeProgramming(
      [
        session(d1, "Squat", 100, 5),
        session(d2, "Squat", 105, 5),
        session(d3, "Squat", 110, 5),
        session(d4, "Squat", 115, 5),
      ],
      TODAY,
    );

    const squat = summary!.lifts[0];
    expect(squat.status).toBe("progressing");
    expect(squat.suggestion).toBeNull();
    expect(squat.trendPctPerWeek).toBeGreaterThan(0);
  });

  test("the same numbers for three sessions is a stall, not progress", () => {
    const [d1, d2, d3, d4] = daysAgo(28, 21, 14, 7);
    const summary = summarizeProgramming(
      [
        session(d1, "Bench Press", 80, 5),
        session(d2, "Bench Press", 80, 5),
        session(d3, "Bench Press", 80, 5),
        session(d4, "Bench Press", 80, 5),
      ],
      TODAY,
    );

    const bench = summary!.lifts[0];
    expect(bench.status).toBe("stalled");
    expect(bench.suggestion).toContain("without a new best");
  });

  test("rounding-sized movement is noise, not a personal best", () => {
    const [d1, d2, d3, d4] = daysAgo(28, 21, 14, 7);
    // 100×5 → 100.5×5 is well inside the noise band; calling it progress is
    // how an app tells someone they are advancing while they stagnate.
    const summary = summarizeProgramming(
      [
        session(d1, "Deadlift", 100, 5),
        session(d2, "Deadlift", 100, 5),
        session(d3, "Deadlift", 100, 5),
        session(d4, "Deadlift", 100.5, 5),
      ],
      TODAY,
    );
    expect(summary!.lifts[0].status).toBe("stalled");
  });

  test("a lift going backwards says so, and does not suggest more load", () => {
    const [d1, d2, d3, d4] = daysAgo(28, 21, 14, 7);
    const summary = summarizeProgramming(
      [
        session(d1, "Overhead Press", 60, 5),
        session(d2, "Overhead Press", 60, 5),
        session(d3, "Overhead Press", 55, 5),
        session(d4, "Overhead Press", 50, 5),
      ],
      TODAY,
    );

    const press = summary!.lifts[0];
    expect(press.status).toBe("regressing");
    expect(press.suggestion).toContain("Hold the load");
    expect(press.trendPctPerWeek).toBeLessThan(0);
  });

  test("two sessions is not enough to have a direction", () => {
    const [d1, d2] = daysAgo(14, 7);
    const summary = summarizeProgramming(
      [session(d1, "Row", 70, 8), session(d2, "Row", 75, 8)],
      TODAY,
    );

    const row = summary!.lifts[0];
    expect(row.status).toBe("new");
    expect(row.trendPctPerWeek).toBeNull();
    expect(row.suggestion).toBeNull();
  });

  test("an extra rep at the same load is progress, and gets left alone", () => {
    const [d1, d2, d3, d4] = daysAgo(28, 21, 14, 7);
    const summary = summarizeProgramming(
      [
        session(d1, "Curl", 20, 8),
        session(d2, "Curl", 20, 8),
        session(d3, "Curl", 20, 8),
        session(d4, "Curl", 20, 9),
      ],
      TODAY,
    );

    const curl = summary!.lifts[0];
    // 8 → 9 reps is a ~3% jump in estimated max. That is real progress, not
    // rounding, and a lift that is moving does not need advice.
    expect(curl.status).toBe("progressing");
    expect(curl.suggestion).toBeNull();
  });

  test("rebuilding reps after a drop in load is not punished as regression", () => {
    const [d1, d2, d3, d4] = daysAgo(28, 21, 14, 7);
    // A 100kg five, then a deliberate drop to 85 and 6 → 7 → 8 reps back up.
    // Against the old peak this reads as regressing, but the person is doing
    // exactly the right thing and must not be told to hold.
    const summary = summarizeProgramming(
      [
        session(d1, "Front Squat", 100, 5),
        session(d2, "Front Squat", 85, 6),
        session(d3, "Front Squat", 85, 7),
        session(d4, "Front Squat", 85, 8),
      ],
      TODAY,
    );

    expect(summary!.lifts[0].suggestion).toContain("Add the smallest jump");
  });
});

describe("what counts as work", () => {
  test("warm-ups are excluded from volume and from the best set", () => {
    const [date] = daysAgo(3);
    const summary = summarizeProgramming(
      [
        {
          date,
          exercises: [
            {
              name: "Squat",
              sets: [
                { type: "warmup", weight: 200, reps: 5, completed: true },
                { type: "normal", weight: 100, reps: 5, completed: true },
              ],
            },
          ],
        },
      ],
      TODAY,
    );

    expect(summary!.weeklySets[0].sets).toBe(1);
    // The 200kg warm-up would otherwise be this user's best-ever squat.
    expect(summary!.lifts[0].bestE1rm).toBeLessThan(130);
  });

  test("sets the user never completed do not count", () => {
    const [date] = daysAgo(3);
    const summary = summarizeProgramming(
      [
        {
          date,
          exercises: [
            {
              name: "Squat",
              sets: [
                { type: "normal", weight: 100, reps: 5, completed: true },
                { type: "normal", weight: 120, reps: 5, completed: false },
              ],
            },
          ],
        },
      ],
      TODAY,
    );
    expect(summary!.weeklySets[0].sets).toBe(1);
    expect(summary!.lifts[0].topWeight ?? 100).toBe(100);
  });

  test("cardio contributes volume but never an estimated max", () => {
    const [date] = daysAgo(3);
    const summary = summarizeProgramming(
      [session(date, "Treadmill", 1, 1, 2, { category: "cardio" })],
      TODAY,
    );
    expect(summary!.lifts).toHaveLength(0);
    expect(summary!.weeklySets[0].sets).toBe(2);
  });

  test("one lift logged under two names stays one lift", () => {
    const [d1, d2, d3] = daysAgo(21, 14, 7);
    const summary = summarizeProgramming(
      [
        session(d1, "Bench Press", 80, 5),
        session(d2, "bench press", 82.5, 5),
        session(d3, "  Bench   Press  ", 85, 5),
      ],
      TODAY,
    );
    expect(summary!.lifts).toHaveLength(1);
    expect(summary!.lifts[0].sessions).toBe(3);
  });

  test("two logs on one day are one session, not two of progress", () => {
    const [date] = daysAgo(5);
    const summary = summarizeProgramming(
      [session(date, "Squat", 100, 5), session(date, "Squat", 110, 5)],
      TODAY,
    );
    expect(summary!.lifts[0].sessions).toBe(1);
    // The better of the two is what happened that day.
    expect(summary!.lifts[0].latestE1rm).toBeGreaterThan(120);
  });

  test("work outside the window is not counted", () => {
    const [old, recent] = daysAgo(200, 5);
    const summary = summarizeProgramming(
      [session(old, "Squat", 200, 5), session(recent, "Squat", 100, 5)],
      TODAY,
    );
    expect(summary!.totalSessions).toBe(1);
    expect(summary!.lifts[0].bestE1rm).toBeLessThan(130);
  });

  test("no logs at all yields nothing rather than an empty verdict", () => {
    expect(summarizeProgramming([], TODAY)).toBeNull();
  });
});

describe("the deload call", () => {
  const stalled = (name: string) => ({
    name,
    sessions: 5,
    lastDate: TODAY,
    status: "stalled" as const,
    bestE1rm: 100,
    latestE1rm: 100,
    trendPctPerWeek: 0,
    suggestion: null,
  });

  const weeks = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      week: `2026-W${30 + index}`,
      sets: 60,
    }));

  test("two stalled lifts after three weeks of volume earns the call", () => {
    const verdict = assessDeload(
      [stalled("Squat"), stalled("Bench")],
      weeks(4),
    );
    expect(verdict!.recommended).toBe(true);
    expect(verdict!.reason).toContain("Squat");
  });

  test("one stalled lift is not overreaching", () => {
    const verdict = assessDeload([stalled("Squat")], weeks(4));
    expect(verdict!.recommended).toBe(false);
  });

  test("a beginner two weeks in is not overreached, they are a beginner", () => {
    const verdict = assessDeload(
      [stalled("Squat"), stalled("Bench")],
      weeks(2),
    );
    expect(verdict!.recommended).toBe(false);
  });

  test("lifts with no history yet cannot justify backing off", () => {
    const fresh = { ...stalled("Squat"), status: "new" as const };
    expect(
      assessDeload([fresh, { ...fresh, name: "Bench" }], weeks(6)),
    ).toBeNull();
  });

  test("regression is named as such in the reason", () => {
    const falling = { ...stalled("Deadlift"), status: "regressing" as const };
    const verdict = assessDeload([falling, stalled("Squat")], weeks(5));
    expect(verdict!.recommended).toBe(true);
    expect(verdict!.reason).toContain("going backwards");
  });

  describe("with measured recovery", () => {
    const compromised = {
      status: "compromised",
      notes: ["Resting heart rate is up 6bpm on your normal."],
    };

    test("one stuck lift plus bad recovery is enough", () => {
      // Alone, a single stall is not overreaching. Alongside a body that is
      // visibly not recovering, it is the same picture from two angles.
      expect(assessDeload([stalled("Squat")], weeks(4)).recommended).toBe(
        false,
      );
      const verdict = assessDeload([stalled("Squat")], weeks(4), compromised);
      expect(verdict!.recommended).toBe(true);
    });

    test("the training evidence leads and the sensor reading follows", () => {
      const verdict = assessDeload([stalled("Squat")], weeks(4), compromised);
      // Leading with a heart-rate statistic to justify a week off reads like
      // an app looking for a reason.
      expect(verdict!.reason.indexOf("Squat")).toBeLessThan(
        verdict!.reason.indexOf("Resting heart rate"),
      );
      expect(verdict!.reason).toContain("1 lift has stalled");
    });

    test("bad recovery alone never triggers it", () => {
      // Someone sleeping badly who is still adding weight to the bar does not
      // need to be told to stop, and would rightly resent it.
      const climbing = { ...stalled("Squat"), status: "progressing" as const };
      const verdict = assessDeload([climbing], weeks(6), compromised);
      expect(verdict!.recommended).toBe(false);
    });

    test("good recovery leaves the ordinary threshold alone", () => {
      const ready = { status: "ready", notes: [] };
      expect(
        assessDeload([stalled("Squat")], weeks(4), ready).recommended,
      ).toBe(false);
      expect(
        assessDeload([stalled("Squat"), stalled("Bench")], weeks(4), ready)
          .recommended,
      ).toBe(true);
    });

    test("no watch means the call is made on training alone", () => {
      expect(assessDeload([stalled("Squat")], weeks(4), null).recommended).toBe(
        false,
      );
      expect(
        assessDeload([stalled("Squat")], weeks(4), {
          status: "unknown",
          notes: [],
        }).recommended,
      ).toBe(false);
    });

    test("weeks of volume are still required, however bad the recovery", () => {
      // A beginner two weeks in with a wrecked sleep score is not overreached.
      const verdict = assessDeload([stalled("Squat")], weeks(2), compromised);
      expect(verdict!.recommended).toBe(false);
    });
  });
});

describe("the shape handed to the model", () => {
  test("stays small enough to be worth its place in the budget", () => {
    const workouts: LoggedWorkout[] = [];
    for (let index = 0; index < 40; index += 1) {
      const [date] = daysAgo(index * 2);
      workouts.push({
        date,
        exercises: ["Squat", "Bench Press", "Deadlift", "Row", "Curl"].map(
          (name) => ({
            name,
            sets: Array.from({ length: 4 }, () => ({
              type: "normal",
              weight: 100 + index,
              reps: 5,
              completed: true,
            })),
          }),
        ),
      });
    }

    const summary = summarizeProgramming(workouts, TODAY);
    expect(summary!.lifts.length).toBeLessThanOrEqual(8);
    expect(summary!.weeklySets.length).toBeLessThanOrEqual(6);
    // The whole point is conclusions instead of logs: a couple of thousand
    // characters replacing thirty raw sessions.
    expect(JSON.stringify(summary).length).toBeLessThan(3000);
  });
});
