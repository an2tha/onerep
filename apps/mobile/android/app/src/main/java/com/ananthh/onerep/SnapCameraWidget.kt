package com.ananthh.onerep

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

/** A static launcher: available before the first nutrition data sync. */
class SnapCameraWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val cameraIntent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("onerep://camera")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        provideContent {
            Column(
                modifier = GlanceModifier.fillMaxSize()
                    .background(Color.White)
                    .padding(14.dp)
                    .clickable(actionStartActivity(cameraIntent)),
            ) {
                Text("ONEREP", style = TextStyle(
                    color = ColorProvider(Color(0xFF71717A)), fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                ))
                Spacer(GlanceModifier.defaultWeight())
                Image(
                    provider = ImageProvider(R.drawable.ic_widget_camera),
                    contentDescription = null,
                    modifier = GlanceModifier.size(32.dp),
                )
                Spacer(GlanceModifier.defaultWeight())
                Text(context.getString(R.string.widget_snap_camera_label), style = TextStyle(
                    color = ColorProvider(Color(0xFF09090B)), fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                ))
                Text(context.getString(R.string.widget_snap_camera_caption), style = TextStyle(
                    color = ColorProvider(Color(0xFF71717A)), fontSize = 12.sp,
                ))
            }
        }
    }
}

class SnapCameraWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SnapCameraWidget()
}
