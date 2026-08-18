import HealthKit
import SwiftUI
import WatchKit

/// Start, pause, end. Everything on this screen is either a number you glance
/// at mid-set or a control you hit without looking, which is why the metrics
/// are large and monospaced and the buttons are full-width.
struct WorkoutView: View {
    @ObservedObject var store: WatchConnectivityStore
    @StateObject private var manager = WorkoutSessionManager()
    @State private var confirmingEnd = false

    var body: some View {
        Group {
            if !manager.isAvailable {
                Text("Health data isn't available on this watch.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            } else if manager.isRunning {
                running
            } else {
                idle
            }
        }
        .navigationTitle("Workout")
        .onAppear {
            manager.onFinish = { summary in store.logWorkout(summary) }
        }
    }

    private var idle: some View {
        VStack(spacing: 12) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 30))
                .foregroundStyle(.secondary)
            if !store.snapshot.workoutBrief.isEmpty {
                Text(store.snapshot.workoutBrief)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button {
                WKInterfaceDevice.current().play(.start)
                Task {
                    _ = await manager.requestAuthorization()
                    manager.start()
                }
            } label: {
                Text("Start")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 4)
    }

    private var running: some View {
        VStack(spacing: 10) {
            Text(formatted(manager.elapsed))
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(manager.isPaused ? .secondary : .primary)

            HStack(spacing: 14) {
                Metric(
                    value: manager.heartRate == 0 ? "--" : "\(manager.heartRate)",
                    unit: "BPM", symbol: "heart.fill", tint: .red
                )
                Metric(
                    value: "\(manager.activeCalories)", unit: "KCAL",
                    symbol: "flame.fill", tint: .orange
                )
            }

            HStack(spacing: 8) {
                Button {
                    WKInterfaceDevice.current().play(.click)
                    manager.togglePause()
                } label: {
                    Image(systemName: manager.isPaused ? "play.fill" : "pause.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    WKInterfaceDevice.current().play(.stop)
                    confirmingEnd = true
                } label: {
                    Image(systemName: "stop.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }
        }
        // Ending mid-set by a stray tap loses the whole session, so it asks.
        .confirmationDialog(
            "End workout?", isPresented: $confirmingEnd, titleVisibility: .visible
        ) {
            Button("End", role: .destructive) { manager.end() }
            Button("Keep going", role: .cancel) {}
        }
    }

    private struct Metric: View {
        let value: String
        let unit: String
        let symbol: String
        let tint: Color

        var body: some View {
            VStack(spacing: 1) {
                Image(systemName: symbol)
                    .font(.system(size: 11))
                    .foregroundStyle(tint)
                Text(value)
                    .font(.system(size: 19, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                Text(unit)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func formatted(_ interval: TimeInterval) -> String {
        let total = Int(interval)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%d:%02d", minutes, seconds)
    }
}
