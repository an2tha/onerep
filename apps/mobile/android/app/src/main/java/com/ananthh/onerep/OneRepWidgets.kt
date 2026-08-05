package com.ananthh.onerep

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import kotlin.math.max

/**
 * Home-screen widgets — the Android counterpart of the WidgetKit extension in
 * ios/App/OneRep/OneRepNutritionalWidget.swift.
 *
 * Same four widgets, same data, same deep links. Data comes from WidgetStore,
 * written by HomeWidgetsPlugin; there is no timeline provider because Glance
 * recomposes on write rather than on a schedule.
 */

private val INK = Color(0xFF09090B)
private val MUTED = Color(0xFF71717A)
private val SURFACE = Color(0xFFFFFFFF)
private val HAIRLINE = Color(0x1409090B)

private fun openApp(route: String) =
    actionStartActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse(route))
            .setPackage("com.ananthh.onerep")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )

// MARK: - Shared pieces

@Composable
private fun WidgetSurface(
    route: String,
    // ColumnScope receiver, not a bare lambda: GlanceModifier.defaultWeight() is
    // a scope extension, so children need the scope to claim vertical space.
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(SURFACE)
            .padding(14.dp)
            .clickable(openApp(route)),
        content = content,
    )
}

@Composable
private fun Caption(text: String) {
    Text(
        text = text,
        style = TextStyle(
            color = androidx.glance.unit.ColorProvider(MUTED),
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
        ),
    )
}

@Composable
private fun Unsynced() {
    WidgetSurface("onerep://today") {
        Spacer(GlanceModifier.defaultWeight())
        Text(
            text = "Open OneRep to sync",
            style = TextStyle(
                color = androidx.glance.unit.ColorProvider(INK),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
        Spacer(GlanceModifier.height(3.dp))
        Text(
            text = "Widget data updates from your account.",
            style = TextStyle(
                color = androidx.glance.unit.ColorProvider(MUTED),
                fontSize = 11.sp,
            ),
        )
    }
}

@Composable
private fun CalorieProgress(value: Int, goal: Int) {
    LinearProgressIndicator(
        progress = if (goal <= 0) 0f else (value.toFloat() / goal).coerceIn(0f, 1f),
        modifier = GlanceModifier.fillMaxWidth().height(5.dp).cornerRadius(3.dp),
        color = androidx.glance.unit.ColorProvider(INK),
        backgroundColor = androidx.glance.unit.ColorProvider(HAIRLINE),
    )
}

@Composable
private fun MacroRow(label: String, value: Int, goal: Int) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = TextStyle(
                color = androidx.glance.unit.ColorProvider(INK),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            ),
        )
        Spacer(GlanceModifier.defaultWeight())
        Text(
            text = "$value/${goal}g",
            style = TextStyle(
                color = androidx.glance.unit.ColorProvider(INK),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            ),
        )
    }
}

// MARK: - Quick actions

class QuickActionsWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            GlanceTheme {
                Column(
                    modifier = GlanceModifier
                        .fillMaxSize()
                        .background(SURFACE)
                        .padding(14.dp),
                ) {
                    Column(
                        modifier = GlanceModifier
                            .fillMaxWidth()
                            .defaultWeight()
                            .clickable(openApp("onerep://workout")),
                        verticalAlignment = Alignment.Vertical.CenterVertically,
                    ) {
                        Text(
                            text = "Start workout",
                            style = TextStyle(
                                color = androidx.glance.unit.ColorProvider(INK),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                    }
                    Spacer(
                        GlanceModifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(HAIRLINE),
                    )
                    Column(
                        modifier = GlanceModifier
                            .fillMaxWidth()
                            .defaultWeight()
                            .clickable(openApp("onerep://nutrition")),
                        verticalAlignment = Alignment.Vertical.CenterVertically,
                    ) {
                        Text(
                            text = "Log a meal",
                            style = TextStyle(
                                color = androidx.glance.unit.ColorProvider(INK),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                    }
                }
            }
        }
    }
}

class QuickActionsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickActionsWidget()
}

// MARK: - Nutrition

class NutritionWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val s = WidgetStore.read(context)
        provideContent {
            GlanceTheme {
                if (!s.nutritionSynced || s.calorieGoal <= 0) {
                    Unsynced()
                } else {
                    WidgetSurface("onerep://nutrition") {
                        // The number is the headline. A "Nutrition" label above
                        // it would just restate what the macros already say.
                        Text(
                            text = "${max(s.calorieGoal - s.calories, 0)}",
                            style = TextStyle(
                                color = androidx.glance.unit.ColorProvider(INK),
                                fontSize = 30.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                        Caption("kcal left")
                        Spacer(GlanceModifier.height(7.dp))
                        CalorieProgress(s.calories, s.calorieGoal)
                        Spacer(GlanceModifier.defaultWeight())
                        MacroRow("P", s.protein, s.proteinGoal)
                        Spacer(GlanceModifier.height(3.dp))
                        MacroRow("C", s.carbs, s.carbsGoal)
                        Spacer(GlanceModifier.height(3.dp))
                        MacroRow("F", s.fat, s.fatGoal)
                    }
                }
            }
        }
    }
}

class NutritionWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NutritionWidget()
}

// MARK: - Schedule

class ScheduleWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val s = WidgetStore.read(context)
        provideContent {
            GlanceTheme {
                if (!s.workoutSynced) {
                    Unsynced()
                } else {
                    WidgetSurface("onerep://workouts") {
                        Text(
                            text = s.workoutExercises,
                            maxLines = 4,
                            style = TextStyle(
                                color = androidx.glance.unit.ColorProvider(INK),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                        Spacer(GlanceModifier.defaultWeight())
                        Text(
                            text = s.workoutBrief,
                            style = TextStyle(
                                color = androidx.glance.unit.ColorProvider(MUTED),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                            ),
                        )
                    }
                }
            }
        }
    }
}

class ScheduleWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ScheduleWidget()
}

// MARK: - Combined

class CombinedWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val s = WidgetStore.read(context)
        provideContent {
            GlanceTheme {
                if (!s.nutritionSynced || s.calorieGoal <= 0) {
                    Unsynced()
                } else {
                    WidgetSurface("onerep://nutrition") {
                        Text(
                            text = "${max(s.calorieGoal - s.calories, 0)} kcal left",
                            style = TextStyle(
                                color = androidx.glance.unit.ColorProvider(INK),
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                        Spacer(GlanceModifier.height(2.dp))
                        Caption("${s.calories} of ${s.calorieGoal} eaten")
                        Spacer(GlanceModifier.height(9.dp))
                        CalorieProgress(s.calories, s.calorieGoal)
                        Spacer(GlanceModifier.height(9.dp))
                        Text(
                            text = s.foodsLogged,
                            maxLines = 2,
                            style = TextStyle(
                                color = androidx.glance.unit.ColorProvider(INK),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                            ),
                        )
                        Spacer(GlanceModifier.defaultWeight())
                        Row(modifier = GlanceModifier.fillMaxWidth()) {
                            MacroCard("Protein", s.protein, s.proteinGoal)
                            Spacer(GlanceModifier.width(7.dp))
                            MacroCard("Carbs", s.carbs, s.carbsGoal)
                            Spacer(GlanceModifier.width(7.dp))
                            MacroCard("Fat", s.fat, s.fatGoal)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RowScope.MacroCard(label: String, value: Int, goal: Int) {
    Column(
        modifier = GlanceModifier
            .defaultWeight()
            .background(HAIRLINE)
            .cornerRadius(9.dp)
            .padding(8.dp),
    ) {
        Text(
            text = label,
            style = TextStyle(
                color = androidx.glance.unit.ColorProvider(MUTED),
                fontSize = 10.sp,
            ),
        )
        Spacer(GlanceModifier.height(2.dp))
        Text(
            text = "$value / ${goal}g",
            style = TextStyle(
                color = androidx.glance.unit.ColorProvider(INK),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
    }
}

class CombinedWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CombinedWidget()
}
