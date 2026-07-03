import { describe, test, expect } from "bun:test";
import {
  bodyMeasurementCarryForwardDraft,
  formatReminderLabel,
  localDateInputValue,
} from "../body-progress";
import type {
  BodyMeasurementEntry,
  DailyCheckInReminder,
} from "../body-progress";

// Note: syncDailyCheckInReminder is excluded from unit tests because it
// requires Capacitor's LocalNotifications API (native mobile platform).

describe("formatReminderLabel", () => {
  function makeReminder(hour: number, minute: number): DailyCheckInReminder {
    return { enabled: true, hour, minute };
  }

  test("formats midnight correctly", () => {
    const label = formatReminderLabel(makeReminder(0, 0));
    // 12:00 AM in en-US locale
    expect(label).toMatch(/12:00\s?AM/i);
    expect(label).toContain("Daily at");
  });

  test("formats noon correctly", () => {
    const label = formatReminderLabel(makeReminder(12, 0));
    expect(label).toMatch(/12:00\s?PM/i);
    expect(label).toContain("Daily at");
  });

  test("formats morning time correctly", () => {
    const label = formatReminderLabel(makeReminder(8, 30));
    expect(label).toMatch(/8:30\s?AM/i);
    expect(label).toContain("Daily at");
  });

  test("formats afternoon time correctly", () => {
    const label = formatReminderLabel(makeReminder(14, 45));
    expect(label).toMatch(/2:45\s?PM/i);
    expect(label).toContain("Daily at");
  });

  test("formats evening time correctly", () => {
    const label = formatReminderLabel(makeReminder(20, 0));
    expect(label).toMatch(/8:00\s?PM/i);
    expect(label).toContain("Daily at");
  });

  test("pads single-digit minutes with leading zero", () => {
    const label = formatReminderLabel(makeReminder(9, 5));
    expect(label).toContain("9:05");
  });

  test("always starts with 'Daily at'", () => {
    const times = [
      makeReminder(0, 0),
      makeReminder(6, 30),
      makeReminder(12, 0),
      makeReminder(18, 15),
      makeReminder(23, 59),
    ];
    for (const reminder of times) {
      expect(formatReminderLabel(reminder)).toMatch(/^Daily at /);
    }
  });

  test("works with reminder disabled (label is still formatted)", () => {
    const label = formatReminderLabel({ enabled: false, hour: 7, minute: 0 });
    expect(label).toContain("Daily at");
    expect(label).toMatch(/7:00\s?AM/i);
  });

  test("handles end of day (23:59)", () => {
    const label = formatReminderLabel(makeReminder(23, 59));
    expect(label).toMatch(/11:59\s?PM/i);
  });
});

describe("BodyMeasurementEntry type shape", () => {
  test("can create a valid entry object", () => {
    const entry = {
      clientId: "uuid-1234",
      loggedAt: "2024-01-15",
      weightKg: 80,
      bodyFatPct: 18.5,
    };
    expect(entry.clientId).toBe("uuid-1234");
    expect(entry.loggedAt).toBe("2024-01-15");
    expect(entry.weightKg).toBe(80);
    expect(entry.bodyFatPct).toBe(18.5);
  });

  test("can create minimal entry with only required fields", () => {
    const entry = {
      clientId: "uuid-5678",
      loggedAt: "2024-02-01",
    };
    expect(entry.clientId).toBeTruthy();
    expect(entry.loggedAt).toBeTruthy();
  });
});

describe("bodyMeasurementCarryForwardDraft", () => {
  test("copies numeric measurement fields as input strings", () => {
    const entry: BodyMeasurementEntry = {
      clientId: "measurement-1",
      loggedAt: "2026-06-30",
      weightKg: 82.4,
      bodyFatPct: 18,
      waistCm: 84.5,
      hipsCm: 98,
      chestCm: 104,
      notes: "Do not copy notes",
      photoUrl: "https://example.com/photo.jpg",
    };

    expect(bodyMeasurementCarryForwardDraft(entry)).toMatchObject({
      weightKg: "82.4",
      bodyFatPct: "18",
      waistCm: "84.5",
      hipsCm: "98",
      chestCm: "104",
      armsCm: "",
      thighsCm: "",
      calvesCm: "",
      neckCm: "",
      filledCount: 5,
      hasAdvancedMeasurements: false,
    });
  });

  test("opens advanced measurements when a carried value lives there", () => {
    const entry: BodyMeasurementEntry = {
      clientId: "measurement-2",
      loggedAt: "2026-06-30",
      armsCm: 36,
      calvesCm: 39.5,
    };

    expect(bodyMeasurementCarryForwardDraft(entry)).toMatchObject({
      armsCm: "36",
      calvesCm: "39.5",
      filledCount: 2,
      hasAdvancedMeasurements: true,
    });
  });

  test("returns null when the latest entry has no reusable measurements", () => {
    expect(
      bodyMeasurementCarryForwardDraft({
        clientId: "measurement-3",
        loggedAt: "2026-06-30",
        notes: "Photo only",
        photoUrl: "https://example.com/photo.jpg",
      })
    ).toBeNull();
    expect(bodyMeasurementCarryForwardDraft(null)).toBeNull();
  });
});

describe("localDateInputValue", () => {
  test("formats local date parts for date inputs", () => {
    expect(localDateInputValue(new Date(2026, 0, 5, 9, 30))).toBe(
      "2026-01-05"
    );
    expect(localDateInputValue(new Date(2026, 10, 15, 9, 30))).toBe(
      "2026-11-15"
    );
  });

  test("uses local calendar date instead of UTC ISO date", () => {
    const localJustAfterMidnight = new Date(2026, 0, 1, 0, 30);
    expect(localDateInputValue(localJustAfterMidnight)).toBe("2026-01-01");
  });
});
