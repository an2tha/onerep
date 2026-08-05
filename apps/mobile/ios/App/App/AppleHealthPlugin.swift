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
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise)
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
        // Workouts only. The app has no business writing anything else, and a
        // wider share set is an App Review question we do not need to answer.
        [HKObjectType.workoutType()]
    }

    private func healthReadTypes() -> Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]

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
