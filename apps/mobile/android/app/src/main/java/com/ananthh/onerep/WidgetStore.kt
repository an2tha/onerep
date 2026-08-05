package com.ananthh.onerep

import android.content.Context
import android.content.SharedPreferences

/**
 * Backing store for the home-screen widgets.
 *
 * On iOS this data crosses a process boundary through the
 * `group.com.ananthh.onerep` App Group. Android widgets run in the app's own
 * process, so plain SharedPreferences is the whole mechanism — same 15 keys,
 * no entitlement, no suite.
 */
object WidgetStore {
    private const val PREFS = "onerep.widgets"

    val INT_KEYS = listOf(
        "calories",
        "calorieGoal",
        "caloriesLeft",
        "protein",
        "proteinGoal",
        "carbs",
        "carbsGoal",
        "fat",
        "fatGoal",
    )

    val STRING_KEYS = listOf("foodsLogged", "workoutExercises", "workoutBrief")

    const val NUTRITION_UPDATED_AT = "nutritionWidgetUpdatedAt"
    const val WORKOUT_UPDATED_AT = "workoutWidgetUpdatedAt"

    fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Snapshot(
        val nutritionSynced: Boolean,
        val workoutSynced: Boolean,
        val calories: Int,
        val calorieGoal: Int,
        val caloriesLeft: Int,
        val protein: Int,
        val proteinGoal: Int,
        val carbs: Int,
        val carbsGoal: Int,
        val fat: Int,
        val fatGoal: Int,
        val foodsLogged: String,
        val workoutExercises: String,
        val workoutBrief: String,
    )

    fun read(context: Context): Snapshot {
        val p = prefs(context)
        return Snapshot(
            nutritionSynced = p.getLong(NUTRITION_UPDATED_AT, 0L) > 0L,
            workoutSynced = p.getLong(WORKOUT_UPDATED_AT, 0L) > 0L,
            calories = p.getInt("calories", 0),
            calorieGoal = p.getInt("calorieGoal", 0),
            caloriesLeft = p.getInt("caloriesLeft", 0),
            protein = p.getInt("protein", 0),
            proteinGoal = p.getInt("proteinGoal", 0),
            carbs = p.getInt("carbs", 0),
            carbsGoal = p.getInt("carbsGoal", 0),
            fat = p.getInt("fat", 0),
            fatGoal = p.getInt("fatGoal", 0),
            foodsLogged = p.getString("foodsLogged", "").orEmpty(),
            workoutExercises = p.getString("workoutExercises", "").orEmpty(),
            workoutBrief = p.getString("workoutBrief", "").orEmpty(),
        )
    }
}
