package com.ananthh.onerep

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * The ongoing workout notification — the Android analogue of the iOS Live
 * Activity.
 *
 * Posted straight to the NotificationManager rather than from a foreground
 * service. A service is the reflex here, but it is the wrong tool twice over:
 *
 *  - Posted notifications are owned by the system, not by us. This one survives
 *    the app process being reaped mid-workout, which is the case the service was
 *    supposed to cover.
 *  - The only fitting service type is `health`, and Android refuses to start it
 *    unless a runtime sensor/health permission is already granted — which throws
 *    a SecurityException and kills the app for a user who has not granted health
 *    access. Nothing here reads a sensor, so claiming that type was wrong.
 *
 * The chronometer is rendered by the system from an absolute timestamp, so the
 * countdown stays correct without the app running at all.
 */
object WorkoutStatusNotification {

    private const val NOTIFICATION_ID = 74100

    fun show(context: Context, status: WorkoutStatus) {
        NotificationChannels.ensureWorkoutStatus(context)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.notify(NOTIFICATION_ID, build(context, status))
    }

    fun hide(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.cancel(NOTIFICATION_ID)
    }

    private fun build(context: Context, status: WorkoutStatus): Notification {
        val title = if (status.isResting) "Rest" else status.exerciseName
        val subtitle = if (status.isResting) status.exerciseName else status.setLabel

        val builder = Notification.Builder(context, NotificationChannels.WORKOUT_STATUS)
            .setSmallIcon(R.drawable.ic_stat_onerep)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_WORKOUT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(deepLink(context, "onerep://workout?slot=${status.slot}"))

        if (status.totalSets > 0) {
            builder.setSubText("${status.completedSets}/${status.totalSets} sets")
        }

        // Counts down to the absolute rest end, or up from the workout start —
        // the two states the iOS ActivityTimer renders.
        val restEndAt = status.restEndAt
        if (status.isResting && restEndAt != null) {
            builder.setUsesChronometer(true).setChronometerCountDown(true).setWhen(restEndAt)
        } else {
            builder.setUsesChronometer(true)
                .setChronometerCountDown(false)
                .setWhen(status.startedAt)
        }
        builder.setShowWhen(true)

        builder.addAction(
            Notification.Action.Builder(
                null,
                "Complete set",
                deepLink(
                    context,
                    "onerep://workout?slot=${status.slot}&liveAction=complete",
                    requestCode = 1,
                ),
            ).build(),
        )

        if (status.isResting) {
            builder.addAction(
                Notification.Action.Builder(
                    null,
                    "Skip rest",
                    deepLink(
                        context,
                        "onerep://workout?slot=${status.slot}&liveAction=skipRest",
                        requestCode = 2,
                    ),
                ).build(),
            )
        }

        promoteIfSupported(builder)

        return builder.build()
    }

    /**
     * Android 16 Live Updates promotion. A no-op on older releases, where the
     * notification stays an ordinary ongoing one.
     *
     * Reflection rather than a direct call so the module still compiles against
     * an SDK 35 platform jar; the promotion is a progressive enhancement, not a
     * requirement. Swap to a direct guarded call once compileSdk 36 is
     * guaranteed on every build machine.
     */
    private fun promoteIfSupported(builder: Notification.Builder) {
        if (Build.VERSION.SDK_INT < 36) return
        runCatching {
            Notification.Builder::class.java
                .getMethod("setRequestPromotedOngoing", Boolean::class.javaPrimitiveType)
                .invoke(builder, true)
        }
    }

    private fun deepLink(
        context: Context,
        uri: String,
        requestCode: Int = 0,
    ): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
