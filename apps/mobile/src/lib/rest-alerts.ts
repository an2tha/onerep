import { Capacitor } from "@capacitor/core"
import { Haptics, NotificationType } from "@capacitor/haptics"
import { LocalNotifications } from "@capacitor/local-notifications"
import { restBellEnabled, restVibrationEnabled } from "./workout-celebration"

const REST_NOTIFICATION_ID = 74021

/** Schedules a native alert so rest completion still fires while the app is locked/backgrounded. */
export async function scheduleRestAlert(endAt: number) {
  if (!Capacitor.isNativePlatform()) return
  const permission = await LocalNotifications.checkPermissions()
  const granted =
    permission.display === "granted" ||
    (await LocalNotifications.requestPermissions()).display === "granted"
  if (!granted) return

  await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] })
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REST_NOTIFICATION_ID,
        title: "Rest complete",
        body: "Next set.",
        schedule: { at: new Date(endAt), allowWhileIdle: true },
        sound: restBellEnabled() ? "default" : undefined,
        extra: { route: "/workout", action: "rest-complete" },
      },
    ],
  })
}

export async function cancelRestAlert() {
  if (!Capacitor.isNativePlatform()) return
  await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] })
}

export async function playNativeRestHaptic() {
  if (!Capacitor.isNativePlatform() || !restVibrationEnabled()) return
  await Haptics.notification({ type: NotificationType.Success })
}
