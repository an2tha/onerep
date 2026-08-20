import ActivityKit
import Capacitor
import Foundation
import HealthKit
import WidgetKit

@objc(AppleHealthPlugin)
public class AppleHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleHealthPlugin"
    public let jsName = "AppleHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRecentWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDailyMetrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveDailyMetric", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let isoFormatter = ISO8601DateFormatter()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": HKHealthStore.isHealthDataAvailable(),
            "platform": "ios",
            "authorizationStatus": authorizationStatusName(
                healthStore.authorizationStatus(for: HKObjectType.workoutType())
            )
        ])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve([
                "available": false,
                "granted": false
            ])
            return
        }

        healthStore.requestAuthorization(toShare: healthShareTypes(), read: healthReadTypes()) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription, nil, error)
                    return
                }

                call.resolve([
                    "available": true,
                    "granted": success
                ])
            }
        }
    }

    @objc func getRecentWorkouts(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["workouts": []])
            return
        }

        let limit = min(max(call.getInt("limit") ?? 12, 1), 50)
        let daysBack = min(max(call.getInt("daysBack") ?? 30, 1), 365)
        let endDate = Date()
        let startDate = Calendar.current.date(byAdding: .day, value: -daysBack, to: endDate) ?? endDate
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictEndDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let fetchLimit = min(max(limit * 3, limit), 100)

        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: fetchLimit,
            sortDescriptors: [sort]
        ) { [weak self] _, samples, error in
            guard let self = self else { return }

            if let error = error {
                DispatchQueue.main.async {
                    call.reject(error.localizedDescription, nil, error)
                }
                return
            }

            let workouts = (samples as? [HKWorkout] ?? [])
                .filter { self.isCardioWorkout($0.workoutActivityType) }
                .prefix(limit)

            self.serializeWorkouts(Array(workouts)) { serialized in
                call.resolve(["workouts": serialized])
            }
        }

        healthStore.execute(query)
    }

    /**
     Every catalogue metric HealthKit can deliver, by local day.

     Returns one entry per local calendar day, oldest first, with every field
     optional — each is a different sensor with a different failure mode, and a
     phone with no watch legitimately has steps and nothing else. The keys are
     `convex/lib/platformHealthMetrics.ts`; the tables below are that
     catalogue's `apple` column made executable.

     Days are keyed by the *local* calendar, and sleep is attributed to the day
     it was woken up on. Somebody who goes to bed at 23:30 on Monday and wakes
     at 07:00 on Tuesday slept for Tuesday, which is the day the coach will be
     talking about.
     */
    @objc func getDailyMetrics(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["days": []])
            return
        }

        let daysBack = min(max(call.getInt("daysBack") ?? 30, 1), 90)
        // An absent list means "everything", which is what an older shell
        // running newer JS sends. An empty one means the user switched them all
        // off, and is honoured as such.
        let requested: Set<String>? = (call.getArray("metrics") as? [String]).map(Set.init)
        func wants(_ metric: String) -> Bool {
            guard let requested else { return true }
            return requested.contains(metric)
        }
        let calendar = Calendar.current
        // The window ends *now*, not at midnight. Ending at startOfDay excluded
        // today's steps and heart data entirely, and — worse — dropped last
        // night's sleep for anyone who fell asleep after midnight, since the
        // whole sample then started after the cutoff. Android already used now;
        // the two platforms must not disagree about what a day is.
        let end = Date()
        let startOfToday = calendar.startOfDay(for: end)
        guard let start = calendar.date(byAdding: .day, value: -(daysBack - 1), to: startOfToday) else {
            call.resolve(["days": []])
            return
        }

        var buckets: [String: [String: Any]] = [:]
        let group = DispatchGroup()
        let lock = NSLock()

        func record(_ dayKey: String, _ field: String, _ value: Double) {
            lock.lock()
            var bucket = buckets[dayKey] ?? ["date": dayKey]
            bucket[field] = value
            buckets[dayKey] = bucket
            lock.unlock()
        }

        // Every catalogue quantity, driven by the table rather than a chain
        // of special cases: adding a metric to platformHealthMetrics.ts means
        // adding one row to `dailyQuantities()` and nothing else.
        for quantity in dailyQuantities() {
            guard wants(quantity.key),
                  let type = quantityType(quantity.identifier) else { continue }
            group.enter()
            switch quantity.rollup {
            case .sum, .average, .max:
                collectDailyStatistics(
                    type: type,
                    unit: quantity.unit,
                    options: quantity.statisticsOptions,
                    start: start,
                    end: end,
                    calendar: calendar
                ) { results in
                    results.forEach { record($0.key, quantity.key, $0.value * quantity.scale) }
                    group.leave()
                }
            case .latest:
                collectDailyLatest(
                    type: type,
                    unit: quantity.unit,
                    start: start,
                    end: end,
                    calendar: calendar
                ) { results in
                    results.forEach { record($0.key, quantity.key, $0.value * quantity.scale) }
                    group.leave()
                }
            }
        }

        for category in dailyCategories() {
            guard wants(category.key),
                  let type = categoryType(category.identifier) else { continue }
            group.enter()
            collectDailyCategory(
                type: type,
                rollup: category.rollup,
                level: category.level,
                start: start,
                end: end,
                calendar: calendar
            ) { results in
                results.forEach { record($0.key, category.key, $0.value) }
                group.leave()
            }
        }

        // Sleep keeps its own reader: it is the only category where the sample
        // value decides whether the sample counts at all, and where two
        // sources recording the same night have to be merged rather than added.
        // Total and stages come out of one query because they are one query on
        // Apple's side too — the stages are values of `sleepAnalysis`, not
        // types of their own, so asking five times would read the same samples
        // five times for the same answer.
        let wantedSleepKeys = sleepStages().map(\.key).filter(wants)
        if !wantedSleepKeys.isEmpty {
            group.enter()
            collectDailySleepMinutes(start: start, end: end, calendar: calendar) { staged in
                for (metric, results) in staged where wantedSleepKeys.contains(metric) {
                    results.forEach { record($0.key, metric, $0.value) }
                }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            let days = buckets.values.sorted {
                ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "")
            }
            call.resolve(["days": days])
        }
    }

    // MARK: - The catalogue, in HealthKit terms

    /// How a day's readings for one type collapse into a single number.
    private enum DailyRollup {
        case sum
        case average
        case latest
        /// The day's largest reading. Only heart rate recovery wants this: the
        /// day's best rebound is the signal, and averaging it with a lazier
        /// interval an hour later buries exactly the number being watched.
        case max
    }

    private struct DailyQuantity {
        /// Catalogue key, verbatim from `platformHealthMetrics.ts`.
        let key: String
        /// The catalogue's `apple` column: the identifier minus its prefix.
        let identifier: String
        let unit: HKUnit
        let rollup: DailyRollup
        /// HealthKit states ratios as fractions; the app talks whole percent.
        var scale: Double = 1
        /**
         Whether HealthKit will accept a sample of this type from us.

         Apple's own derived types are read-only, and asking to *share* one does
         not fail quietly on that type alone — `requestAuthorization` rejects the
         entire request, so a single unwritable entry in this table costs the
         user every permission in the app. Exercise time and sleeping wrist
         temperature are computed by watchOS and belong to it.
         */
        var writable: Bool = true

        var statisticsOptions: HKStatisticsOptions {
            switch rollup {
            case .sum: return .cumulativeSum
            case .max: return .discreteMax
            default: return .discreteAverage
            }
        }
    }

    /**
     Resolves a catalogue identifier to a HealthKit type by raw string.

     Deliberately not the `HKQuantityTypeIdentifier` constants: cycling power,
     cycling cadence and running speed only exist from iOS 16 and 17, and naming
     the constants makes the whole file refuse to compile against an older
     deployment target — for metrics most users will never have written. An
     identifier this OS has never heard of comes back nil and the metric is
     skipped, which is exactly what happens to one the user declined.
     */
    private func quantityType(_ identifier: String) -> HKQuantityType? {
        HKObjectType.quantityType(
            forIdentifier: HKQuantityTypeIdentifier(rawValue: "HKQuantityTypeIdentifier" + identifier)
        )
    }

    private func categoryType(_ identifier: String) -> HKCategoryType? {
        HKObjectType.categoryType(
            forIdentifier: HKCategoryTypeIdentifier(rawValue: "HKCategoryTypeIdentifier" + identifier)
        )
    }

    private func dailyQuantities() -> [DailyQuantity] {
        let perMinute = HKUnit.count().unitDivided(by: HKUnit.minute())
        // Spelled out rather than HKUnit(from: "ml/(kg*min)"): that initialiser
        // raises an Objective-C exception on a string it dislikes, and there is
        // no catching that from Swift.
        let vo2Unit = HKUnit.literUnit(with: .milli)
            .unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: HKUnit.minute()))
        let mmolPerLitre = HKUnit
            .moleUnit(with: .milli, molarMass: HKUnitMolarMassBloodGlucose)
            .unitDivided(by: HKUnit.liter())
        let milligram = HKUnit.gramUnit(with: .milli)
        let microgram = HKUnit.gramUnit(with: .micro)

        return [
            // Activity
            DailyQuantity(key: "steps", identifier: "StepCount", unit: .count(), rollup: .sum),
            DailyQuantity(key: "activeEnergyKcal", identifier: "ActiveEnergyBurned", unit: .kilocalorie(), rollup: .sum),
            DailyQuantity(key: "exerciseMinutes", identifier: "AppleExerciseTime", unit: .minute(), rollup: .sum, writable: false),
            DailyQuantity(key: "distanceWalkingRunningM", identifier: "DistanceWalkingRunning", unit: .meter(), rollup: .sum),
            DailyQuantity(key: "distanceCyclingM", identifier: "DistanceCycling", unit: .meter(), rollup: .sum),
            DailyQuantity(key: "distanceSwimmingM", identifier: "DistanceSwimming", unit: .meter(), rollup: .sum),
            DailyQuantity(key: "floorsClimbed", identifier: "FlightsClimbed", unit: .count(), rollup: .sum),
            DailyQuantity(key: "wheelchairPushes", identifier: "PushCount", unit: .count(), rollup: .sum),
            DailyQuantity(key: "vo2Max", identifier: "VO2Max", unit: vo2Unit, rollup: .latest),
            DailyQuantity(key: "cyclingCadenceRpm", identifier: "CyclingCadence", unit: perMinute, rollup: .average),
            DailyQuantity(key: "powerWatts", identifier: "CyclingPower", unit: .watt(), rollup: .average),
            DailyQuantity(key: "speedMps", identifier: "RunningSpeed", unit: HKUnit.meter().unitDivided(by: .second()), rollup: .average),

            // Vitals. Averaged, because a day carries several readings and none
            // of them is more true than the others.
            DailyQuantity(key: "restingHeartRateBpm", identifier: "RestingHeartRate", unit: perMinute, rollup: .average),
            DailyQuantity(key: "heartRateBpm", identifier: "HeartRate", unit: perMinute, rollup: .average),
            DailyQuantity(key: "hrvMs", identifier: "HeartRateVariabilitySDNN", unit: HKUnit.secondUnit(with: .milli), rollup: .average),
            DailyQuantity(key: "bloodGlucoseMmolL", identifier: "BloodGlucose", unit: mmolPerLitre, rollup: .average),
            // Apple keeps systolic and diastolic as two independent quantities
            // where Health Connect keeps one record with both numbers. Two rows
            // here, one read on the other side; the catalogue keys match.
            DailyQuantity(key: "bloodPressureSystolic", identifier: "BloodPressureSystolic", unit: .millimeterOfMercury(), rollup: .average),
            DailyQuantity(key: "bloodPressureDiastolic", identifier: "BloodPressureDiastolic", unit: .millimeterOfMercury(), rollup: .average),
            DailyQuantity(key: "oxygenSaturationPct", identifier: "OxygenSaturation", unit: .percent(), rollup: .average, scale: 100),
            DailyQuantity(key: "respiratoryRateBpm", identifier: "RespiratoryRate", unit: perMinute, rollup: .average),
            DailyQuantity(key: "bodyTemperatureC", identifier: "BodyTemperature", unit: .degreeCelsius(), rollup: .latest),
            DailyQuantity(key: "basalBodyTemperatureC", identifier: "BasalBodyTemperature", unit: .degreeCelsius(), rollup: .latest),
            DailyQuantity(key: "walkingHeartRateAvgBpm", identifier: "WalkingHeartRateAverage", unit: perMinute, rollup: .average),
            DailyQuantity(key: "heartRateRecoveryBpm", identifier: "HeartRateRecoveryOneMinute", unit: perMinute, rollup: .max),
            // iOS 16 and a Series 8 or later; on anything older the identifier
            // resolves to nil and the row drops out on its own, which is the
            // same path a declined permission takes.
            DailyQuantity(key: "wristTemperatureC", identifier: "AppleSleepingWristTemperature", unit: .degreeCelsius(), rollup: .latest, writable: false),

            // Body. Point measurements off a scale or a tape, so the day's last
            // reading wins: someone who weighs twice wants the second number,
            // not the mean of a shoe-on and a shoe-off attempt.
            DailyQuantity(key: "weightKg", identifier: "BodyMass", unit: HKUnit.gramUnit(with: .kilo), rollup: .latest),
            DailyQuantity(key: "bodyFatPct", identifier: "BodyFatPercentage", unit: .percent(), rollup: .latest, scale: 100),
            DailyQuantity(key: "leanBodyMassKg", identifier: "LeanBodyMass", unit: HKUnit.gramUnit(with: .kilo), rollup: .latest),
            DailyQuantity(key: "heightCm", identifier: "Height", unit: HKUnit.meterUnit(with: .centi), rollup: .latest),
            DailyQuantity(key: "waistCircumferenceCm", identifier: "WaistCircumference", unit: HKUnit.meterUnit(with: .centi), rollup: .latest),
            // A real stored type, so it is read rather than divided out of the
            // day's height and weight. A number nobody measured, appearing on a
            // day nobody stepped on a scale, reads as a measurement and is not.
            // HealthKit files it as dimensionless, hence `count()`.
            DailyQuantity(key: "bodyMassIndex", identifier: "BodyMassIndex", unit: .count(), rollup: .latest),
            // Summed rather than treated as a rate: HealthKit reports resting
            // energy as kilocalories accumulated across the day, not as the
            // per-day figure Health Connect hands back.
            DailyQuantity(key: "basalMetabolicRateKcal", identifier: "BasalEnergyBurned", unit: .kilocalorie(), rollup: .sum),

            // Nutrition, whatever another app wrote.
            DailyQuantity(key: "dietaryEnergyKcal", identifier: "DietaryEnergyConsumed", unit: .kilocalorie(), rollup: .sum),
            DailyQuantity(key: "dietaryProteinG", identifier: "DietaryProtein", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "dietaryCarbsG", identifier: "DietaryCarbohydrates", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "dietaryFatG", identifier: "DietaryFatTotal", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "hydrationMl", identifier: "DietaryWater", unit: HKUnit.literUnit(with: .milli), rollup: .sum),
            DailyQuantity(key: "caffeineMg", identifier: "DietaryCaffeine", unit: milligram, rollup: .sum),
            // One cumulative type per nutrient, where Health Connect has a
            // single record with a field each. Note the noun-first spelling of
            // the fat breakdown: `DietaryFatSaturated`, not `DietarySaturatedFat`
            // — the obvious guess resolves to nil and the metric never arrives,
            // silently, which is how the last three went missing for a release.
            DailyQuantity(key: "dietaryFiberG", identifier: "DietaryFiber", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "dietarySugarG", identifier: "DietarySugar", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "dietarySodiumMg", identifier: "DietarySodium", unit: milligram, rollup: .sum),
            DailyQuantity(key: "dietaryCholesterolMg", identifier: "DietaryCholesterol", unit: milligram, rollup: .sum),
            DailyQuantity(key: "dietarySaturatedFatG", identifier: "DietaryFatSaturated", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "dietaryMonounsaturatedFatG", identifier: "DietaryFatMonounsaturated", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "dietaryPolyunsaturatedFatG", identifier: "DietaryFatPolyunsaturated", unit: .gram(), rollup: .sum),
            DailyQuantity(key: "dietaryPotassiumMg", identifier: "DietaryPotassium", unit: milligram, rollup: .sum),
            DailyQuantity(key: "dietaryCalciumMg", identifier: "DietaryCalcium", unit: milligram, rollup: .sum),
            DailyQuantity(key: "dietaryIronMg", identifier: "DietaryIron", unit: milligram, rollup: .sum),
            DailyQuantity(key: "dietaryVitaminAMcg", identifier: "DietaryVitaminA", unit: microgram, rollup: .sum),
            DailyQuantity(key: "dietaryVitaminCMg", identifier: "DietaryVitaminC", unit: milligram, rollup: .sum),
            DailyQuantity(key: "dietaryVitaminDMcg", identifier: "DietaryVitaminD", unit: microgram, rollup: .sum)
        ]
    }

    /// What a day's category samples amount to.
    private enum DailyCategoryRollup {
        /// Minutes of recorded session, summed.
        case minutes
        /// The last sample's value, as a level.
        case level
        /// There is no level; the reading is that it happened at all.
        case occurred
        /// How many times it happened. Distinct from `.occurred`, which flattens
        /// a day to one — the catalogue asks for a count here, and collapsing it
        /// would quietly under-report anyone who logged twice.
        case count
    }

    private struct DailyCategory {
        let key: String
        let identifier: String
        let rollup: DailyCategoryRollup
        /// Maps HealthKit's enum onto the catalogue's range.
        var level: (Int) -> Double = { Double($0) }
    }

    private func dailyCategories() -> [DailyCategory] {
        [
            DailyCategory(key: "mindfulMinutes", identifier: "MindfulSession", rollup: .minutes),
            // HealthKit numbers flow from 1 (unspecified) to 4 (heavy) and puts
            // "none" above heavy; the catalogue's 0–3 follows Health Connect.
            // Passing the raw value through put every heavy day outside the
            // plausible range, where the server drops it silently.
            DailyCategory(key: "menstruationFlow", identifier: "MenstrualFlow", rollup: .level) { value in
                switch value {
                case 2: return 1
                case 3: return 2
                case 4: return 3
                default: return 0
                }
            },
            // Mucus and ovulation happen to agree with Health Connect's
            // numbering, so they go through as themselves.
            DailyCategory(key: "cervicalMucus", identifier: "CervicalMucusQuality", rollup: .level),
            DailyCategory(key: "ovulationTest", identifier: "OvulationTestResult", rollup: .level),
            DailyCategory(key: "intermenstrualBleeding", identifier: "IntermenstrualBleeding", rollup: .occurred),
            // The sample's value is only whether protection was used, which we
            // neither ask for nor store; the day's tally is the whole reading.
            DailyCategory(key: "sexualActivity", identifier: "SexualActivity", rollup: .count)
        ]
    }

    /**
     One category type, per local day.

     Category samples carry an enum rather than a quantity, so there is no
     statistics query to lean on — the samples are read in order and folded by
     hand, the same way `collectDailyLatest` does for quantities.
     */
    private func collectDailyCategory(
        type: HKCategoryType,
        rollup: DailyCategoryRollup,
        level: @escaping (Int) -> Double,
        start: Date,
        end: Date,
        calendar: Calendar,
        completion: @escaping ([String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        ) { [weak self] _, samples, _ in
            guard let self = self, let samples = samples as? [HKCategorySample] else {
                completion([:])
                return
            }

            var results: [String: Double] = [:]
            for sample in samples {
                let key = self.dayKey(sample.startDate, calendar: calendar)
                switch rollup {
                case .minutes:
                    let minutes = sample.endDate.timeIntervalSince(sample.startDate) / 60
                    results[key] = (results[key] ?? 0) + minutes
                case .level:
                    // Ascending order means a later sample overwrites an
                    // earlier one for the same day.
                    results[key] = level(sample.value)
                case .occurred:
                    results[key] = 1
                case .count:
                    results[key] = (results[key] ?? 0) + 1
                }
            }
            completion(results)
        }

        healthStore.execute(query)
    }

    /// Bucketed statistics for one quantity type, keyed by local day.
    private func collectDailyStatistics(
        type: HKQuantityType,
        unit: HKUnit,
        options: HKStatisticsOptions,
        start: Date,
        end: Date,
        calendar: Calendar,
        completion: @escaping ([String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: options,
            anchorDate: start,
            intervalComponents: DateComponents(day: 1)
        )

        query.initialResultsHandler = { [weak self] _, collection, _ in
            guard let self = self, let collection = collection else {
                completion([:])
                return
            }

            var results: [String: Double] = [:]
            collection.enumerateStatistics(from: start, to: end) { statistics, _ in
                let picked: HKQuantity?
                if options.contains(.cumulativeSum) {
                    picked = statistics.sumQuantity()
                } else if options.contains(.discreteMax) {
                    picked = statistics.maximumQuantity()
                } else {
                    picked = statistics.averageQuantity()
                }
                guard let quantity = picked else { return }
                let key = self.dayKey(statistics.startDate, calendar: calendar)
                results[key] = quantity.doubleValue(for: unit)
            }
            completion(results)
        }

        healthStore.execute(query)
    }

    /**
     The last reading of each local day for one quantity type.

     Deliberately not `HKStatisticsCollectionQuery` with `.discreteMostRecent`:
     that option only exists from iOS 12 in some SDK combinations and reports
     the most recent sample in the *whole* window on others. Sorting samples and
     keeping the last per day is boring and behaves identically everywhere.
     */
    private func collectDailyLatest(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date,
        end: Date,
        calendar: Calendar,
        completion: @escaping ([String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        ) { [weak self] _, samples, _ in
            guard let self = self, let samples = samples as? [HKQuantitySample] else {
                completion([:])
                return
            }
            // Ascending order means a later sample simply overwrites an
            // earlier one for the same day.
            var results: [String: Double] = [:]
            for sample in samples {
                let key = self.dayKey(sample.startDate, calendar: calendar)
                results[key] = sample.quantity.doubleValue(for: unit)
            }
            completion(results)
        }

        healthStore.execute(query)
    }

    private struct SleepStage {
        /// Catalogue key, verbatim from `platformHealthMetrics.ts`.
        let key: String
        /// The `HKCategoryValueSleepAnalysis` raw values this row is made of.
        let values: Set<Int>
    }

    /**
     The catalogue's five sleep rows, as sets of sleep-analysis values.

     Apple has no per-stage sample type: a night is a run of `sleepAnalysis`
     samples whose *value* says which stage it was, so the rows below are five
     readings of one series rather than five types. Before iOS 16 there were no
     stages at all, only `asleepUnspecified`, and the stage rows come back empty
     on those devices — which is the truth, not a failure.

     `inBed` is in none of them: time spent reading in bed is not recovery, and
     counting it flatters every baseline.
     */
    private func sleepStages() -> [SleepStage] {
        var asleep: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue]
        var deep: Set<Int> = []
        var rem: Set<Int> = []
        var light: Set<Int> = []
        if #available(iOS 16.0, *) {
            deep = [HKCategoryValueSleepAnalysis.asleepDeep.rawValue]
            rem = [HKCategoryValueSleepAnalysis.asleepREM.rawValue]
            // "Core" is Apple's name for what everyone else calls light sleep.
            light = [HKCategoryValueSleepAnalysis.asleepCore.rawValue]
            asleep.formUnion(deep)
            asleep.formUnion(rem)
            asleep.formUnion(light)
        }
        return [
            SleepStage(key: "sleepMinutes", values: asleep),
            SleepStage(key: "sleepDeepMinutes", values: deep),
            SleepStage(key: "sleepRemMinutes", values: rem),
            SleepStage(key: "sleepLightMinutes", values: light),
            SleepStage(key: "sleepAwakeMinutes", values: [HKCategoryValueSleepAnalysis.awake.rawValue])
        ]
    }

    /**
     Sleep minutes per local day, per stage, attributed to the wake-up day.

     Overlapping samples from several sources are merged rather than summed — a
     phone and a watch both recording the same night must not produce sixteen
     hours of sleep. The merge runs once per stage rather than once overall:
     merging across stages would fuse a deep block into the light block beside
     it, and the stage totals would no longer add up to anything.
     */
    private func collectDailySleepMinutes(
        start: Date,
        end: Date,
        calendar: Calendar,
        completion: @escaping ([String: [String: Double]]) -> Void
    ) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion([:])
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
        ) { [weak self] _, samples, _ in
            guard let self = self else {
                completion([:])
                return
            }

            let all = (samples as? [HKCategorySample] ?? [])
                .sorted { $0.startDate < $1.startDate }

            var staged: [String: [String: Double]] = [:]
            for stage in self.sleepStages() where !stage.values.isEmpty {
                // Merge overlaps first, then attribute. Two devices recording
                // the same night are one night's sleep.
                var merged: [(start: Date, end: Date)] = []
                for sample in all where stage.values.contains(sample.value) {
                    if let last = merged.last, sample.startDate <= last.end {
                        merged[merged.count - 1].end = max(last.end, sample.endDate)
                    } else {
                        merged.append((sample.startDate, sample.endDate))
                    }
                }

                var results: [String: Double] = [:]
                for interval in merged {
                    let key = self.dayKey(interval.end, calendar: calendar)
                    let minutes = interval.end.timeIntervalSince(interval.start) / 60
                    results[key] = (results[key] ?? 0) + minutes
                }
                if !results.isEmpty {
                    staged[stage.key] = results
                }
            }
            completion(staged)
        }

        healthStore.execute(query)
    }

    /// `YYYY-MM-DD` in the device's own calendar.
    private func dayKey(_ date: Date, calendar: Calendar) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /**
     Writes a finished OneRep strength session into HealthKit.

     Opt-in: `src/lib/health-provider.ts` only calls this when the user has
     enabled it in Settings. Resolves `saved: false` rather than rejecting when
     write authorization is missing — a declined health write must never fail a
     workout save.
     */
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["saved": false])
            return
        }

        guard
            let startedAt = call.getDouble("startedAt"),
            let endedAt = call.getDouble("endedAt")
        else {
            call.reject("startedAt and endedAt are required")
            return
        }

        let workoutType = HKObjectType.workoutType()
        guard healthStore.authorizationStatus(for: workoutType) == .sharingAuthorized else {
            call.resolve(["saved": false])
            return
        }

        let start = Date(timeIntervalSince1970: startedAt / 1000)
        let end = Date(timeIntervalSince1970: endedAt / 1000)
        guard end > start else {
            call.resolve(["saved": false])
            return
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor

        let builder = HKWorkoutBuilder(
            healthStore: healthStore,
            configuration: configuration,
            device: .local()
        )

        builder.beginCollection(withStart: start) { started, error in
            guard started else {
                DispatchQueue.main.async {
                    call.reject(
                        error?.localizedDescription ?? "Unable to record the workout",
                        nil,
                        error
                    )
                }
                return
            }

            builder.endCollection(withEnd: end) { ended, endError in
                guard ended else {
                    DispatchQueue.main.async {
                        call.reject(
                            endError?.localizedDescription ?? "Unable to record the workout",
                            nil,
                            endError
                        )
                    }
                    return
                }

                builder.finishWorkout { workout, finishError in
                    DispatchQueue.main.async {
                        if let finishError = finishError {
                            call.reject(finishError.localizedDescription, nil, finishError)
                            return
                        }
                        call.resolve(["saved": workout != nil])
                    }
                }
            }
        }
    }

    private func healthShareTypes() -> Set<HKSampleType> {
        // Workouts, plus every quantity a user can correct in the app. The
        // write-back is per-edit and opt-in, so most of these will never be
        // used by most people; HealthKit still wants them declared up front,
        // and asking for a second sheet later is the thing that looks shady.
        //
        // Only the ones HealthKit will actually take: one read-only type in a
        // share request fails the request outright, taking every other
        // permission down with it.
        var types: Set<HKSampleType> = [HKObjectType.workoutType()]
        dailyQuantities().filter(\.writable).forEach { quantity in
            if let type = quantityType(quantity.identifier) {
                types.insert(type)
            }
        }
        return types
    }

    /**
     Writes a corrected reading back into HealthKit.

     Called after the edit has already been saved in OneRep, so every failure
     path resolves `saved: false` instead of rejecting — a health store that
     says no must not undo a number the user just fixed.

     Worth being honest about: HealthKit will not let an app delete or amend a
     sample another app wrote. This adds our reading alongside the original, so
     the Health app will show two entries for that day, ours and the scale's. We
     cannot overwrite, and pretending otherwise in the UI would be a lie.
     */
    @objc func saveDailyMetric(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["saved": false])
            return
        }

        guard let metric = call.getString("metric"),
              let value = call.getDouble("value"),
              let date = call.getString("date"),
              // Only quantities, and only the ones Apple lets an app write.
              // Category metrics — sleep and its stages, menstrual flow,
              // cervical mucus, ovulation tests, sexual activity — carry an
              // enum and a span, not a number, so "the user typed 2" does not
              // describe a sample that could be written. They fall through to
              // `saved: false` rather than guessing at a value.
              let quantity = dailyQuantities().first(where: { $0.key == metric && $0.writable }),
              let type = quantityType(quantity.identifier) else {
            call.resolve(["saved": false])
            return
        }

        guard healthStore.authorizationStatus(for: type) == .sharingAuthorized else {
            call.resolve(["saved": false])
            return
        }

        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        guard let dayStart = formatter.date(from: date) else {
            call.resolve(["saved": false])
            return
        }

        // Nothing may be written in the future, so today's edits stop at now.
        let now = Date()
        let dayEnd = min(calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart, now)
        // Point measurements land at midday rather than midnight: a sample at
        // 00:00 sits on the boundary, and any reader rounding the other way
        // files it under the previous day.
        let midday = min(calendar.date(byAdding: .hour, value: 12, to: dayStart) ?? dayStart, now)

        let start: Date
        let finish: Date
        switch quantity.rollup {
        case .sum:
            start = dayStart
            finish = max(dayEnd, dayStart)
        case .average, .latest, .max:
            start = midday
            finish = midday
        }

        // The table stores whole percent for the app's sake; HealthKit wants
        // the fraction back.
        let sample = HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: quantity.unit, doubleValue: value / quantity.scale),
            start: start,
            end: finish
        )

        healthStore.save(sample) { success, _ in
            DispatchQueue.main.async {
                call.resolve(["saved": success])
            }
        }
    }

    private func healthReadTypes() -> Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]

        // Everything the daily tables can read, asked for in one go. HealthKit
        // will not say which of these the user granted — `requestAuthorization`
        // succeeding means the sheet was shown, not that anything was ticked —
        // so the read side treats an empty result and a refusal identically.
        dailyQuantities().forEach { quantity in
            if let type = quantityType(quantity.identifier) {
                types.insert(type)
            }
        }
        dailyCategories().forEach { category in
            if let type = categoryType(category.identifier) {
                types.insert(type)
            }
        }

        // Read for workout serialisation rather than for the daily rollup.
        [
            HKQuantityTypeIdentifier.distanceWalkingRunning,
            HKQuantityTypeIdentifier.distanceCycling,
            HKQuantityTypeIdentifier.distanceSwimming,
            HKQuantityTypeIdentifier.heartRate,
            HKQuantityTypeIdentifier.activeEnergyBurned
        ].forEach { identifier in
            if let type = HKObjectType.quantityType(forIdentifier: identifier) {
                types.insert(type)
            }
        }

        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }

        types.insert(HKSeriesType.workoutRoute())
        return types
    }

    private func serializeWorkouts(
        _ workouts: [HKWorkout],
        completion: @escaping ([[String: Any]]) -> Void
    ) {
        guard !workouts.isEmpty else {
            DispatchQueue.main.async {
                completion([])
            }
            return
        }

        let group = DispatchGroup()
        var serialized = Array(repeating: [String: Any](), count: workouts.count)

        for (index, workout) in workouts.enumerated() {
            group.enter()
            serializeWorkout(workout) { item in
                serialized[index] = item
                group.leave()
            }
        }

        group.notify(queue: .main) {
            completion(serialized.filter { !$0.isEmpty })
        }
    }

    private func serializeWorkout(
        _ workout: HKWorkout,
        completion: @escaping ([String: Any]) -> Void
    ) {
        let activityName = workoutActivityName(workout.workoutActivityType)
        var item: [String: Any] = [
            "uuid": workout.uuid.uuidString,
            "activityType": workoutActivityIdentifier(workout.workoutActivityType),
            "activityName": activityName,
            "startedAt": isoFormatter.string(from: workout.startDate),
            "endedAt": isoFormatter.string(from: workout.endDate),
            "durationSeconds": Int(workout.duration.rounded()),
            "sourceName": workout.sourceRevision.source.name,
            "sourceBundleId": workout.sourceRevision.source.bundleIdentifier
        ]

        if let distanceMeters = workout.totalDistance?.doubleValue(for: HKUnit.meter()), distanceMeters > 0 {
            item["totalDistanceMeters"] = distanceMeters
        }

        if let calories = workout.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie()), calories > 0 {
            item["activeEnergyKcal"] = calories
        }

        let group = DispatchGroup()

        group.enter()
        fetchHeartRateStats(for: workout) { average, maximum in
            if let average = average {
                item["avgHeartRateBpm"] = average
            }
            if let maximum = maximum {
                item["maxHeartRateBpm"] = maximum
            }
            group.leave()
        }

        group.enter()
        fetchRouteStatus(for: workout) { hasRoute in
            item["hasRoute"] = hasRoute
            if hasRoute {
                item["routeName"] = "Apple Health \(activityName) route"
            }
            group.leave()
        }

        group.notify(queue: .main) {
            completion(item)
        }
    }

    private func fetchHeartRateStats(
        for workout: HKWorkout,
        completion: @escaping (Double?, Double?) -> Void
    ) {
        guard let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            DispatchQueue.main.async {
                completion(nil, nil)
            }
            return
        }

        let predicate = HKQuery.predicateForObjects(from: workout)
        let query = HKStatisticsQuery(
            quantityType: heartRateType,
            quantitySamplePredicate: predicate,
            options: [.discreteAverage, .discreteMax]
        ) { _, statistics, _ in
            let unit = HKUnit.count().unitDivided(by: HKUnit.minute())
            let average = statistics?.averageQuantity()?.doubleValue(for: unit)
            let maximum = statistics?.maximumQuantity()?.doubleValue(for: unit)
            DispatchQueue.main.async {
                completion(average, maximum)
            }
        }

        healthStore.execute(query)
    }

    private func fetchRouteStatus(for workout: HKWorkout, completion: @escaping (Bool) -> Void) {
        let routeType = HKSeriesType.workoutRoute()
        let predicate = HKQuery.predicateForObjects(from: workout)
        let query = HKSampleQuery(
            sampleType: routeType,
            predicate: predicate,
            limit: 1,
            sortDescriptors: nil
        ) { _, samples, _ in
            DispatchQueue.main.async {
                completion(!(samples?.isEmpty ?? true))
            }
        }

        healthStore.execute(query)
    }

    private func isCardioWorkout(_ type: HKWorkoutActivityType) -> Bool {
        switch type {
        case .cycling,
             .elliptical,
             .handCycling,
             .hiking,
             .highIntensityIntervalTraining,
             .mixedCardio,
             .mixedMetabolicCardioTraining,
             .paddleSports,
             .rowing,
             .running,
             .skatingSports,
             .snowSports,
             .stairClimbing,
             .stairs,
             .stepTraining,
             .surfingSports,
             .swimming,
             .walking,
             .waterFitness,
             .waterSports,
             .wheelchairRunPace,
             .wheelchairWalkPace:
            return true
        default:
            return false
        }
    }

    private func workoutActivityIdentifier(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .cycling:
            return "cycling"
        case .elliptical:
            return "elliptical"
        case .handCycling:
            return "hand_cycling"
        case .hiking:
            return "hiking"
        case .highIntensityIntervalTraining:
            return "hiit"
        case .mixedCardio, .mixedMetabolicCardioTraining:
            return "mixed_cardio"
        case .paddleSports:
            return "paddle_sports"
        case .rowing:
            return "rowing"
        case .running:
            return "running"
        case .skatingSports:
            return "skating"
        case .snowSports:
            return "snow_sports"
        case .stairClimbing, .stairs, .stepTraining:
            return "stairs"
        case .surfingSports:
            return "surfing"
        case .swimming:
            return "swimming"
        case .walking:
            return "walking"
        case .waterFitness, .waterSports:
            return "water_sports"
        case .wheelchairRunPace:
            return "wheelchair_run"
        case .wheelchairWalkPace:
            return "wheelchair_walk"
        default:
            return "cardio"
        }
    }

    private func workoutActivityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .cycling:
            return "Cycling"
        case .elliptical:
            return "Elliptical"
        case .handCycling:
            return "Hand Cycling"
        case .hiking:
            return "Hiking"
        case .highIntensityIntervalTraining:
            return "HIIT"
        case .mixedCardio, .mixedMetabolicCardioTraining:
            return "Mixed Cardio"
        case .paddleSports:
            return "Paddle Sports"
        case .rowing:
            return "Rowing"
        case .running:
            return "Running"
        case .skatingSports:
            return "Skating"
        case .snowSports:
            return "Snow Sports"
        case .stairClimbing, .stairs, .stepTraining:
            return "Stairs"
        case .surfingSports:
            return "Surfing"
        case .swimming:
            return "Swimming"
        case .walking:
            return "Walking"
        case .waterFitness:
            return "Water Fitness"
        case .waterSports:
            return "Water Sports"
        case .wheelchairRunPace:
            return "Wheelchair Run"
        case .wheelchairWalkPace:
            return "Wheelchair Walk"
        default:
            return "Cardio"
        }
    }

    private func authorizationStatusName(_ status: HKAuthorizationStatus) -> String {
        switch status {
        case .notDetermined:
            return "not_determined"
        case .sharingDenied:
            return "denied"
        case .sharingAuthorized:
            return "authorized"
        @unknown default:
            return "unknown"
        }
    }
}

@available(iOS 16.1, *)
struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var exerciseName: String
        var setLabel: String
        var completedSets: Int
        var totalSets: Int
        var isResting: Bool
        var restEndAt: Date?
        var slot: Int
    }

    var startedAt: Date
}

@objc(WorkoutLiveActivityPlugin)
public class WorkoutLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutLiveActivityPlugin"
    public let jsName = "WorkoutLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateWidgets", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["supported": false])
            return
        }
        let state = contentState(call)
        Task {
            do {
                for activity in Activity<WorkoutActivityAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                let activity = try Activity.request(
                    attributes: WorkoutActivityAttributes(startedAt: Date()),
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
                call.resolve(["supported": true, "id": activity.id])
            } catch {
                call.reject("Unable to start workout Live Activity", nil, error)
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(); return }
        let state = contentState(call)
        Task {
            for activity in Activity<WorkoutActivityAttributes>.activities {
                await activity.update(ActivityContent(state: state, staleDate: nil))
            }
            call.resolve()
        }
    }

    @objc func updateWidgets(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: "group.com.ananthh.onerep") else {
            call.reject("Shared widget storage is unavailable")
            return
        }
        for key in ["calories", "calorieGoal", "protein", "proteinGoal", "carbs", "carbsGoal", "fat", "fatGoal", "caloriesLeft"] {
            if let value = call.getInt(key) { defaults.set(value, forKey: key) }
        }
        for key in ["foodsLogged", "workoutExercises", "workoutBrief"] {
            if let value = call.getString(key) { defaults.set(value, forKey: key) }
        }
        let updatedAt = Date().timeIntervalSince1970
        if call.getInt("calorieGoal") != nil {
            defaults.set(updatedAt, forKey: "nutritionWidgetUpdatedAt")
        }
        if call.getString("workoutExercises") != nil {
            defaults.set(updatedAt, forKey: "workoutWidgetUpdatedAt")
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(); return }
        let state = contentState(call)
        Task {
            for activity in Activity<WorkoutActivityAttributes>.activities {
                await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .default)
            }
            call.resolve()
        }
    }

    @available(iOS 16.1, *)
    private func contentState(_ call: CAPPluginCall) -> WorkoutActivityAttributes.ContentState {
        WorkoutActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "Workout",
            setLabel: call.getString("setLabel") ?? "In progress",
            completedSets: call.getInt("completedSets") ?? 0,
            totalSets: call.getInt("totalSets") ?? 0,
            isResting: call.getBool("isResting") ?? false,
            restEndAt: call.getDouble("restEndAt").map { Date(timeIntervalSince1970: $0 / 1000) },
            slot: call.getInt("slot") ?? 1
        )
    }
}
