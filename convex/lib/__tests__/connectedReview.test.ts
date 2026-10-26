import { describe, expect, test } from "bun:test";
import { buildConnectedReview } from "../connectedReview";
import { scoreSleep } from "../sleepStrain";
const date = "2026-09-10";
const night = (day: string, minutes = 360) =>
  scoreSleep({ date: day, sleepMinutes: minutes }, [])!;
const input = { date, nights: [], sessions: [], checkIns: [], foodDays: [] };
describe("connected observations", () => {
  test("missing days never imply repeated short sleep or low intake", () => {
    const result = buildConnectedReview({
      ...input,
      nights: [night("2026-09-07"), night(date)],
    });
    expect(result.shortNights).toBe(false);
    expect(result.focus).toBe("coverage");
    expect(result.foodDays).toBe(0);
    expect(result.checkIn).toBeNull();
  });
  test("two consecutive short nights are a review prompt, not a prescribed plan", () => {
    const result = buildConnectedReview({
      ...input,
      nights: [night("2026-09-09"), night(date)],
      sessions: [{ id: "1", name: "Leg day", date, minutes: 40, hardSets: 12 }],
    });
    expect(result.focus).toBe("sleep");
    expect(result.lastSession?.workingSets).toBe(12);
    expect(result.signals).toBe(2);
    expect(result).not.toHaveProperty("recommendedSets");
  });
  test("today's check-in takes precedence; old and non-daily check-ins do not", () => {
    const result = buildConnectedReview({
      ...input,
      checkIns: [
        { date: "2026-09-09", energy: 1, soreness: 5, sleepQuality: 1 },
        { date, kind: "post_workout", energy: 1, soreness: 5, sleepQuality: 1 },
      ],
    });
    expect(result.checkIn).toBeNull();
    expect(
      buildConnectedReview({
        ...input,
        checkIns: [{ date, energy: 2, soreness: 2, sleepQuality: 3 }],
      }).focus,
    ).toBe("checkIn");
  });
});


test("latest session follows time within a day and unknown times remain ambiguous", () => {
  const morning = { id: "am", name: "Morning run", date, minutes: 30, startedAt: 1000 };
  const evening = { id: "pm", name: "Evening strength", date, minutes: 45, startedAt: 2000 };
  for (const sessions of [[morning, evening], [evening, morning]])
    expect(buildConnectedReview({ ...input, sessions }).lastSession?.name).toBe("Evening strength");
  expect(buildConnectedReview({ ...input, sessions: [morning, { ...evening, startedAt: undefined }] }).lastSession).toBeNull();
});
