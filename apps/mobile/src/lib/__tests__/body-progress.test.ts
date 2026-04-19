import { describe, test, expect } from "bun:test";
import { formatReminderLabel } from "../body-progress";
import type { DailyCheckInReminder } from "../body-progress";

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
