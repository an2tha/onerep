package com.ananthh.onerep

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context

/**
 * Channel ids shared with the JS side.
 *
 * These must match `NOTIFICATION_CHANNELS` in
 * apps/mobile/src/lib/notification-channels.ts. JS creates the rest-timer and
 * reminder channels because it owns those notifications; the workout-status
 * channel is created here as well because the foreground service can start
 * before any JS has run.
 */
object NotificationChannels {
    const val REST = "rest-timers"
    const val REMINDERS = "reminders"
    const val WORKOUT_STATUS = "workout-status"

    /** Idempotent: Android ignores re-creation and preserves user overrides. */
    fun ensureWorkoutStatus(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(WORKOUT_STATUS) != null) return

        val channel = NotificationChannel(
            WORKOUT_STATUS,
            "Workout status",
            // LOW: this notification persists for the whole workout. It must
            // never buzz — the rest-timer channel owns alerting.
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description =
                "The ongoing notification showing your current set and rest timer."
            setShowBadge(false)
            enableVibration(false)
        }
        manager.createNotificationChannel(channel)
    }
}
