package com.ananthh.onerep

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Health Connect — the Android counterpart of AppleHealthPlugin.swift.
 *
 * The JS surface is deliberately identical to the iOS plugin's (`isAvailable`,
 * `requestAuthorization`, `getRecentWorkouts`, `saveWorkout`) and returns the
 * same 14-field workout shape, so src/lib/health-provider.ts can switch on
 * platform and hand the rest of the app one type.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private companion object {
        const val HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val iso: DateTimeFormatter = DateTimeFormatter.ISO_INSTANT

    private val readPermissions = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    )

    private val writePermissions = setOf(
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
    )

    private val allPermissions = readPermissions + writePermissions

    private val client: HealthConnectClient?
        get() = if (sdkStatus() == HealthConnectClient.SDK_AVAILABLE) {
            runCatching { HealthConnectClient.getOrCreate(context) }.getOrNull()
        } else {
            null
        }

    private fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    // MARK: - Availability

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = sdkStatus()
        val available = status == HealthConnectClient.SDK_AVAILABLE
        val result = JSObject()
            .put("available", available)
            .put("platform", "android")
            // Distinguishes "no Health Connect on this device" from "installed
            // but out of date" so Settings can offer the Play Store instead of
            // a dead toggle.
            .put(
                "providerStatus",
                when (status) {
                    HealthConnectClient.SDK_AVAILABLE -> "available"
                    HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
                    else -> "unavailable"
                },
            )

        if (!available) {
            call.resolve(result.put("authorizationStatus", "unknown"))
            return
        }

        scope.launch {
            val granted = runCatching {
                withContext(Dispatchers.IO) {
                    client?.permissionController?.getGrantedPermissions() ?: emptySet()
                }
            }.getOrDefault(emptySet())

            call.resolve(
                result.put(
                    "authorizationStatus",
                    when {
                        granted.containsAll(readPermissions) -> "authorized"
                        granted.isEmpty() -> "not_determined"
                        else -> "partial"
                    },
                ),
            )
        }
    }

    // MARK: - Authorization

    @PluginMethod
    fun requestAuthorization(call: PluginCall) {
        if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(JSObject().put("available", false).put("granted", false))
            return
        }

        scope.launch {
            val granted = runCatching {
                withContext(Dispatchers.IO) {
                    client?.permissionController?.getGrantedPermissions() ?: emptySet()
                }
            }.getOrDefault(emptySet())

            if (granted.containsAll(readPermissions)) {
                call.resolve(JSObject().put("available", true).put("granted", true))
                return@launch
            }

            // Unlike HealthKit, Health Connect grants permission through a
            // separate Activity. The app is backgrounded for the duration, which
            // is why the JS sync component's re-entrancy guard matters.
            val intent: Intent = PermissionController
                .createRequestPermissionResultContract()
                .createIntent(activity, allPermissions)

            startActivityForResult(call, intent, "handleAuthorizationResult")
        }
    }

    @ActivityCallback
    private fun handleAuthorizationResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch {
            val granted = runCatching {
                withContext(Dispatchers.IO) {
                    client?.permissionController?.getGrantedPermissions() ?: emptySet()
                }
            }.getOrDefault(emptySet())

            call.resolve(
                JSObject()
                    .put("available", true)
                    .put("granted", granted.containsAll(readPermissions)),
            )
        }
    }

    /**
     * Health Connect has no programmatic revoke, so Settings sends users to the
     * Health Connect app itself.
     */
    /**
     * Sends the user to the Play Store listing for Health Connect.
     *
     * Needed because Health Connect is a separate, optionally-installed app
     * before Android 14 — there is no equivalent failure mode on iOS.
     */
    @PluginMethod
    fun openProviderListing(call: PluginCall) {
        val marketUri = Uri.parse(
            "market://details?id=$HEALTH_CONNECT_PACKAGE&url=healthconnect%3A%2F%2Fonboarding",
        )
        val webUri = Uri.parse(
            "https://play.google.com/store/apps/details?id=$HEALTH_CONNECT_PACKAGE",
        )

        val opened = runCatching {
            activity.startActivity(Intent(Intent.ACTION_VIEW, marketUri))
            true
        }.getOrElse {
            runCatching {
                activity.startActivity(Intent(Intent.ACTION_VIEW, webUri))
                true
            }.getOrDefault(false)
        }

        if (opened) call.resolve() else call.reject("Unable to open the Play Store")
    }

    @PluginMethod
    fun openHealthSettings(call: PluginCall) {
        val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        runCatching { activity.startActivity(intent) }
            .onSuccess { call.resolve() }
            .onFailure { call.reject("Unable to open Health Connect", it.asException()) }
    }

    // MARK: - Read

    @PluginMethod
    fun getRecentWorkouts(call: PluginCall) {
        val hc = client
        if (hc == null) {
            call.resolve(JSObject().put("workouts", JSArray()))
            return
        }

        // Same clamps as the iOS plugin so both platforms page identically.
        val limit = (call.getInt("limit") ?: 12).coerceIn(1, 50)
        val daysBack = (call.getInt("daysBack") ?: 30).coerceIn(1, 365)
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(daysBack.toLong()))

        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val sessions = hc.readRecords(
                        ReadRecordsRequest(
                            recordType = ExerciseSessionRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                            ascendingOrder = false,
                            // Over-fetch like iOS does (limit * 3, capped) so the
                            // cardio filter still yields a full page.
                            pageSize = (limit * 3).coerceIn(limit, 100),
                        ),
                    ).records

                    sessions
                        .filter { HealthActivityTypes.isCardio(it.exerciseType) }
                        .take(limit)
                        .map { serialize(hc, it) }
                }
            }.onSuccess { workouts ->
                val array = JSArray()
                workouts.forEach { array.put(it) }
                call.resolve(JSObject().put("workouts", array))
            }.onFailure {
                call.reject(it.message ?: "Unable to read Health Connect workouts", it.asException())
            }
        }
    }

    private suspend fun serialize(
        hc: HealthConnectClient,
        session: ExerciseSessionRecord,
    ): JSObject {
        val activityName = HealthActivityTypes.displayName(session.exerciseType)
        val packageName = session.metadata.dataOrigin.packageName
        val durationSeconds = Duration.between(session.startTime, session.endTime).seconds

        val item = JSObject()
            // Health Connect's record id is the stable dedupe key, the analogue
            // of the HealthKit sample UUID.
            .put("uuid", session.metadata.id)
            .put("activityType", HealthActivityTypes.slug(session.exerciseType))
            .put("activityName", activityName)
            .put("startedAt", iso.format(session.startTime))
            .put("endedAt", iso.format(session.endTime))
            .put("durationSeconds", durationSeconds.toInt())
            .put("sourceName", appLabel(packageName))
            .put("sourceBundleId", packageName)

        val range = TimeRangeFilter.between(session.startTime, session.endTime)
        val aggregate: AggregationResult? = runCatching {
            hc.aggregate(
                AggregateRequest(
                    metrics = setOf(
                        HeartRateRecord.BPM_AVG,
                        HeartRateRecord.BPM_MAX,
                        DistanceRecord.DISTANCE_TOTAL,
                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    ),
                    timeRangeFilter = range,
                ),
            )
        }.getOrNull()

        aggregate?.get(DistanceRecord.DISTANCE_TOTAL)?.inMeters
            ?.takeIf { it > 0 }
            ?.let { item.put("totalDistanceMeters", it) }

        aggregate?.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)?.inKilocalories
            ?.takeIf { it > 0 }
            ?.let { item.put("activeEnergyKcal", it) }

        aggregate?.get(HeartRateRecord.BPM_AVG)
            ?.let { item.put("avgHeartRateBpm", it.toDouble()) }

        aggregate?.get(HeartRateRecord.BPM_MAX)
            ?.let { item.put("maxHeartRateBpm", it.toDouble()) }

        val hasRoute = session.exerciseRouteResult is ExerciseRouteResult.Data
        item.put("hasRoute", hasRoute)
        if (hasRoute) {
            item.put("routeName", "Health Connect $activityName route")
        }

        return item
    }

    /** PluginCall.reject takes an Exception; coroutine failures surface as Throwable. */
    private fun Throwable.asException(): Exception =
        this as? Exception ?: Exception(this)

    /** Health Connect exposes only a package name; resolve the user-facing label. */
    private fun appLabel(packageName: String): String = runCatching {
        val pm: PackageManager = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    }.getOrDefault(packageName)

    // MARK: - Write

    /**
     * Writes a completed OneRep strength session back to Health Connect.
     * Opt-in; src/lib/health-provider.ts only calls this when the user has
     * enabled it in Settings.
     */
    @PluginMethod
    fun saveWorkout(call: PluginCall) {
        val hc = client
        if (hc == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }

        val startedAt = call.getDouble("startedAt")
        val endedAt = call.getDouble("endedAt")
        if (startedAt == null || endedAt == null) {
            call.reject("startedAt and endedAt are required")
            return
        }

        val title = call.getString("title") ?: "OneRep workout"
        val start = Instant.ofEpochMilli(startedAt.toLong())
        val end = Instant.ofEpochMilli(endedAt.toLong())
        val zone = ZoneId.systemDefault().rules

        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val granted = hc.permissionController.getGrantedPermissions()
                    if (!granted.containsAll(writePermissions)) return@withContext false

                    hc.insertRecords(
                        listOf(
                            ExerciseSessionRecord(
                                startTime = start,
                                startZoneOffset = zone.getOffset(start),
                                endTime = end,
                                endZoneOffset = zone.getOffset(end),
                                exerciseType =
                                    ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
                                title = title,
                                metadata = Metadata.manualEntry(),
                            ),
                        ),
                    )
                    true
                }
            }.onSuccess { saved ->
                call.resolve(JSObject().put("saved", saved))
            }.onFailure {
                call.reject(
                    it.message ?: "Unable to save workout to Health Connect",
                    it.asException(),
                )
            }
        }
    }
}
