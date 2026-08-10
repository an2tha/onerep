import { describe, expect, test } from "bun:test";
import {
  applyImportPlan,
  buildPlanRequest,
  csvRecords,
  extractRecords,
  fallbackPlan,
  headersOf,
  importPlanSchema,
  jsonRecords,
  parseCellNumber,
  parseCsv,
  parseImportDate,
  type ImportPlan,
} from "../dataImport";

describe("parseCsv", () => {
  test("handles quoted fields, embedded commas and doubled quotes", () => {
    const rows = parseCsv('a,"b,c","say ""hi"""\n1,2,3\n');
    expect(rows).toEqual([
      ["a", "b,c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  test("sniffs semicolon and tab delimiters from the header row", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("keeps a final row that lacks a trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvRecords", () => {
  test("keys rows by header and skips trailing empty lines", () => {
    const records = csvRecords("Date,Exercise\n2024-01-01,Squat\n\n");
    expect(records).toEqual([{ Date: "2024-01-01", Exercise: "Squat" }]);
  });

  test("strips a BOM from the first header", () => {
    const records = csvRecords("﻿Date,Reps\n2024-01-01,5");
    expect(Object.keys(records[0]!)).toEqual(["Date", "Reps"]);
  });
});

describe("jsonRecords", () => {
  test("finds the record array wherever it is buried", () => {
    const records = jsonRecords(
      JSON.stringify({
        meta: { version: 2 },
        data: { entries: [{ date: "2024-01-01", weight: 80 }] },
      }),
    );
    expect(records).toEqual([{ date: "2024-01-01", weight: "80" }]);
  });

  test("explodes nested workout → exercises → sets into per-set rows", () => {
    const records = jsonRecords(
      JSON.stringify([
        {
          date: "2024-01-01",
          title: "Push day",
          exercises: [
            {
              name: "Bench Press",
              sets: [
                { weight_kg: 100, reps: 5 },
                { weight_kg: 100, reps: 4 },
              ],
            },
            { name: "Dips", sets: [{ weight_kg: 0, reps: 12 }] },
          ],
        },
      ]),
    );
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      date: "2024-01-01",
      title: "Push day",
      "exercises.name": "Bench Press",
      "exercises.sets.weight_kg": "100",
      "exercises.sets.reps": "5",
    });
    expect(records[2]!["exercises.name"]).toBe("Dips");
  });

  test("returns nothing for malformed JSON rather than throwing", () => {
    expect(jsonRecords("not json")).toEqual([]);
  });
});

describe("extractRecords", () => {
  test("falls back to content sniffing when type and extension say nothing", () => {
    expect(extractRecords('[{"a":1}]', "", "export")).toEqual([{ a: "1" }]);
    expect(extractRecords("a,b\n1,2", "", "export")).toEqual([
      { a: "1", b: "2" },
    ]);
  });
});

describe("parseImportDate", () => {
  test("accepts ISO dates and datetimes", () => {
    expect(parseImportDate("2024-03-05")).toBe("2024-03-05");
    expect(parseImportDate("2024-03-05 07:30:00")).toBe("2024-03-05");
  });

  test("resolves ambiguous triples by the dayFirst flag", () => {
    expect(parseImportDate("01/02/2024", false)).toBe("2024-01-02");
    expect(parseImportDate("01/02/2024", true)).toBe("2024-02-01");
  });

  test("lets an unambiguous component override a wrong flag", () => {
    expect(parseImportDate("13/01/2024", false)).toBe("2024-01-13");
    expect(parseImportDate("01/13/2024", true)).toBe("2024-01-13");
  });

  test("reads epoch seconds and milliseconds", () => {
    expect(parseImportDate("1704067200")).toBe("2024-01-01");
    expect(parseImportDate("1704067200000")).toBe("2024-01-01");
  });

  test("rejects garbage and impossible dates", () => {
    expect(parseImportDate("yesterday-ish")).toBeNull();
    expect(parseImportDate("2024-02-31")).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

describe("parseCellNumber", () => {
  test("survives units and European decimals", () => {
    expect(parseCellNumber("100 kg")).toBe(100);
    expect(parseCellNumber("82,5")).toBe(82.5);
    expect(parseCellNumber("1,234.5")).toBe(1234.5);
    expect(parseCellNumber("n/a")).toBeNull();
  });
});

const workoutPlan: ImportPlan = {
  kind: "workouts",
  weightUnit: "lb",
  columns: {
    date: "Date",
    workoutName: "Workout Name",
    exerciseName: "Exercise Name",
    weight: "Weight",
    reps: "Reps",
    rpe: "RPE",
  },
};

describe("applyImportPlan (workouts)", () => {
  test("groups rows into workouts and converts pounds to kilograms", () => {
    const records = [
      {
        Date: "2024-01-01",
        "Workout Name": "Push",
        "Exercise Name": "Bench Press",
        Weight: "225",
        Reps: "5",
        RPE: "8",
      },
      {
        Date: "2024-01-01",
        "Workout Name": "Push",
        "Exercise Name": "Bench Press",
        Weight: "225",
        Reps: "4",
        RPE: "",
      },
    ];
    const { workouts, skippedRows } = applyImportPlan(records, workoutPlan);
    expect(skippedRows).toBe(0);
    expect(workouts).toHaveLength(1);
    const workout = workouts[0]!;
    expect(workout.date).toBe("2024-01-01");
    expect(workout.sessionId).toBe("import:2024-01-01:1");
    expect(workout.exercises[0]!.name).toBe("Bench Press");
    expect(workout.exercises[0]!.id).toBe("import:bench-press");
    expect(workout.exercises[0]!.sets).toHaveLength(2);
    expect(workout.exercises[0]!.sets[0]!.weight).toBeCloseTo(102.06, 1);
    expect(workout.exercises[0]!.sets[0]!.rpe).toBe(8);
    expect(workout.exercises[0]!.sets[1]!.rpe).toBeUndefined();
    expect(workout.completedAt).toBe(Date.parse("2024-01-01T12:00:00Z"));
  });

  test("a per-cell unit beats the plan default", () => {
    const records = [
      {
        Date: "2024-01-01",
        "Workout Name": "A",
        "Exercise Name": "Squat",
        Weight: "100 kg",
        Reps: "3",
        RPE: "",
      },
    ];
    const { workouts } = applyImportPlan(records, workoutPlan);
    expect(workouts[0]!.exercises[0]!.sets[0]!.weight).toBe(100);
  });

  test("a third same-day session merges into the second instead of vanishing", () => {
    const records = ["Morning", "Lunch", "Evening"].map((name, index) => ({
      Date: "2024-01-01",
      "Workout Name": name,
      "Exercise Name": `Lift ${index}`,
      Weight: "50",
      Reps: "5",
      RPE: "",
    }));
    const { workouts } = applyImportPlan(records, workoutPlan);
    expect(workouts).toHaveLength(2);
    expect(workouts[1]!.exercises.map((exercise) => exercise.name)).toEqual([
      "Lift 1",
      "Lift 2",
    ]);
  });

  test("rows without a readable date or exercise are counted, not guessed", () => {
    const records = [
      {
        Date: "???",
        "Workout Name": "A",
        "Exercise Name": "Squat",
        Weight: "100",
        Reps: "3",
        RPE: "",
      },
    ];
    const { workouts, skippedRows } = applyImportPlan(records, workoutPlan);
    expect(workouts).toHaveLength(0);
    expect(skippedRows).toBe(1);
  });
});

describe("applyImportPlan (measurements)", () => {
  const plan: ImportPlan = {
    kind: "measurements",
    weightUnit: "kg",
    lengthUnit: "in",
    columns: { date: "Date", bodyWeight: "Weight", waist: "Waist" },
  };

  test("converts inches, keys one check-in per date, keeps the last value", () => {
    const records = [
      { Date: "2024-01-01", Weight: "80", Waist: "32" },
      { Date: "2024-01-01", Weight: "80.6", Waist: "" },
    ];
    const { measurements, skippedRows } = applyImportPlan(records, plan);
    expect(skippedRows).toBe(0);
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({
      clientId: "import:2024-01-01",
      loggedAt: "2024-01-01",
      weightKg: 80.6,
      waistCm: 81.3,
    });
  });

  test("drops fields outside human ranges and skips rows left empty", () => {
    const records = [{ Date: "2024-01-01", Weight: "8000", Waist: "" }];
    const { measurements, skippedRows } = applyImportPlan(records, plan);
    expect(measurements).toHaveLength(0);
    expect(skippedRows).toBe(1);
  });
});

describe("fallbackPlan", () => {
  test("recognises a Strong-style strength CSV without a model", () => {
    const plan = fallbackPlan([
      "Date",
      "Workout Name",
      "Exercise Name",
      "Set Order",
      "Weight",
      "Reps",
      "RPE",
    ]);
    expect(plan.kind).toBe("workouts");
    expect(plan.columns.date).toBe("Date");
    expect(plan.columns.exerciseName).toBe("Exercise Name");
    expect(plan.columns.weight).toBe("Weight");
  });

  test("recognises a bodyweight CSV and does not mistake it for workouts", () => {
    const plan = fallbackPlan(["Date", "Bodyweight (lbs)", "Body Fat %"]);
    expect(plan.kind).toBe("measurements");
    expect(plan.weightUnit).toBe("lb");
    expect(plan.columns.bodyWeight).toBe("Bodyweight (lbs)");
  });

  test("admits defeat on columns it cannot place", () => {
    expect(fallbackPlan(["foo", "bar"]).kind).toBe("unsupported");
  });

  test("always yields a schema-valid plan", () => {
    for (const headers of [
      ["Date", "Exercise Name", "Reps", "Weight"],
      ["Date", "Weight"],
      ["x"],
    ]) {
      expect(importPlanSchema.safeParse(fallbackPlan(headers)).success).toBe(
        true,
      );
    }
  });
});

describe("buildPlanRequest", () => {
  test("caps the sample instead of shipping the file to the model", () => {
    const records = Array.from({ length: 500 }, (_, index) => ({
      Date: "2024-01-01",
      "Exercise Name": `Exercise ${index}`,
      Reps: "5",
    }));
    const request = buildPlanRequest("history.csv", records);
    expect(request).toContain("Rows: 500");
    expect(request.split("\n").length).toBeLessThan(25);
    expect(headersOf(records)).toEqual(["Date", "Exercise Name", "Reps"]);
  });
});
