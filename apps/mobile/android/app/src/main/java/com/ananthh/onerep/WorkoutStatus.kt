package com.ananthh.onerep

import android.content.Intent
import android.os.Bundle

/**
 * The Android mirror of `WorkoutActivityAttributes.ContentState` in
 * AppleHealthPlugin.swift. Same seven fields, same meaning.
 *
 * `restEndAt` is an absolute epoch-ms timestamp, not a remaining duration —
 * matching iOS. The notification's chronometer counts down to a wall-clock
 * instant, so it stays correct even if the process is starved or the update
 * that would have refreshed it never arrives.
 */
data class WorkoutStatus(
    val exerciseName: String = "Workout",
    val setLabel: String = "In progress",
    val completedSets: Int = 0,
    val totalSets: Int = 0,
    val isResting: Boolean = false,
    val restEndAt: Long? = null,
    val slot: Int = 1,
    val startedAt: Long = System.currentTimeMillis(),
) {
    fun toBundle(): Bundle = Bundle().apply {
        putString(KEY_EXERCISE_NAME, exerciseName)
        putString(KEY_SET_LABEL, setLabel)
        putInt(KEY_COMPLETED_SETS, completedSets)
        putInt(KEY_TOTAL_SETS, totalSets)
        putBoolean(KEY_IS_RESTING, isResting)
        restEndAt?.let { putLong(KEY_REST_END_AT, it) }
        putInt(KEY_SLOT, slot)
        putLong(KEY_STARTED_AT, startedAt)
    }

    companion object {
        const val KEY_EXERCISE_NAME = "exerciseName"
        const val KEY_SET_LABEL = "setLabel"
        const val KEY_COMPLETED_SETS = "completedSets"
        const val KEY_TOTAL_SETS = "totalSets"
        const val KEY_IS_RESTING = "isResting"
        const val KEY_REST_END_AT = "restEndAt"
        const val KEY_SLOT = "slot"
        const val KEY_STARTED_AT = "startedAt"

        fun fromIntent(intent: Intent?): WorkoutStatus {
            val extras = intent?.extras ?: return WorkoutStatus()
            return WorkoutStatus(
                exerciseName = extras.getString(KEY_EXERCISE_NAME) ?: "Workout",
                setLabel = extras.getString(KEY_SET_LABEL) ?: "In progress",
                completedSets = extras.getInt(KEY_COMPLETED_SETS, 0),
                totalSets = extras.getInt(KEY_TOTAL_SETS, 0),
                isResting = extras.getBoolean(KEY_IS_RESTING, false),
                restEndAt = if (extras.containsKey(KEY_REST_END_AT)) {
                    extras.getLong(KEY_REST_END_AT)
                } else {
                    null
                },
                slot = extras.getInt(KEY_SLOT, 1),
                startedAt = extras.getLong(KEY_STARTED_AT, System.currentTimeMillis()),
            )
        }
    }
}
