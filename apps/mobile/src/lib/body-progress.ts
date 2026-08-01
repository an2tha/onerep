import { Capacitor } from "@capacitor/core"

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
  photoUploadId?: string
  photoUrl?: string | null
  photoTakenAt?: number // timestamp when photo was taken
}

export type DailyCheckInReminder = {
  enabled: boolean
  hour: number
  minute: number
}

export type BodyMeasurementCarryForwardDraft = {
  weightKg: string
  bodyFatPct: string
  waistCm: string
  hipsCm: string
  chestCm: string
  armsCm: string
  thighsCm: string
  calvesCm: string
  neckCm: string
  filledCount: number
  hasAdvancedMeasurements: boolean
}

const DAILY_CHECK_IN_NOTIFICATION_ID = 9101
const ADVANCED_MEASUREMENT_KEYS = [
  "armsCm",
  "thighsCm",
  "calvesCm",
  "neckCm",
] as const

function measurementInputValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function bodyMeasurementCarryForwardDraft(
  entry?: BodyMeasurementEntry | null
): BodyMeasurementCarryForwardDraft | null {
  if (!entry) return null

  const draft = {
    weightKg: measurementInputValue(entry.weightKg),
    bodyFatPct: measurementInputValue(entry.bodyFatPct),
    waistCm: measurementInputValue(entry.waistCm),
    hipsCm: measurementInputValue(entry.hipsCm),
    chestCm: measurementInputValue(entry.chestCm),
    armsCm: measurementInputValue(entry.armsCm),
    thighsCm: measurementInputValue(entry.thighsCm),
    calvesCm: measurementInputValue(entry.calvesCm),
    neckCm: measurementInputValue(entry.neckCm),
  }
  const filledCount = Object.values(draft).filter(Boolean).length

  if (filledCount === 0) return null

  return {
    ...draft,
    filledCount,
    hasAdvancedMeasurements: ADVANCED_MEASUREMENT_KEYS.some(
      (key) => draft[key].length > 0
    ),
  }
}

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

  const { LocalNotifications } = await import(
    "@capacitor/local-notifications"
  )

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
