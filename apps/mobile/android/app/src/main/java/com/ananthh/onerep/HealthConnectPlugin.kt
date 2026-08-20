package com.ananthh.onerep

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.aggregate.AggregationResult
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.CervicalMucusRecord
import androidx.health.connect.client.records.CyclingPedalingCadenceRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.IntermenstrualBleedingRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.PowerRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.WheelchairPushesRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.BloodGlucose
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import androidx.health.connect.client.units.Power
import androidx.health.connect.client.units.Temperature
import androidx.health.connect.client.units.Volume
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
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.reflect.KClass

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
        // Recovery signals, read-only. Requested alongside the workout
        // permissions rather than in a second prompt: Health Connect shows one
        // consent screen listing everything, and asking twice reads as an app
        // that came back for more.
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        // Body composition. Asked for in the same prompt as everything else —
        // Health Connect shows one screen and a second request later reads as
        // the app having been refused the first time.
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(LeanBodyMassRecord::class),
        HealthPermission.getReadPermission(BoneMassRecord::class),
        HealthPermission.getReadPermission(BasalMetabolicRateRecord::class),
        // Everything else in the platform catalogue, so a custom metric bound
        // to blood glucose or cadence works the moment it is created. Health
        // Connect shows a single consent screen with a checkbox per type, so
        // asking for the long list costs one screen and lets the user refuse
        // individually; coming back for a second grant later is what reads as
        // an app that was told no and asked again.
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(FloorsClimbedRecord::class),
        HealthPermission.getReadPermission(ElevationGainedRecord::class),
        HealthPermission.getReadPermission(WheelchairPushesRecord::class),
        HealthPermission.getReadPermission(Vo2MaxRecord::class),
        HealthPermission.getReadPermission(CyclingPedalingCadenceRecord::class),
        HealthPermission.getReadPermission(PowerRecord::class),
        HealthPermission.getReadPermission(SpeedRecord::class),
        HealthPermission.getReadPermission(BloodGlucoseRecord::class),
        HealthPermission.getReadPermission(BloodPressureRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(RespiratoryRateRecord::class),
        HealthPermission.getReadPermission(BodyTemperatureRecord::class),
        HealthPermission.getReadPermission(BasalBodyTemperatureRecord::class),
        HealthPermission.getReadPermission(HeightRecord::class),
        HealthPermission.getReadPermission(NutritionRecord::class),
        HealthPermission.getReadPermission(HydrationRecord::class),
        HealthPermission.getReadPermission(MenstruationFlowRecord::class),
        HealthPermission.getReadPermission(CervicalMucusRecord::class),
        HealthPermission.getReadPermission(OvulationTestRecord::class),
        HealthPermission.getReadPermission(IntermenstrualBleedingRecord::class),
    )

    /**
     * The subset that gates the toggle in Settings.
     *
     * `authorizationStatus` used to compare against every permission we ask
     * for, which meant one unticked box in the long catalogue list reported the
     * whole integration as "partial" and the Settings row nagged forever. Only
     * the signals the app actually scores on decide whether sync is working.
     */
    private val coreReadPermissions = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
    )

    /**
     * Everything a correction can be written back to.
     *
     * Bundled into the same consent screen as the reads. Health Connect asks
     * once; coming back for write access the first time somebody edits a
     * weigh-in would arrive with no context and read as the app having been
     * refused earlier.
     */
    private val writePermissions = setOf(
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(StepsRecord::class),
        HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class),
        HealthPermission.getWritePermission(FloorsClimbedRecord::class),
        HealthPermission.getWritePermission(ElevationGainedRecord::class),
        HealthPermission.getWritePermission(WheelchairPushesRecord::class),
        HealthPermission.getWritePermission(HydrationRecord::class),
        HealthPermission.getWritePermission(Vo2MaxRecord::class),
        HealthPermission.getWritePermission(RestingHeartRateRecord::class),
        HealthPermission.getWritePermission(HeartRateVariabilityRmssdRecord::class),
        HealthPermission.getWritePermission(BloodGlucoseRecord::class),
        HealthPermission.getWritePermission(OxygenSaturationRecord::class),
        HealthPermission.getWritePermission(RespiratoryRateRecord::class),
        HealthPermission.getWritePermission(BodyTemperatureRecord::class),
        HealthPermission.getWritePermission(BasalBodyTemperatureRecord::class),
        HealthPermission.getWritePermission(WeightRecord::class),
        HealthPermission.getWritePermission(BodyFatRecord::class),
        HealthPermission.getWritePermission(LeanBodyMassRecord::class),
        HealthPermission.getWritePermission(BoneMassRecord::class),
        HealthPermission.getWritePermission(BasalMetabolicRateRecord::class),
        HealthPermission.getWritePermission(HeightRecord::class),
    )

    /** Written by `saveWorkout`; the only write the app performs unprompted. */
    private val workoutWritePermissions = setOf(
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
                        granted.containsAll(coreReadPermissions) -> "authorized"
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

            if (granted.containsAll(coreReadPermissions)) {
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
                    .put("granted", granted.containsAll(coreReadPermissions)),
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

    /**
     * Every catalogue metric Health Connect can deliver, by local day.
     *
     * Mirrors `getDailyMetrics` on the iOS plugin exactly — one entry per local
     * calendar day, oldest first, every field optional. A device with no
     * connected watch legitimately reports steps and nothing else, and a type
     * the user unticked on the consent screen is simply absent rather than
     * fatal to the rest of the day.
     *
     * The keys are `convex/lib/platformHealthMetrics.ts`; the tables below are
     * that catalogue's `google` column made executable. Adding a metric there
     * means adding one line here and one read permission above.
     */
    /**
     * Reads every page of a record query.
     *
     * `readRecords` silently returns one page; across a 35-day window several
     * of these record types exceed it, and a truncated read is a corrupted
     * baseline rather than an error anyone sees.
     */
    private suspend fun <T : androidx.health.connect.client.records.Record> readAll(
        hc: HealthConnectClient,
        request: ReadRecordsRequest<T>,
        onRecord: (T) -> Unit,
    ) {
        var response = hc.readRecords(request)
        response.records.forEach(onRecord)
        var token = response.pageToken
        while (token != null) {
            response = hc.readRecords(
                ReadRecordsRequest(
                    recordType = request.recordType,
                    timeRangeFilter = request.timeRangeFilter,
                    pageToken = token,
                ),
            )
            response.records.forEach(onRecord)
            token = response.pageToken
        }
    }

    @PluginMethod
    fun getDailyMetrics(call: PluginCall) {
        val hc = client
        if (hc == null) {
            call.resolve(JSObject().put("days", JSArray()))
            return
        }

        val daysBack = (call.getInt("daysBack") ?: 30).coerceIn(1, 90)
        // An absent list means "everything", which is what an older shell
        // running newer JS sends. An empty one means the user switched
        // everything off, and is honoured as such.
        val requested: Set<String>? = call.getArray("metrics", null)?.let { array ->
            (0 until array.length()).mapNotNull { array.optString(it, null) }.toSet()
        }
        fun wants(metric: String) = requested == null || requested.contains(metric)
        val zone = ZoneId.systemDefault()
        val startDay = LocalDate.now(zone).minusDays((daysBack - 1).toLong())
        val start = startDay.atStartOfDay(zone).toInstant()
        val end = Instant.now()

        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val buckets = sortedMapOf<String, MutableMap<String, Double>>()

                    fun bucket(day: String): MutableMap<String, Double> =
                        buckets.getOrPut(day) { mutableMapOf() }

                    fun dayOf(instant: Instant): String =
                        instant.atZone(zone).toLocalDate().toString()

                    // Averages are accumulated as sum-and-count and divided at
                    // the end, so a metric written by two sources in the same
                    // day averages across all of its readings rather than
                    // whichever source happened to be read last.
                    val sums = mutableMapOf<Pair<String, String>, Pair<Double, Int>>()
                    fun offerAverage(metric: String, time: Instant, value: Double) {
                        val key = dayOf(time) to metric
                        val (total, count) = sums[key] ?: (0.0 to 0)
                        sums[key] = (total + value) to (count + 1)
                    }

                    // Point measurements keep the day's *last* reading rather
                    // than an average. These come off a scale or a cuff, and
                    // someone who weighs twice wants the second number, not the
                    // mean of a shoe-on and a shoe-off attempt.
                    val latest = mutableMapOf<Pair<String, String>, Pair<Instant, Double>>()
                    fun offerLatest(metric: String, time: Instant, value: Double) {
                        val key = dayOf(time) to metric
                        val held = latest[key]
                        if (held == null || time.isAfter(held.first)) {
                            latest[key] = time to value
                        }
                    }

                    val localRange = TimeRangeFilter.between(
                        startDay.atStartOfDay(),
                        end.atZone(zone).toLocalDateTime(),
                    )
                    val range = TimeRangeFilter.between(start, end)

                    /**
                     * A summed metric, through the aggregate API.
                     *
                     * Aggregation de-duplicates across data origins — a phone
                     * and a watch both counting the same walk must not add up —
                     * and it sidesteps the paging problem, since raw step
                     * records arrive in 15-minute chunks that overflow a page
                     * across a 35-day window.
                     *
                     * One request per metric rather than one for the lot: a
                     * single aggregate over a type the user declined throws,
                     * and it would take every other total down with it.
                     */
                    suspend fun total(
                        key: String,
                        metric: AggregateMetric<*>,
                        read: (AggregationResult) -> Double?,
                    ) {
                        if (!wants(key)) return
                        runCatching {
                            hc.aggregateGroupByPeriod(
                                AggregateGroupByPeriodRequest(
                                    metrics = setOf(metric),
                                    timeRangeFilter = localRange,
                                    timeRangeSlicer = Period.ofDays(1),
                                ),
                            ).forEach { slice ->
                                read(slice.result)?.let {
                                    bucket(slice.startTime.toLocalDate().toString())[key] = it
                                }
                            }
                        }
                    }

                    /**
                     * Every record of one type, or nothing at all.
                     *
                     * The runCatching is the whole point: a type the user
                     * unticked on the consent screen throws on read, and a
                     * declined blood glucose must not cost the day its steps.
                     */
                    suspend fun <T : Record> read(
                        key: String,
                        type: KClass<T>,
                        onRecord: (T) -> Unit,
                    ) {
                        if (!wants(key)) return
                        runCatching {
                            readAll(
                                hc,
                                ReadRecordsRequest(recordType = type, timeRangeFilter = range),
                                onRecord,
                            )
                        }
                    }

                    suspend fun <T : Record> average(
                        key: String,
                        type: KClass<T>,
                        values: (T) -> List<Pair<Instant, Double>>,
                    ) = read(key, type) { record ->
                        values(record).forEach { (time, value) -> offerAverage(key, time, value) }
                    }

                    suspend fun <T : Record> newest(
                        key: String,
                        type: KClass<T>,
                        value: (T) -> Pair<Instant, Double>?,
                    ) = read(key, type) { record ->
                        value(record)?.let { (time, reading) -> offerLatest(key, time, reading) }
                    }

                    // ── Cumulative ───────────────────────────────────────────
                    total("steps", StepsRecord.COUNT_TOTAL) {
                        it[StepsRecord.COUNT_TOTAL]?.toDouble()
                    }
                    total(
                        "activeEnergyKcal",
                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    ) { it[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories }
                    total(
                        "totalEnergyKcal",
                        TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                    ) { it[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories }
                    total(
                        "exerciseMinutes",
                        ExerciseSessionRecord.EXERCISE_DURATION_TOTAL,
                    ) { it[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes()?.toDouble() }
                    // Health Connect keeps one distance figure across every
                    // activity, so on Android this key includes the bike and
                    // the pool. The catalogue says so; nobody is being misled.
                    total(
                        "distanceWalkingRunningM",
                        DistanceRecord.DISTANCE_TOTAL,
                    ) { it[DistanceRecord.DISTANCE_TOTAL]?.inMeters }
                    total(
                        "floorsClimbed",
                        FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL,
                    ) { it[FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL] }
                    total(
                        "elevationGainedM",
                        ElevationGainedRecord.ELEVATION_GAINED_TOTAL,
                    ) { it[ElevationGainedRecord.ELEVATION_GAINED_TOTAL]?.inMeters }
                    total(
                        "wheelchairPushes",
                        WheelchairPushesRecord.COUNT_TOTAL,
                    ) { it[WheelchairPushesRecord.COUNT_TOTAL]?.toDouble() }
                    total("hydrationMl", HydrationRecord.VOLUME_TOTAL) {
                        it[HydrationRecord.VOLUME_TOTAL]?.inMilliliters
                    }
                    total("dietaryEnergyKcal", NutritionRecord.ENERGY_TOTAL) {
                        it[NutritionRecord.ENERGY_TOTAL]?.inKilocalories
                    }
                    total("dietaryProteinG", NutritionRecord.PROTEIN_TOTAL) {
                        it[NutritionRecord.PROTEIN_TOTAL]?.inGrams
                    }
                    total("dietaryCarbsG", NutritionRecord.TOTAL_CARBOHYDRATE_TOTAL) {
                        it[NutritionRecord.TOTAL_CARBOHYDRATE_TOTAL]?.inGrams
                    }
                    total("dietaryFatG", NutritionRecord.TOTAL_FAT_TOTAL) {
                        it[NutritionRecord.TOTAL_FAT_TOTAL]?.inGrams
                    }
                    total("caffeineMg", NutritionRecord.CAFFEINE_TOTAL) {
                        it[NutritionRecord.CAFFEINE_TOTAL]?.inMilligrams
                    }

                    // ── Averaged ─────────────────────────────────────────────
                    average("restingHeartRateBpm", RestingHeartRateRecord::class) {
                        listOf(it.time to it.beatsPerMinute.toDouble())
                    }
                    // Series records carry a sample list rather than one value,
                    // and every sample counts towards the day's mean.
                    average("heartRateBpm", HeartRateRecord::class) { record ->
                        record.samples.map { it.time to it.beatsPerMinute.toDouble() }
                    }
                    average("hrvMs", HeartRateVariabilityRmssdRecord::class) {
                        listOf(it.time to it.heartRateVariabilityMillis)
                    }
                    average("cyclingCadenceRpm", CyclingPedalingCadenceRecord::class) { record ->
                        record.samples.map { it.time to it.revolutionsPerMinute }
                    }
                    average("powerWatts", PowerRecord::class) { record ->
                        record.samples.map { it.time to it.power.inWatts }
                    }
                    average("speedMps", SpeedRecord::class) { record ->
                        record.samples.map { it.time to it.speed.inMetersPerSecond }
                    }
                    average("bloodGlucoseMmolL", BloodGlucoseRecord::class) {
                        listOf(it.time to it.level.inMillimolesPerLiter)
                    }
                    average("oxygenSaturationPct", OxygenSaturationRecord::class) {
                        listOf(it.time to it.percentage.value)
                    }
                    average("respiratoryRateBpm", RespiratoryRateRecord::class) {
                        listOf(it.time to it.rate)
                    }
                    // Apple files systolic and diastolic as two separate
                    // identifiers; Health Connect keeps one record with both
                    // numbers, so this single read feeds two catalogue keys and
                    // honours the filter for each of them independently.
                    read("bloodPressureSystolic", BloodPressureRecord::class) { record ->
                        offerAverage(
                            "bloodPressureSystolic",
                            record.time,
                            record.systolic.inMillimetersOfMercury,
                        )
                    }
                    read("bloodPressureDiastolic", BloodPressureRecord::class) { record ->
                        offerAverage(
                            "bloodPressureDiastolic",
                            record.time,
                            record.diastolic.inMillimetersOfMercury,
                        )
                    }

                    // ── Point measurements ───────────────────────────────────
                    newest("weightKg", WeightRecord::class) { it.time to it.weight.inKilograms }
                    newest("bodyFatPct", BodyFatRecord::class) { it.time to it.percentage.value }
                    newest("leanBodyMassKg", LeanBodyMassRecord::class) {
                        it.time to it.mass.inKilograms
                    }
                    newest("boneMassKg", BoneMassRecord::class) { it.time to it.mass.inKilograms }
                    // A rate, not an accumulation: Health Connect states BMR as
                    // kcal per day, which is already the number the targets are
                    // sanity-checked against. Summing the day's records would
                    // multiply it by however often the scale reported.
                    newest("basalMetabolicRateKcal", BasalMetabolicRateRecord::class) {
                        it.time to it.basalMetabolicRate.inKilocaloriesPerDay
                    }
                    newest("heightCm", HeightRecord::class) {
                        it.time to it.height.inMeters * 100
                    }
                    newest("vo2Max", Vo2MaxRecord::class) {
                        it.time to it.vo2MillilitersPerMinuteKilogram
                    }
                    newest("bodyTemperatureC", BodyTemperatureRecord::class) {
                        it.time to it.temperature.inCelsius
                    }
                    newest("basalBodyTemperatureC", BasalBodyTemperatureRecord::class) {
                        it.time to it.temperature.inCelsius
                    }
                    // Reproductive readings arrive as enum levels. They are
                    // passed through as the platform's own numbers rather than
                    // rescaled, the way HRV is: a level means what the store
                    // that wrote it says it means.
                    newest("menstruationFlow", MenstruationFlowRecord::class) {
                        it.time to it.flow.toDouble()
                    }
                    newest("cervicalMucus", CervicalMucusRecord::class) {
                        it.time to it.appearance.toDouble()
                    }
                    newest("ovulationTest", OvulationTestRecord::class) {
                        it.time to it.result.toDouble()
                    }
                    // No level to record — the reading is that it happened.
                    newest("intermenstrualBleeding", IntermenstrualBleedingRecord::class) {
                        it.time to 1.0
                    }

                    // Merge overlapping sessions before attributing them. A phone
                    // and a watch recording the same night must not add up to
                    // sixteen hours of sleep.
                    //
                    // Sleep is credited to the day it was woken up on: somebody
                    // who goes to bed at 23:30 and wakes at 07:00 slept for the
                    // second day, which is the one the coach will be talking
                    // about.
                    val sessions = mutableListOf<SleepSessionRecord>()
                    read("sleepMinutes", SleepSessionRecord::class) { sessions.add(it) }
                    sessions.sortBy { it.startTime }

                    val merged = mutableListOf<Pair<Instant, Instant>>()
                    sessions.forEach { record ->
                        val last = merged.lastOrNull()
                        if (last != null && !record.startTime.isAfter(last.second)) {
                            merged[merged.size - 1] =
                                last.first to maxOf(last.second, record.endTime)
                        } else {
                            merged.add(record.startTime to record.endTime)
                        }
                    }
                    merged.forEach { (from, to) ->
                        val day = bucket(dayOf(to))
                        day["sleepMinutes"] =
                            (day["sleepMinutes"] ?: 0.0) + Duration.between(from, to).toMinutes()
                    }

                    sums.forEach { (key, entry) ->
                        bucket(key.first)[key.second] = entry.first / entry.second
                    }
                    latest.forEach { (key, entry) ->
                        bucket(key.first)[key.second] = entry.second
                    }

                    buckets.map { (date, fields) ->
                        JSObject().apply {
                            put("date", date)
                            fields.forEach { (key, value) -> put(key, value) }
                        }
                    }
                }
            }.onSuccess { days ->
                val array = JSArray()
                days.forEach { array.put(it) }
                call.resolve(JSObject().put("days", array))
            }.onFailure {
                call.reject(it.message ?: "Unable to read Health Connect metrics", it.asException())
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
                    if (!granted.containsAll(workoutWritePermissions)) return@withContext false

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

    /**
     * Writes a corrected reading back to Health Connect.
     *
     * The edit is already saved in OneRep before this runs, so every refusal
     * resolves `saved: false` rather than rejecting. A metric this platform has
     * no record for, or one the user declined write access to, is a shrug.
     *
     * Honestly: Health Connect will not let us amend a record another app owns,
     * so this inserts ours next to the original. Someone who corrects a
     * smart-scale weigh-in will see two entries for that day in Health Connect,
     * theirs and the scale's. We cannot overwrite and should not imply we do.
     */
    @PluginMethod
    fun saveDailyMetric(call: PluginCall) {
        val hc = client
        val metric = call.getString("metric")
        val date = call.getString("date")
        val value = call.getDouble("value")
        if (hc == null || metric == null || date == null || value == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }

        val zone = ZoneId.systemDefault()
        val day = runCatching { LocalDate.parse(date) }.getOrNull()
        if (day == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }

        val now = Instant.now()
        val dayStart = day.atStartOfDay(zone).toInstant()
        // Nothing may be dated in the future, so an edit to today stops at now.
        val dayEnd = minOf(day.plusDays(1).atStartOfDay(zone).toInstant(), now)
        // Point measurements land at midday rather than midnight: a record on
        // the boundary gets filed under the previous day by anything that
        // rounds the other way, and this one has to survive our own reader.
        val at = minOf(day.atTime(12, 0).atZone(zone).toInstant(), now)
        val offset = zone.rules.getOffset(at)
        val spanOffset = zone.rules.getOffset(dayStart)
        val meta = Metadata.manualEntry()

        val record: Record? = when (metric) {
            "steps" -> StepsRecord(dayStart, spanOffset, dayEnd, spanOffset, value.toLong(), meta)
            "activeEnergyKcal" -> ActiveCaloriesBurnedRecord(
                dayStart, spanOffset, dayEnd, spanOffset, Energy.kilocalories(value), meta,
            )
            "totalEnergyKcal" -> TotalCaloriesBurnedRecord(
                dayStart, spanOffset, dayEnd, spanOffset, Energy.kilocalories(value), meta,
            )
            "distanceWalkingRunningM" -> DistanceRecord(
                dayStart, spanOffset, dayEnd, spanOffset, Length.meters(value), meta,
            )
            "floorsClimbed" -> FloorsClimbedRecord(
                dayStart, spanOffset, dayEnd, spanOffset, value, meta,
            )
            "elevationGainedM" -> ElevationGainedRecord(
                dayStart, spanOffset, dayEnd, spanOffset, Length.meters(value), meta,
            )
            "wheelchairPushes" -> WheelchairPushesRecord(
                dayStart, spanOffset, dayEnd, spanOffset, value.toLong(), meta,
            )
            "hydrationMl" -> HydrationRecord(
                dayStart, spanOffset, dayEnd, spanOffset, Volume.milliliters(value), meta,
            )
            "vo2Max" -> Vo2MaxRecord(time = at, zoneOffset = offset, vo2MillilitersPerMinuteKilogram = value, metadata = meta)
            "restingHeartRateBpm" -> RestingHeartRateRecord(at, offset, value.toLong(), meta)
            "hrvMs" -> HeartRateVariabilityRmssdRecord(at, offset, value, meta)
            "bloodGlucoseMmolL" -> BloodGlucoseRecord(
                time = at,
                zoneOffset = offset,
                level = BloodGlucose.millimolesPerLiter(value),
                metadata = meta,
            )
            "oxygenSaturationPct" -> OxygenSaturationRecord(at, offset, Percentage(value), meta)
            "respiratoryRateBpm" -> RespiratoryRateRecord(at, offset, value, meta)
            "bodyTemperatureC" -> BodyTemperatureRecord(
                time = at, zoneOffset = offset, temperature = Temperature.celsius(value), metadata = meta,
            )
            "basalBodyTemperatureC" -> BasalBodyTemperatureRecord(
                time = at, zoneOffset = offset, temperature = Temperature.celsius(value), metadata = meta,
            )
            "weightKg" -> WeightRecord(at, offset, Mass.kilograms(value), meta)
            "bodyFatPct" -> BodyFatRecord(at, offset, Percentage(value), meta)
            "leanBodyMassKg" -> LeanBodyMassRecord(at, offset, Mass.kilograms(value), meta)
            "boneMassKg" -> BoneMassRecord(at, offset, Mass.kilograms(value), meta)
            "basalMetabolicRateKcal" -> BasalMetabolicRateRecord(
                at, offset, Power.kilocaloriesPerDay(value), meta,
            )
            "heightCm" -> HeightRecord(at, offset, Length.meters(value / 100), meta)
            // Deliberately unwritable. Nutrition needs a meal to hang off,
            // blood pressure is one record holding two numbers so half of it
            // cannot be corrected on its own, and the sleep and reproductive
            // records carry structure a single number cannot reconstruct.
            else -> null
        }

        if (record == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }

        scope.launch {
            val saved = runCatching {
                withContext(Dispatchers.IO) {
                    val granted = hc.permissionController.getGrantedPermissions()
                    val permission = HealthPermission.getWritePermission(record::class)
                    if (!granted.contains(permission)) return@withContext false
                    hc.insertRecords(listOf(record))
                    true
                }
            }.getOrDefault(false)

            call.resolve(JSObject().put("saved", saved))
        }
    }
}
