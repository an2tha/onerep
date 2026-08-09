import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"

/**
 * Android notification channels.
 *
 * Channels are Android-only and are the *only* granularity the system offers
 * users for muting. Without them every alert we send — a 90-second rest timer,
 * a daily 9am supplement nudge, an ongoing workout status — lands in one
 * undifferentiated bucket, so silencing the reminders also silences the rest
 * timer. iOS has no equivalent; there the id/thread grouping is enough.
 */
export const NOTIFICATION_CHANNELS = {
  /** Rest-timer completion. Time-critical, so it keeps sound + vibration. */
  rest: "rest-timers",
  /** Daily reminders and check-ins. Routine, easy to over-notify. */
  reminders: "reminders",
  /** The ongoing workout status notification. Silent by design. */
  workoutStatus: "workout-status",
  /**
   * Coach speaking first: the Sunday review and the two nudges. Its own
   * channel because it is the one category a user might want gone while
   * keeping every alarm they set themselves.
   */
  coach: "coach",
} as const

export type NotificationChannelId =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS]

/** Channels only exist on Android; everywhere else this is a no-op. */
export function supportsNotificationChannels() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
}

let ensured: Promise<void> | null = null

/**
 * Idempotent. Android ignores re-creation of an existing channel, and users'
 * own importance overrides survive it, so calling this on every launch is safe
 * and is what keeps a fresh install from missing a channel.
 */
export async function ensureNotificationChannels() {
  if (!supportsNotificationChannels()) return
  ensured ??= createChannels()
  return ensured
}

async function createChannels() {
  try {
    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNELS.rest,
      name: "Rest timers",
      description: "Tells you when a rest period between sets is over.",
      // HIGH, not MAX: a heads-up banner is right, hijacking the screen is not.
      importance: 4,
      visibility: 1,
      // No `sound`: Android resolves the value to a res/raw resource name, so
      // "default" becomes android.resource://…/raw/default, which does not
      // exist. Omitting it gives the channel the system notification sound.
      vibration: true,
    })

    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNELS.reminders,
      name: "Daily reminders",
      description:
        "Hydration, meals, training, check-ins, and supplement reminders.",
      importance: 3,
      visibility: 1,
      vibration: true,
    })

    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNELS.workoutStatus,
      name: "Workout status",
      description:
        "The ongoing notification showing your current set and rest timer.",
      // LOW: this notification is persistent for the length of a workout. It
      // must never buzz — the rest channel already owns the alerting.
      importance: 2,
      visibility: 1,
      vibration: false,
    })

    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNELS.coach,
      name: "Coach",
      description:
        "Your weekly review, and the occasional nudge when you go quiet.",
      // DEFAULT: it is worth a glance, never worth interrupting a meeting for.
      importance: 3,
      visibility: 1,
      vibration: true,
    })
  } catch (error) {
    // A missing channel degrades to the plugin default; it should not take the
    // app down on launch.
    ensured = null
    console.error("Failed to create notification channels", error)
  }
}
