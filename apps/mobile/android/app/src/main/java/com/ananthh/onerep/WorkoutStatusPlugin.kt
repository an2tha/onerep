package com.ananthh.onerep

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The Android counterpart of `WorkoutLiveActivityPlugin` in
 * AppleHealthPlugin.swift — the `start` / `update` / `end` half of it.
 *
 * `updateWidgets` deliberately does NOT live here: on iOS the two share a
 * plugin, which is exactly why the home-screen widgets were dead on Android.
 * See HomeWidgetsPlugin.
 */
@CapacitorPlugin(name = "WorkoutStatus")
class WorkoutStatusPlugin : Plugin() {

    override fun load() {
        NotificationChannels.ensureWorkoutStatus(context)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        WorkoutStatusNotification.show(context, statusFrom(call))
        call.resolve(JSObject().put("supported", true))
    }

    @PluginMethod
    fun update(call: PluginCall) {
        // Same path as start: re-posting the same id replaces the notification
        // in place, and setOnlyAlertOnce keeps it silent.
        WorkoutStatusNotification.show(context, statusFrom(call))
        call.resolve()
    }

    @PluginMethod
    fun end(call: PluginCall) {
        WorkoutStatusNotification.hide(context)
        call.resolve()
    }

    private fun statusFrom(call: PluginCall): WorkoutStatus {
        val restEndAt = call.getDouble("restEndAt")?.toLong()
        return WorkoutStatus(
            exerciseName = call.getString("exerciseName") ?: "Workout",
            setLabel = call.getString("setLabel") ?: "In progress",
            completedSets = call.getInt("completedSets") ?: 0,
            totalSets = call.getInt("totalSets") ?: 0,
            isResting = call.getBoolean("isResting") ?: false,
            restEndAt = restEndAt,
            slot = call.getInt("slot") ?: 1,
            startedAt = call.getDouble("startedAt")?.toLong()
                ?: System.currentTimeMillis(),
        )
    }
}
