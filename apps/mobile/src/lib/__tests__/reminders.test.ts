import { beforeEach, describe, expect, mock, test } from "bun:test"

let platform = "ios"
const cancelMock = mock(async () => undefined)
const requestPermissionsMock = mock(async () => ({ display: "granted" }))
const scheduleMock = mock(async () => undefined)

mock.module("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => platform,
  },
}))

mock.module("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    cancel: cancelMock,
    requestPermissions: requestPermissionsMock,
    schedule: scheduleMock,
  },
}))

const {
  DEFAULT_REMINDERS,
  formatReminderLabel,
  formatReminderTime,
  mergeReminderSettings,
  syncPushReminders,
} = await import("../reminders")

describe("reminder settings", () => {
  beforeEach(() => {
    platform = "ios"
    cancelMock.mockClear()
    requestPermissionsMock.mockReset()
    requestPermissionsMock.mockImplementation(async () => ({ display: "granted" }))
    scheduleMock.mockClear()
  })

  test("mergeReminderSettings fills missing reminders from defaults", () => {
    const merged = mergeReminderSettings({
      water: { enabled: true, hour: 9, minute: 15 },
    })

    expect(merged.water).toEqual({ enabled: true, hour: 9, minute: 15 })
    expect(merged.meal).toEqual(DEFAULT_REMINDERS.meal)
    expect(merged.workout).toEqual(DEFAULT_REMINDERS.workout)
    expect(merged.body).toEqual(DEFAULT_REMINDERS.body)
  })

  test("mergeReminderSettings preserves partial overrides within each reminder", () => {
    expect(
      mergeReminderSettings({
        meal: { enabled: true },
      } as never).meal
    ).toEqual({ enabled: true, hour: 12, minute: 30 })
  })

  test("formatReminderTime and formatReminderLabel render stable clock copy", () => {
    const reminder = { enabled: true, hour: 6, minute: 5 }

    expect(formatReminderTime(reminder)).toBe("6:05 AM")
    expect(formatReminderLabel(reminder)).toBe("Daily at 6:05 AM")
  })

  test("syncPushReminders returns unsupported on web without touching notifications", async () => {
    platform = "web"

    await expect(syncPushReminders(DEFAULT_REMINDERS)).resolves.toBe("unsupported")
    expect(cancelMock).not.toHaveBeenCalled()
    expect(requestPermissionsMock).not.toHaveBeenCalled()
    expect(scheduleMock).not.toHaveBeenCalled()
  })

  test("syncPushReminders cancels existing notifications and returns disabled when none are enabled", async () => {
    await expect(syncPushReminders(DEFAULT_REMINDERS)).resolves.toBe("disabled")

    expect(cancelMock).toHaveBeenCalledWith({
      notifications: [{ id: 9201 }, { id: 9202 }, { id: 9203 }, { id: 9204 }],
    })
    expect(requestPermissionsMock).not.toHaveBeenCalled()
    expect(scheduleMock).not.toHaveBeenCalled()
  })

  test("syncPushReminders returns denied when notification permission is rejected", async () => {
    requestPermissionsMock.mockImplementationOnce(async () => ({ display: "denied" }))

    await expect(
      syncPushReminders({
        ...DEFAULT_REMINDERS,
        water: { enabled: true, hour: 10, minute: 0 },
      })
    ).resolves.toBe("denied")

    expect(scheduleMock).not.toHaveBeenCalled()
  })

  test("syncPushReminders schedules only enabled reminders with expected ids and times", async () => {
    await expect(
      syncPushReminders({
        ...DEFAULT_REMINDERS,
        water: { enabled: true, hour: 8, minute: 0 },
        workout: { enabled: true, hour: 18, minute: 45 },
      })
    ).resolves.toBe("scheduled")

    expect(scheduleMock).toHaveBeenCalledTimes(1)
    const scheduleCalls = scheduleMock.mock.calls as unknown as Array<
      [
        {
          notifications: Array<{
            id: number
            schedule: {
              on: { hour: number; minute: number }
              allowWhileIdle: boolean
            }
          }>
        },
      ]
    >
    const payload = scheduleCalls[0][0]
    expect(payload.notifications).toHaveLength(2)
    expect(payload.notifications.map((n: { id: number }) => n.id)).toEqual([
      9201, 9203,
    ])
    expect(payload.notifications[0].schedule).toEqual({
      on: { hour: 8, minute: 0 },
      allowWhileIdle: true,
    })
    expect(payload.notifications[1].schedule).toEqual({
      on: { hour: 18, minute: 45 },
      allowWhileIdle: true,
    })
  })
})
