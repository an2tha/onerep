package com.ananthh.onerep

import androidx.health.connect.client.records.ExerciseSessionRecord

/**
 * Health Connect exercise types mapped onto the HealthKit vocabulary.
 *
 * The Convex backend speaks one vocabulary — HealthKit's — because that is what
 * shipped first and what `LINKABLE_ACTIVITY_TYPES` / `STRENGTH_ACTIVITY_TYPES`
 * in convex/logs/healthWorkouts.ts already match against. Translating here, on
 * the client, keeps a single vocabulary server-side instead of teaching every
 * consumer about two.
 *
 * The mapping is deliberately lossy in one direction: Health Connect has a
 * single STRENGTH_TRAINING where HealthKit distinguishes traditional,
 * functional, and core. Everything strength-shaped becomes
 * `traditionalStrengthTraining`.
 */
object HealthActivityTypes {

    /** The `activityType` slug the JS layer and widgets use. */
    fun slug(exerciseType: Int): String = when (exerciseType) {
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cycling"

        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
        ExerciseSessionRecord.EXERCISE_TYPE_PADDLING -> "paddle_sports"

        ExerciseSessionRecord.EXERCISE_TYPE_ROWING,
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rowing"

        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"

        ExerciseSessionRecord.EXERCISE_TYPE_SKATING,
        ExerciseSessionRecord.EXERCISE_TYPE_ICE_SKATING -> "skating"

        ExerciseSessionRecord.EXERCISE_TYPE_SKIING,
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING,
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWSHOEING -> "snow_sports"

        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "stairs"

        ExerciseSessionRecord.EXERCISE_TYPE_SURFING -> "surfing"

        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "swimming"

        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"

        ExerciseSessionRecord.EXERCISE_TYPE_WATER_POLO -> "water_sports"

        ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR -> "wheelchair_walk"

        else -> "cardio"
    }

    /** Human label, matching `workoutActivityName` in AppleHealthPlugin.swift. */
    fun displayName(exerciseType: Int): String = when (slug(exerciseType)) {
        "cycling" -> "Cycling"
        "elliptical" -> "Elliptical"
        "hiking" -> "Hiking"
        "hiit" -> "HIIT"
        "paddle_sports" -> "Paddle Sports"
        "rowing" -> "Rowing"
        "running" -> "Running"
        "skating" -> "Skating"
        "snow_sports" -> "Snow Sports"
        "stairs" -> "Stairs"
        "surfing" -> "Surfing"
        "swimming" -> "Swimming"
        "walking" -> "Walking"
        "water_sports" -> "Water Sports"
        "wheelchair_walk" -> "Wheelchair Walk"
        else -> "Cardio"
    }

    /**
     * Mirrors `isCardioWorkout` in AppleHealthPlugin.swift: only cardio sessions
     * are imported. Strength sessions are excluded because OneRep is the source
     * of truth for those — importing them would duplicate the user's own logs.
     */
    fun isCardio(exerciseType: Int): Boolean = when (exerciseType) {
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY,
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL,
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_PADDLING,
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING,
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL,
        ExerciseSessionRecord.EXERCISE_TYPE_SKATING,
        ExerciseSessionRecord.EXERCISE_TYPE_ICE_SKATING,
        ExerciseSessionRecord.EXERCISE_TYPE_SKIING,
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING,
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWSHOEING,
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE,
        ExerciseSessionRecord.EXERCISE_TYPE_SURFING,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING,
        ExerciseSessionRecord.EXERCISE_TYPE_WATER_POLO,
        ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR -> true

        else -> false
    }
}
