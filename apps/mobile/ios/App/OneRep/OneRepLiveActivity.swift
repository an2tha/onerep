import ActivityKit
import WidgetKit
import SwiftUI

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

private extension WorkoutActivityAttributes.ContentState {
    var workoutURL: URL { URL(string: "onerep://workout?slot=\(slot)")! }
    var completeURL: URL { URL(string: "onerep://workout?slot=\(slot)&liveAction=complete")! }
    var skipURL: URL { URL(string: "onerep://workout?slot=\(slot)&liveAction=skipRest")! }
}

private struct ActivityTimer: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>
    var body: some View {
        if context.state.isResting, let end = context.state.restEndAt {
            Text(timerInterval: Date.now...end, countsDown: true)
                .foregroundStyle(.orange)
        } else {
            Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
        }
    }
}

struct OneRepLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: context.state.isResting ? "timer" : "figure.strengthtraining.traditional")
                        .font(.title2.weight(.semibold))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(context.state.isResting ? "Rest" : context.state.exerciseName)
                            .font(.headline).lineLimit(1)
                        Text(context.state.isResting ? context.state.exerciseName : context.state.setLabel)
                            .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        ActivityTimer(context: context).font(.headline.monospacedDigit())
                        Text("\(context.state.completedSets)/\(context.state.totalSets)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                HStack(spacing: 10) {
                    Link(destination: context.state.completeURL) {
                        Label("Complete set", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(.white).foregroundStyle(.black)
                    if context.state.isResting {
                        Link(destination: context.state.skipURL) {
                            Label("Skip rest", systemImage: "forward.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .font(.caption.weight(.semibold))
            }
            .padding()
            .activityBackgroundTint(Color.black)
            .activitySystemActionForegroundColor(Color.white)
            .widgetURL(context.state.workoutURL)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.isResting ? "timer" : "figure.strengthtraining.traditional").font(.title3)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ActivityTimer(context: context).font(.body.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 10) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(context.state.isResting ? "Rest" : context.state.exerciseName).font(.headline).lineLimit(1)
                                Text(context.state.isResting ? context.state.exerciseName : context.state.setLabel).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(context.state.completedSets)/\(context.state.totalSets)").font(.headline.monospacedDigit())
                        }
                        HStack {
                            Link("Complete", destination: context.state.completeURL)
                                .buttonStyle(.borderedProminent).tint(.white).foregroundStyle(.black)
                            if context.state.isResting {
                                Link("Skip rest", destination: context.state.skipURL).buttonStyle(.bordered)
                            }
                        }
                        .font(.caption.weight(.semibold))
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.isResting ? "timer" : "figure.strengthtraining.traditional")
            } compactTrailing: {
                if context.state.isResting, let end = context.state.restEndAt {
                    Text(timerInterval: Date.now...end, countsDown: true).font(.caption2.monospacedDigit()).foregroundStyle(.orange)
                } else {
                    Text("\(context.state.completedSets)/\(context.state.totalSets)").font(.caption2.monospacedDigit())
                }
            } minimal: {
                Image(systemName: context.state.isResting ? "timer" : "dumbbell.fill")
            }
            .widgetURL(context.state.workoutURL)
            .keylineTint(context.state.isResting ? .orange : .white)
        }
    }
}
