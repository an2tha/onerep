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
    @Published private(set) var activeCalories = 0
    @Published private(set) var elapsed: TimeInterval = 0

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var ticker: Timer?

    /// Called with a summary when a workout ends, so the view can hand it to
    /// the phone. The manager itself knows nothing about WatchConnectivity.
    var onFinish: (([String: Any]) -> Void)?

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

    func start(activity: HKWorkoutActivityType = .traditionalStrengthTraining) {
        guard isAvailable, session == nil else { return }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activity
        configuration.locationType = .indoor

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

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { _, _ in }

            self.session = session
            self.builder = builder
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
                        "averageHeartRate": self.heartRate,
                        "endedAt": finish.timeIntervalSince1970,
                    ])
                    self.reset()
                }
            }
        }
    }

    private func reset() {
        session = nil
        builder = nil
        isRunning = false
        isPaused = false
        elapsed = 0
        heartRate = 0
        activeCalories = 0
    }

    /// Only drives the display. The value shown comes from the builder, which
    /// is the thing that actually knows about paused intervals.
    private func startTicking() {
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) {
            [weak self] _ in
            Task { @MainActor in
                guard let self, let builder = self.builder else { return }
                self.elapsed = builder.elapsedTime
            }
        }
    }

    private func stopTicking() {
        ticker?.invalidate()
        ticker = nil
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
                Task { @MainActor in self.heartRate = Int(value ?? 0) }
            } else if quantityType == HKQuantityType(.activeEnergyBurned) {
                let value = statistics.sumQuantity()?.doubleValue(for: .kilocalorie())
                Task { @MainActor in self.activeCalories = Int(value ?? 0) }
            }
        }
    }
}
