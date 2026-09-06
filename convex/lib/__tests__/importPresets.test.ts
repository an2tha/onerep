import { describe, expect, test } from "bun:test";
import { applyImportPlan, extractRecords, headersOf } from "../dataImport";
import { presetImportPlan } from "../importPresets";

function parse(value: unknown, unit: "kg" | "lb" = "kg") {
  const rows = extractRecords(
    JSON.stringify(value),
    "application/json",
    "history.json",
  );
  const plan = presetImportPlan(headersOf(rows), unit);
  expect(plan).not.toBeNull();
  return { plan: plan!, result: applyImportPlan(rows, plan!) };
}

describe("built-in workout parsers", () => {
  test("Hevy API JSON keeps exercise names, sets, kilograms and effort", () => {
    const { result } = parse({
      page: 1,
      workouts: [
        {
          title: "Push",
          start_time: "2026-08-20T11:00:00Z",
          exercises: [
            {
              title: "Bench Press",
              exercise_template_id: "ABC",
              sets: [
                { type: "warmup", weight_kg: 20, reps: 10 },
                { type: "normal", weight_kg: 80, reps: 6, rpe: 8 },
              ],
            },
          ],
        },
      ],
    });
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]!.exercises[0]!.name).toBe("Bench Press");
    expect(result.workouts[0]!.exercises[0]!.sets).toMatchObject([
      { weight: 20, reps: 10, type: "warmup" },
      { weight: 80, reps: 6, rpe: 8 },
    ]);
  });
  test("Strong JSON rows respect explicit per-row units over the selected default", () => {
    const { result } = parse([
      {
        Date: "2026-08-20",
        "Workout Name": "Pull",
        "Exercise Name": "Deadlift",
        Weight: 220.462,
        "Weight Unit": "lb",
        Reps: 5,
      },
    ]);
    expect(result.workouts[0]!.exercises[0]!.sets[0]!.weight).toBe(100);
  });
  test("Strong missing units use the user's explicit selection", () => {
    const { result, plan } = parse(
      [
        {
          Date: "2026-08-20",
          "Workout Name": "Pull",
          "Exercise Name": "Deadlift",
          Weight: 220.462,
          Reps: 5,
        },
      ],
      "lb",
    );
    expect(result.workouts[0]!.exercises[0]!.sets[0]!.weight).toBe(100);
    expect(plan.columns.weightUnit).toBeUndefined();
  });
  test("FitNotes equivalent JSON rows handle pounds", () => {
    const { result } = parse([
      {
        Date: "2026-08-20",
        Exercise: "Squat",
        "Weight (lbs)": 220.462,
        Reps: 5,
      },
    ]);
    expect(result.workouts[0]!.exercises[0]!.sets[0]!.weight).toBe(100);
  });
  test("generic nested JSON imports multiple exercises and rejects malformed dates", () => {
    const { result } = parse([
      {
        date: "2026-02-30",
        title: "Invalid",
        exercises: [{ name: "Squat", sets: [{ weight_kg: 50, reps: 5 }] }],
      },
      {
        date: "2026-08-20",
        title: "Legs",
        exercises: [
          { name: "Squat", sets: [{ weight_kg: 50, reps: 5 }] },
          { name: "Lunge", sets: [{ weight_kg: 20, reps: 10 }] },
        ],
      },
    ]);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]!.exercises).toHaveLength(2);
    expect(result.skippedRows).toBe(1);
  });
  test("does not claim unknown or incomplete formats", () => {
    expect(presetImportPlan(["Date", "Exercise", "Reps"])).toBeNull();
    expect(presetImportPlan(["start_time", "title", "weight"])).toBeNull();
  });
  test("Hevy CSV uses the same deterministic plan as flat JSON", () => {
    const rows = extractRecords(
      "title,start_time,exercise_title,weight_kg,reps\nLegs,2026-08-20,Squat,60,8",
      "text/csv",
      "hevy.csv",
    );
    const plan = presetImportPlan(headersOf(rows))!;
    expect(
      applyImportPlan(rows, plan).workouts[0]!.exercises[0]!.sets[0]!.weight,
    ).toBe(60);
  });
});

test("generic fallback respects selected units and explicit source units", async () => {
  const { fallbackPlan } = await import("../dataImport");
  const rows = [
    { Date: "2026-08-20", Exercise: "Squat", Weight: "220.462", Reps: "5" },
  ];
  const plan = fallbackPlan(headersOf(rows), "lb");
  expect(
    applyImportPlan(rows, plan).workouts[0]!.exercises[0]!.sets[0]!.weight,
  ).toBe(100);
  expect(
    fallbackPlan(["Date", "Exercise", "Weight (kg)", "Reps"], "lb").weightUnit,
  ).toBe("kg");
});

test("explicit underscore-separated units override the default", async () => {
  const { fallbackPlan } = await import("../dataImport");
  const rows = [
    { Date: "2026-08-20", Exercise: "Squat", weight_kg: "100", Reps: "5" },
  ];
  expect(
    applyImportPlan(rows, fallbackPlan(headersOf(rows), "lb")).workouts[0]!
      .exercises[0]!.sets[0]!.weight,
  ).toBe(100);
  expect(
    fallbackPlan(["Date", "Exercise", "weight_lbs", "Reps"], "kg").weightUnit,
  ).toBe("lb");
});
