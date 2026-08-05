import { Capacitor } from "@capacitor/core"
import { Haptics, NotificationType } from "@capacitor/haptics"
import { LocalNotifications } from "@capacitor/local-notifications"
import {
  ensureNotificationChannels,
  NOTIFICATION_CHANNELS,
  supportsNotificationChannels,
} from "./notification-channels"
import { restBellEnabled, restVibrationEnabled } from "./workout-celebration"

const REST_NOTIFICATION_ID = 74021

/** Schedules a native alert so rest completion still fires while the app is locked/backgrounded. */
export async function scheduleRestAlert(endAt: number) {
  if (!Capacitor.isNativePlatform()) return
  await ensureNotificationChannels()
  const permission = await LocalNotifications.checkPermissions()
  const granted =
    permission.display === "granted" ||
    (await LocalNotifications.requestPermissions()).display === "granted"
  if (!granted) return

  await LocalNotifications.cancel({
    notifications: [{ id: REST_NOTIFICATION_ID }],
  })
  const usesChannels = supportsNotificationChannels()
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REST_NOTIFICATION_ID,
        title: "Rest complete",
        body: "Next set.",
        schedule: { at: new Date(endAt), allowWhileIdle: true },
        // "default" is an iOS token. Android expects a res/raw filename and
        // ignores the field entirely on API 26+, where the channel owns sound.
        sound: !usesChannels && restBellEnabled() ? "default" : undefined,
        channelId: usesChannels ? NOTIFICATION_CHANNELS.rest : undefined,
        extra: { route: "/workout", action: "rest-complete" },
      },
    ],
  })
}

export async function cancelRestAlert() {
  if (!Capacitor.isNativePlatform()) return
  await LocalNotifications.cancel({
    notifications: [{ id: REST_NOTIFICATION_ID }],
  })
}

export async function playNativeRestHaptic() {
  if (!Capacitor.isNativePlatform() || !restVibrationEnabled()) return
  await Haptics.notification({ type: NotificationType.Success })
}
