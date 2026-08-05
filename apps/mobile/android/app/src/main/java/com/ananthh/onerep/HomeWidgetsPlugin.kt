package com.ananthh.onerep

import androidx.glance.appwidget.updateAll
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The Android counterpart of `WorkoutLiveActivityPlugin.updateWidgets`.
 *
 * Split out from the workout-status plugin on purpose. Sharing one plugin (and
 * therefore one JS platform guard) with the Live Activity is what kept these
 * widgets dead on Android — they have nothing to do with each other.
 */
@CapacitorPlugin(name = "HomeWidgets")
class HomeWidgetsPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun updateWidgets(call: PluginCall) {
        val editor = WidgetStore.prefs(context).edit()

        WidgetStore.INT_KEYS.forEach { key ->
            call.getInt(key)?.let { editor.putInt(key, it) }
        }
        WidgetStore.STRING_KEYS.forEach { key ->
            call.getString(key)?.let { editor.putString(key, it) }
        }

        // Sentinels gate the "Open OneRep to sync" empty state, so they are only
        // stamped when the corresponding payload actually arrived — matching the
        // iOS plugin.
        val now = System.currentTimeMillis()
        if (call.getInt("calorieGoal") != null) {
            editor.putLong(WidgetStore.NUTRITION_UPDATED_AT, now)
        }
        if (call.getString("workoutExercises") != null) {
            editor.putLong(WidgetStore.WORKOUT_UPDATED_AT, now)
        }
        editor.apply()

        scope.launch {
            runCatching {
                QuickActionsWidget().updateAll(context)
                NutritionWidget().updateAll(context)
                ScheduleWidget().updateAll(context)
                CombinedWidget().updateAll(context)
            }
            call.resolve()
        }
    }
}
