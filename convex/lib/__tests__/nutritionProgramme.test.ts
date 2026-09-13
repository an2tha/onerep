import { expect, test } from "bun:test";
import {
  isScheduledFast,
  localProgrammeTime,
  plannedWorkoutStrain,
  programmeCompatibility,
  programmeDay,
  type Programme,
} from "../nutritionProgramme";
const plan: Programme = {
  goal: "step_down",
  weeks: 6,
  startDate: "2026-09-01",
  baselineCalories: 2400,
  changePercent: 10,
  protein: 150,
  fat: 65,
  fastingHours: 14,
  eatingStart: "09:00",
  timezone: "Europe/Berlin",
};
test("phase progression holds baseline, steps down, stabilises, and ends", () => {
  expect(programmeDay(plan, "2026-08-31").active).toBe(false);
  expect(programmeDay(plan, "2026-09-01").targets.calories).toBe(2400);
  expect(programmeDay(plan, "2026-09-08").targets.calories).toBe(2340);
  expect(programmeDay(plan, "2026-09-29").targets.calories).toBe(2160);
  expect(programmeDay(plan, "2026-10-06").phase).toBe("Stabilise");
  expect(programmeDay(plan, "2026-10-13").active).toBe(false);
  expect(
    programmeDay({ ...plan, endedDate: "2026-09-10" }, "2026-09-10").active,
  ).toBe(false);
});
test("eating windows wrap midnight and use programme timezone", () => {
  expect(isScheduledFast(plan, 9 * 60)).toBe(false);
  expect(isScheduledFast(plan, 19 * 60)).toBe(true);
  expect(isScheduledFast({ ...plan, eatingStart: "20:00" }, 60)).toBe(false);
  expect(isScheduledFast({ ...plan, fastingHours: 0 }, 0)).toBe(false);
  expect(
    localProgrammeTime("Europe/Berlin", new Date("2026-09-01T23:00:00Z")),
  ).toEqual({ date: "2026-09-02", minute: 60 });
});
test("compatibility is deterministic, handles missing data, and tightens during fasting", () => {
  expect(programmeCompatibility(plan, "2026-09-29", 600, null).status).toBe(
    "unknown",
  );
  expect(programmeCompatibility(plan, "2026-09-29", 600, 65).status).toBe(
    "watch",
  );
  expect(programmeCompatibility(plan, "2026-09-29", 600, 66).status).toBe(
    "too_demanding",
  );
  expect(programmeCompatibility(plan, "2026-09-29", 1200, 60).status).toBe(
    "too_demanding",
  );
  expect(programmeCompatibility(plan, "2026-09-29", 600, 60, true).status).toBe(
    "too_demanding",
  );
});
test("strain uses hard sets and full cardio duration, with unknown instead of zero for empty data", () => {
  expect(plannedWorkoutStrain({})).toBeNull();
  expect(
    plannedWorkoutStrain({ x: { sets: [{ type: "warmup" }] } }),
  ).toBeNull();
  expect(
    plannedWorkoutStrain({
      x: {
        cardio: {
          durationHours: "1",
          durationMinutes: "30",
          durationSeconds: "0",
        },
      },
    }),
  ).toBe(51);
  expect(plannedWorkoutStrain({ x: { sets: [{ rpe: "8" }] } })).toBe(9);
});
