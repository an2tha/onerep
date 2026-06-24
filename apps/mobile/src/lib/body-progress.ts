import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"

export type BodyMeasurementEntry = {
  _id?: string // Convex ID
  clientId: string
  loggedAt: string
  weightKg?: number
  bodyFatPct?: number
  waistCm?: number
  hipsCm?: number
  chestCm?: number
  armsCm?: number
  thighsCm?: number
  calvesCm?: number
  neckCm?: number
  notes?: string
  photoStorageId?: string
  photoUrl?: string | null
  photoDataUrl?: string // legacy base64 image
  photoTakenAt?: number // timestamp when photo was taken
}

export type DailyCheckInReminder = {
  enabled: boolean
  hour: number
  minute: number
}

const DAILY_CHECK_IN_NOTIFICATION_ID = 9101

function nextReminderDate(reminder: DailyCheckInReminder) {
  const now = new Date()
  const next = new Date(now)
  next.setHours(reminder.hour, reminder.minute, 0, 0)

  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }

  return next
}

export async function syncDailyCheckInReminder(
  reminder: DailyCheckInReminder
): Promise<"scheduled" | "disabled" | "unsupported" | "denied"> {
  if (Capacitor.getPlatform() === "web") {
    return "unsupported"
  }

  await LocalNotifications.cancel({
    notifications: [{ id: DAILY_CHECK_IN_NOTIFICATION_ID }],
  })

  if (!reminder.enabled) {
    return "disabled"
  }

  const permission = await LocalNotifications.requestPermissions()
  if (permission.display !== "granted") {
    return "denied"
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_CHECK_IN_NOTIFICATION_ID,
        title: "Daily check-in",
        body: "Log your latest measurements and see how your goal is moving.",
        schedule: { at: nextReminderDate(reminder), allowWhileIdle: true },
      },
    ],
  })

  return "scheduled"
}

export function formatReminderLabel(reminder: DailyCheckInReminder) {
  const base = new Date()
  base.setHours(reminder.hour, reminder.minute, 0, 0)
  const time = base.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  return `Daily at ${time}`
}
