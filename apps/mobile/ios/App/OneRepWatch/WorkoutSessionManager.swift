import Foundation
import HealthKit

/// Runs a real `HKWorkoutSession` on the watch.
///
/// This is the part a phone genuinely cannot do: the session keeps the app
/// running while the wrist is down, raises the heart-rate sampling rate, and
/// hands the finished workout to Health as a first-class record. Without it,
/// "start a workout" on a watch is a stopwatch with extra steps.
///
/// The session is the source of truth for elapsed time. Tracking it with a
/// `Timer` instead drifts and, worse, lies across a pause — `HKLiveWorkoutBuilder`
/// already accounts for paused intervals, so the UI reads its clock rather than
/// keeping a second one.
@MainActor
final class WorkoutSessionManager: NSObject, ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var isPaused = false
    @Published private(set) var heartRate = 0
    @Published private(set) var averageHeartRate = 0
    @Published private(set) var maxHeartRate = 0
    @Published private(set) var activeCalories = 0
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var externalSessionId: String?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var ticker: Timer?
    private var lastMetricsSentAt = Date.distantPast
    private var heartRateSamples: [[String: Any]] = []

    /// Called with a summary when a workout ends, so the view can hand it to
    /// the phone. The manager itself knows nothing about WatchConnectivity.
    var onFinish: (([String: Any]) -> Void)?
    var onMetrics: (([String: Any]) -> Void)?

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        let share: Set = [HKQuantityType.workoutType()]
        let read: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKObjectType.workoutType(),
        ]
        do {
            try await store.requestAuthorization(toShare: share, read: read)
            return true
        } catch {
            return false
        }
    }

    func start(
        activity: HKWorkoutActivityType = .traditionalStrengthTraining,
        location: HKWorkoutSessionLocationType = .indoor,
        externalSessionId: String? = nil
    ) {
        guard isAvailable, session == nil else { return }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activity
        configuration.locationType = location

        do {
            let session = try HKWorkoutSession(
                healthStore: store, configuration: configuration
            )
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(
                healthStore: store, workoutConfiguration: configuration
            )
            session.delegate = self
            builder.delegate = self
            if let externalSessionId {
                builder.addMetadata(
                    [HKMetadataKeyExternalUUID: externalSessionId],
                    completion: { _, _ in }
                )
            }

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { _, _ in }

            self.session = session
            self.builder = builder
            self.externalSessionId = externalSessionId
            isRunning = true
            isPaused = false
            startTicking()
        } catch {
            // Nothing to recover: without a session there is no workout, and
            // the view keeps showing its start button.
            session = nil
            builder = nil
        }
    }

    func togglePause() {
        guard let session else { return }
        if isPaused {
            session.resume()
        } else {
            session.pause()
        }
    }

    func end() {
        guard let session, let builder else { return }
        stopTicking()
        session.end()
        let finish = Date()
        builder.endCollection(withEnd: finish) { [weak self] _, _ in
            builder.finishWorkout { [weak self] workout, _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.onFinish?([
                        "durationSeconds": Int(workout?.duration ?? self.elapsed),
                        "activeCalories": self.activeCalories,
                        "averageHeartRate": self.averageHeartRate,
                        "maxHeartRate": self.maxHeartRate,
                        "sessionId": self.externalSessionId ?? "",
                        "healthWorkoutId": workout?.uuid.uuidString ?? "",
                        "heartRateSamples": self.heartRateSamples,
                        "endedAt": finish.timeIntervalSince1970,
                    ])
                    self.reset()
                }
            }
        }
    }

    /// Abort collection without creating a Health workout or sending a finish event.
    func discard() {
        stopTicking()
        session?.end()
        builder?.discardWorkout()
        reset()
    }

    private func reset() {
        session = nil
        builder = nil
        isRunning = false
        isPaused = false
        elapsed = 0
        heartRate = 0
        averageHeartRate = 0
        maxHeartRate = 0
        activeCalories = 0
        externalSessionId = nil
        lastMetricsSentAt = .distantPast
        heartRateSamples = []
    }

    /// Only drives the display. The value shown comes from the builder, which
    /// is the thing that actually knows about paused intervals.
    private func startTicking() {
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) {
            [weak self] _ in
            Task { @MainActor in
                guard let self, let builder = self.builder else { return }
                self.elapsed = builder.elapsedTime
                self.publishMetricsIfNeeded()
            }
        }
    }

    private func stopTicking() {
        ticker?.invalidate()
        ticker = nil
    }

    private func publishMetricsIfNeeded(force: Bool = false) {
        guard let externalSessionId else { return }
        let now = Date()
        guard force || now.timeIntervalSince(lastMetricsSentAt) >= 4 else { return }
        lastMetricsSentAt = now
        onMetrics?([
            "sessionId": externalSessionId,
            "heartRateBpm": heartRate,
            "averageHeartRateBpm": averageHeartRate,
            "maxHeartRateBpm": maxHeartRate,
            "activeCalories": activeCalories,
            "elapsedSeconds": Int(elapsed),
            "timestamp": now.timeIntervalSince1970 * 1000,
        ])
    }
}

extension WorkoutSessionManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor in
            guard self.session === workoutSession else { return }
            isPaused = toState == .paused
            isRunning = toState == .running || toState == .paused
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor in
            stopTicking()
            reset()
        }
    }
}

extension WorkoutSessionManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ builder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ builder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        for type in collectedTypes {
            guard
                let quantityType = type as? HKQuantityType,
                let statistics = builder.statistics(for: quantityType)
            else { continue }

            if quantityType == HKQuantityType(.heartRate) {
                let unit = HKUnit.count().unitDivided(by: .minute())
                let value = statistics.mostRecentQuantity()?.doubleValue(for: unit)
                let average = statistics.averageQuantity()?.doubleValue(for: unit)
                let maximum = statistics.maximumQuantity()?.doubleValue(for: unit)
                Task { @MainActor in
                    guard self.builder === builder else { return }
                    self.heartRate = Int(value ?? 0)
                    self.averageHeartRate = Int(average ?? 0)
                    self.maxHeartRate = Int(maximum ?? 0)
                        if let value, value >= 30, value <= 240 {
                            let elapsed = Int(builder.elapsedTime.rounded())
                            let lastElapsed = self.heartRateSamples.last?["elapsedSeconds"] as? Int
                            if lastElapsed.map({ elapsed > $0 }) ?? true {
                            self.heartRateSamples.append([
                                "elapsedSeconds": elapsed,
                                "bpm": Int(value.rounded()),
                            ])
                            if self.heartRateSamples.count > 900 {
                                self.heartRateSamples.removeFirst(
                                    self.heartRateSamples.count - 900
                                )
                            }
                        }
                    }
                    self.publishMetricsIfNeeded()
                }
            } else if quantityType == HKQuantityType(.activeEnergyBurned) {
                let value = statistics.sumQuantity()?.doubleValue(for: .kilocalorie())
                Task { @MainActor in self.activeCalories = Int(value ?? 0) }
            }
        }
    }
}
