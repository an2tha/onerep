import { beforeEach, describe, expect, mock, test } from "bun:test"

let platform = "ios"
const cancelMock = mock(async () => undefined)
const requestPermissionsMock = mock(async () => ({ display: "granted" }))
const pendingMock = mock(async () => ({
  notifications: [] as Array<{
    id: number
    title: string
    extra?: { recoveryReminderKind: string }
  }>,
}))
const checkPermissionsMock = mock(async () => ({ display: "granted" }))
const scheduleMock = mock(async () => undefined)
const createChannelMock = mock(async () => undefined)

mock.module("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => platform,
    isNativePlatform: () => platform !== "web",
  },
}))

mock.module("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    getPending: pendingMock,
    checkPermissions: checkPermissionsMock,
    cancel: cancelMock,
    requestPermissions: requestPermissionsMock,
    schedule: scheduleMock,
    createChannel: createChannelMock,
  },
}))

const {
  DEFAULT_REMINDERS,
  setRecoveryReminderPolicy,
  scheduleEntryReminder,
  formatReminderLabel,
  formatReminderTime,
  mergeReminderSettings,
  scheduleCoachCheckInNotification,
  syncPushReminders,
} = await import("../reminders")

describe("reminder settings", () => {
  beforeEach(() => {
    setRecoveryReminderPolicy({ training: false, food: false })
    pendingMock.mockReset()
    pendingMock.mockImplementation(async () => ({ notifications: [] }))
    platform = "ios"
    cancelMock.mockClear()
    requestPermissionsMock.mockReset()
    requestPermissionsMock.mockImplementation(async () => ({
      display: "granted",
    }))
    scheduleMock.mockClear()
    createChannelMock.mockClear()
  })

  test("mergeReminderSettings fills missing reminders from defaults", () => {
    const merged = mergeReminderSettings({
      water: { enabled: true, hour: 9, minute: 15 },
    })

    expect(merged.water).toEqual({ enabled: true, hour: 9, minute: 15 })
    expect(merged.meal).toEqual(DEFAULT_REMINDERS.meal)
    expect(merged.workout).toEqual(DEFAULT_REMINDERS.workout)
    expect(merged.body).toEqual(DEFAULT_REMINDERS.body)
    expect(merged.supplement).toEqual(DEFAULT_REMINDERS.supplement)
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

    await expect(syncPushReminders(DEFAULT_REMINDERS)).resolves.toBe(
      "unsupported"
    )
    expect(cancelMock).not.toHaveBeenCalled()
    expect(requestPermissionsMock).not.toHaveBeenCalled()
    expect(scheduleMock).not.toHaveBeenCalled()
    expect(cancelMock).not.toHaveBeenCalled()
  })

  test("syncPushReminders cancels existing notifications and returns disabled when none are enabled", async () => {
    await expect(syncPushReminders(DEFAULT_REMINDERS)).resolves.toBe("disabled")

    expect(cancelMock).toHaveBeenCalledWith({
      notifications: [
        { id: 9201 },
        { id: 9202 },
        { id: 9203 },
        { id: 9204 },
        { id: 9205 },
      ],
    })
    expect(requestPermissionsMock).not.toHaveBeenCalled()
    expect(scheduleMock).not.toHaveBeenCalled()
  })

  test("syncPushReminders returns denied when notification permission is rejected", async () => {
    requestPermissionsMock.mockImplementationOnce(async () => ({
      display: "denied",
    }))

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
              repeats: boolean
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
      repeats: true,
      allowWhileIdle: true,
    })
    expect(payload.notifications[1].schedule).toEqual({
      on: { hour: 18, minute: 45 },
      repeats: true,
      allowWhileIdle: true,
    })
  })

  test("routes reminders to their own Android channel so they can be muted alone", async () => {
    platform = "android"

    await syncPushReminders({
      ...DEFAULT_REMINDERS,
      water: { enabled: true, hour: 8, minute: 0 },
    })

    expect(createChannelMock).toHaveBeenCalled()
    const payload = (
      scheduleMock.mock.calls as unknown as Array<
        [{ notifications: Array<{ channelId?: string }> }]
      >
    )[0][0]
    expect(payload.notifications[0].channelId).toBe("reminders")
  })

  test("sets no channel on iOS, which has no such concept", async () => {
    await syncPushReminders({
      ...DEFAULT_REMINDERS,
      water: { enabled: true, hour: 8, minute: 0 },
    })

    expect(createChannelMock).not.toHaveBeenCalled()
    const payload = (
      scheduleMock.mock.calls as unknown as Array<
        [{ notifications: Array<{ channelId?: string }> }]
      >
    )[0][0]
    expect(payload.notifications[0].channelId).toBeUndefined()
  })

  test("schedules a Coach-created daily check-in with its own stable notification", async () => {
    await expect(
      scheduleCoachCheckInNotification({
        checkInId: "check-in-creatine",
        title: "Creatine check-in",
        prompt: "Take 5 g with a full glass of water.",
        hour: 15,
        minute: 0,
      })
    ).resolves.toBe("scheduled")

    expect(cancelMock).toHaveBeenCalledTimes(1)
    const payload = (
      scheduleMock.mock.calls as unknown as Array<
        [
          {
            notifications: Array<{
              title: string
              body: string
              schedule: unknown
              extra: unknown
            }>
          },
        ]
      >
    )[0][0].notifications[0]
    expect(payload.title).toBe("Creatine check-in")
    expect(payload.body).toBe("Take 5 g with a full glass of water.")
    expect(payload.schedule).toEqual({
      on: { hour: 15, minute: 0 },
      repeats: true,
      allowWhileIdle: true,
    })
    expect(payload.extra).toEqual({
      route: "/coach",
      scheduledCheckInId: "check-in-creatine",
    })
  })
})

describe("recovery reminder policy", () => {
  test("quiet reminders cancel existing one-shots, preserve water and restore saved workout choices", async () => {
    platform = "ios"
    scheduleMock.mockClear()
    cancelMock.mockClear()
    pendingMock.mockImplementationOnce(async () => ({
      notifications: [
        { id: 96001, title: "Scheduled workout" },
        { id: 96002, title: "Meal log reminder" },
        { id: 96003, title: "Unrelated reminder" },
      ],
    }))
    const settings = {
      ...DEFAULT_REMINDERS,
      workout: { enabled: true, hour: 18, minute: 0 },
      meal: { enabled: true, hour: 12, minute: 0 },
      water: { enabled: true, hour: 10, minute: 0 },
    }
    setRecoveryReminderPolicy({ training: true, food: true })
    await syncPushReminders(settings, false)
    expect(cancelMock).toHaveBeenCalledWith({
      notifications: [{ id: 96001 }, { id: 96002 }],
    })
    expect(
      (
        scheduleMock.mock.calls.at(-1) as unknown as [
          { notifications: Array<{ id: number }> },
        ]
      )[0].notifications.map((n) => n.id)
    ).toEqual([9201])
    expect(await scheduleEntryReminder("workout", new Date())).toBe("disabled")
    setRecoveryReminderPolicy({ training: false, food: false })
    await syncPushReminders(settings, false)
    expect(
      (
        scheduleMock.mock.calls.at(-1) as unknown as [
          { notifications: Array<{ id: number }> },
        ]
      )[0].notifications.map((n) => n.id)
    ).toEqual([9201, 9202, 9203])
  })
})

test("starting recovery while notification permission is pending cannot leak a workout reminder", async () => {
  platform = "ios"
  setRecoveryReminderPolicy({ training: false, food: false })
  scheduleMock.mockClear()
  let releasePermission!: (value: { display: string }) => void
  let markRequested!: () => void
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve
  })
  requestPermissionsMock.mockImplementationOnce(() => {
    markRequested()
    return new Promise((resolve) => {
      releasePermission = resolve
    })
  })
  const pendingEntry = scheduleEntryReminder(
    "workout",
    new Date(Date.now() + 60000)
  )
  await requested
  setRecoveryReminderPolicy({ training: true, food: true })
  const sync = syncPushReminders(DEFAULT_REMINDERS, false)
  releasePermission({ display: "granted" })
  expect(await pendingEntry).toBe("disabled")
  expect(await sync).toBe("disabled")
  expect(scheduleMock).not.toHaveBeenCalled()
  setRecoveryReminderPolicy({ training: false, food: false })
})
