package com.ananthh.onerep

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.*
import android.net.Uri
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File

/** Location foreground service keeps recording when the screen/WebView sleeps. */
class EnduranceLocationService : Service(), LocationListener {
    companion object {
        const val CHANNEL = "endurance_location"
        const val NOTIFICATION_ID = 9843
        const val PAUSE = "com.ananthh.onerep.ENDURANCE_PAUSE"
        @Volatile var running = false
        private var instance: EnduranceJournal? = null
        @Synchronized fun reset(context: Context) {
            val directory = File(context.noBackupFilesDir, "endurance-location")
            check(!directory.exists() || directory.deleteRecursively()) { "Could not clear the native workout backup." }
            instance = EnduranceJournal(directory)
        }
        @Synchronized fun journal(context: Context): EnduranceJournal {
            if (instance == null) {
                instance = EnduranceJournal(File(context.noBackupFilesDir, "endurance-location"))
                // On process death there is no live service. Freeze time at the last fix.
                instance!!.recoverInterrupted(System.currentTimeMillis().toDouble())
            }
            return instance!!
        }
    }
    private lateinit var locations: LocationManager
    override fun onCreate() { super.onCreate(); running = true; locations = getSystemService(LocationManager::class.java) }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val store = journal(this)
        if (intent?.action == PAUSE) {
            val state = store.state()
            if (state.optBoolean("active")) store.control(state.getString("sessionId"), false, System.currentTimeMillis().toDouble())
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val manager = getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "Workout location", NotificationManager.IMPORTANCE_LOW))
            val open = Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("onerep://endurance/active"))
            val content = PendingIntent.getActivity(this, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val pause = PendingIntent.getService(this, NOTIFICATION_ID, Intent(this, EnduranceLocationService::class.java).setAction(PAUSE), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notification = NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_onerep)
                .setContentTitle("OneRep is recording your route").setContentText("Tracking continues with your screen locked.")
                .setContentIntent(content).setOngoing(true).setOnlyAlertOnce(true)
                .addAction(0, "Pause", pause).build()
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            else startForeground(NOTIFICATION_ID, notification)
            check(ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { "Allow Precise Location for OneRep to record your route." }
            check(locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) { "Turn on location services, then resume your workout." }
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 3f, this, Looper.getMainLooper())
        } catch (error: Exception) { fail(error.message ?: "Location tracking could not start.") }
        return START_NOT_STICKY
    }
    override fun onLocationChanged(location: Location) {
        if (!location.hasAccuracy() || location.accuracy < 0 || kotlin.math.abs(System.currentTimeMillis() - location.time) > 30000) return
        try {
            journal(this).append(JSONObject().put("latitude", location.latitude).put("longitude", location.longitude)
                .put("timestamp", location.time).put("accuracy", location.accuracy.toDouble())
                .put("altitude", if (location.hasAltitude()) location.altitude else JSONObject.NULL)
                .put("altitudeAccuracy", if (Build.VERSION.SDK_INT >= 26 && location.hasVerticalAccuracy()) location.verticalAccuracyMeters.toDouble() else JSONObject.NULL))
        } catch (error: Exception) { fail(error.message ?: "Could not save route points on this device.") }
    }
    override fun onProviderDisabled(provider: String) { if (provider == LocationManager.GPS_PROVIDER) fail("Location services stopped. Turn location on and resume your workout.") }
    override fun onProviderEnabled(provider: String) {}
    @Deprecated("Required on older Android versions")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    private fun fail(message: String) {
        val store = journal(this)
        val state = store.state()
        if (state.optBoolean("active")) store.control(state.getString("sessionId"), false, System.currentTimeMillis().toDouble(), error = message)
        stopSelf()
    }
    override fun onDestroy() {
        locations.removeUpdates(this)
        running = false
        val store = journal(this)
        val state = store.state()
        if (state.optString("status") == "recording") store.control(state.getString("sessionId"), false, System.currentTimeMillis().toDouble(), error = "Location service stopped. Resume your workout to keep recording.")
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
