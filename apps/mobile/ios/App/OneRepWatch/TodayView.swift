import SwiftUI
import WatchKit

/// The calorie ring, sized for a glance rather than a read.
private struct CalorieRing: View {
    let snapshot: TodaySnapshot

    private var fraction: Double {
        snapshot.fraction(snapshot.calories, of: snapshot.calorieGoal)
    }
    private var over: Bool {
        snapshot.calorieGoal > 0 && snapshot.calories > snapshot.calorieGoal
    }

    var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.16), lineWidth: 10)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(
                    over ? Color.red : Color.accentColor,
                    style: StrokeStyle(lineWidth: 10, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.45), value: fraction)
            VStack(spacing: 0) {
                Text("\(abs(snapshot.caloriesLeft))")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(snapshot.caloriesLeft < 0 ? "over" : "left")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 110, height: 110)
    }
}

private struct MacroBar: View {
    let label: String
    let value: Int
    let goal: Int
    let tint: Color
    let snapshot: TodaySnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(value)/\(goal)g")
                    .font(.system(size: 11, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.16))
                    Capsule()
                        .fill(tint)
                        .frame(
                            width: proxy.size.width
                                * snapshot.fraction(value, of: goal)
                        )
                }
            }
            .frame(height: 4)
        }
    }
}

/// Today, mirrored from the phone: what is left to eat, what is left to drink,
/// and how long the streak is. Everything here is read-only except the water
/// button, because logging food needs a keyboard nobody wants on a wrist.
struct TodayView: View {
    @ObservedObject var store: WatchConnectivityStore

    private var snapshot: TodaySnapshot { store.snapshot }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if snapshot.hasData {
                    CalorieRing(snapshot: snapshot)

                    VStack(spacing: 8) {
                        MacroBar(
                            label: "P", value: snapshot.protein,
                            goal: snapshot.proteinGoal, tint: .green,
                            snapshot: snapshot
                        )
                        MacroBar(
                            label: "C", value: snapshot.carbs,
                            goal: snapshot.carbsGoal, tint: .orange,
                            snapshot: snapshot
                        )
                        MacroBar(
                            label: "F", value: snapshot.fat,
                            goal: snapshot.fatGoal, tint: .purple,
                            snapshot: snapshot
                        )
                    }

                    WaterRow(store: store)

                    if snapshot.streakDays > 0 {
                        Label(
                            "\(snapshot.streakDays) day streak",
                            systemImage: "flame.fill"
                        )
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.orange)
                    }

                    if !snapshot.workoutBrief.isEmpty {
                        Text(snapshot.workoutBrief)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                } else {
                    WaitingForPhone()
                }
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 8)
        }
        .navigationTitle("Today")
    }
}

private struct WaterRow: View {
    @ObservedObject var store: WatchConnectivityStore

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Label("Water", systemImage: "drop.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.cyan)
                Spacer()
                Text(format(store.snapshot.waterMl))
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Button {
                WKInterfaceDevice.current().play(.click)
                store.logWater(ml: 250)
            } label: {
                Label("Add 250 ml", systemImage: "plus")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(.cyan)
        }
    }

    private func format(_ ml: Int) -> String {
        let goal = store.snapshot.waterGoalMl
        guard goal > 0 else { return "\(ml) ml" }
        return "\(ml) / \(goal) ml"
    }
}

private struct WaitingForPhone: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.radiowaves.left.and.right")
                .font(.system(size: 26))
                .foregroundStyle(.secondary)
            Text("Open OneRep on your iPhone to sync today.")
                .font(.system(size: 13))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 20)
    }
}
