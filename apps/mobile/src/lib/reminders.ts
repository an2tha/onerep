import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"
import {
  ensureNotificationChannels,
  NOTIFICATION_CHANNELS,
  supportsNotificationChannels,
} from "./notification-channels"

export type ReminderConfig = {
  enabled: boolean
  hour: number
  minute: number
}

export type ReminderSettings = {
  water: ReminderConfig
  meal: ReminderConfig
  workout: ReminderConfig
  body: ReminderConfig
  supplement: ReminderConfig
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  water: { enabled: false, hour: 10, minute: 0 },
  meal: { enabled: false, hour: 12, minute: 30 },
  workout: { enabled: false, hour: 18, minute: 0 },
  body: { enabled: false, hour: 19, minute: 0 },
  supplement: { enabled: false, hour: 9, minute: 0 },
}

const REMINDER_COPY: Record<
  keyof ReminderSettings,
  { id: number; title: string; body: string }
> = {
  water: {
    id: 9201,
    title: "Hydration check",
    body: "Log a glass. Today’s total is still short.",
  },
  meal: {
    id: 9202,
    title: "Meal log",
    body: "Add your meal while the details are still fresh.",
  },
  workout: {
    id: 9203,
    title: "Training window",
    body: "Your plan is waiting. Start a session or adjust today’s routine.",
  },
  body: {
    id: 9204,
    title: "Daily check-in",
    body: "Log your latest measurements and see how your goal is moving.",
  },
  supplement: {
    id: 9205,
    title: "Supplement log",
    body: "Mark off creatine, protein, vitamins, or caffeine for today.",
  },
}

export function mergeReminderSettings(
  value?: Partial<ReminderSettings> | null
): ReminderSettings {
  return {
    water: { ...DEFAULT_REMINDERS.water, ...(value?.water ?? {}) },
    meal: { ...DEFAULT_REMINDERS.meal, ...(value?.meal ?? {}) },
    workout: { ...DEFAULT_REMINDERS.workout, ...(value?.workout ?? {}) },
    body: { ...DEFAULT_REMINDERS.body, ...(value?.body ?? {}) },
    supplement: {
      ...DEFAULT_REMINDERS.supplement,
      ...(value?.supplement ?? {}),
    },
  }
}

export function formatReminderTime(reminder: ReminderConfig) {
  const base = new Date()
  base.setHours(reminder.hour, reminder.minute, 0, 0)
  return base.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatReminderLabel(reminder: ReminderConfig) {
  return `Daily at ${formatReminderTime(reminder)}`
}

export async function syncPushReminders(
  settings: ReminderSettings
): Promise<"scheduled" | "disabled" | "unsupported" | "denied"> {
  if (Capacitor.getPlatform() === "web") {
    return "unsupported"
  }

  const enabledEntries = (
    Object.entries(settings) as [keyof ReminderSettings, ReminderConfig][]
  ).filter(([, reminder]) => reminder.enabled)

  if (enabledEntries.length === 0) {
    const ids = Object.values(REMINDER_COPY).map(({ id }) => ({ id }))
    await LocalNotifications.cancel({ notifications: ids })
    return "disabled"
  }

  await ensureNotificationChannels()
  const permission = await LocalNotifications.requestPermissions()
  if (permission.display !== "granted") {
    return "denied"
  }

  const ids = Object.values(REMINDER_COPY).map(({ id }) => ({ id }))
  await LocalNotifications.cancel({ notifications: ids })

  const channelId = supportsNotificationChannels()
    ? NOTIFICATION_CHANNELS.reminders
    : undefined
  await LocalNotifications.schedule({
    notifications: enabledEntries.map(([kind, reminder]) => ({
      id: REMINDER_COPY[kind].id,
      title: REMINDER_COPY[kind].title,
      body: REMINDER_COPY[kind].body,
      schedule: {
        on: { hour: reminder.hour, minute: reminder.minute },
        repeats: true,
        allowWhileIdle: true,
      },
      channelId,
    })),
  })

  return "scheduled"
}
