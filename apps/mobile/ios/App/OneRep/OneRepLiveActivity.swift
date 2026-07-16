import ActivityKit
import WidgetKit
import SwiftUI

struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var exerciseName: String
        var setLabel: String
        var completedSets: Int
        var totalSets: Int
    }

    var startedAt: Date
}

struct OneRepLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            HStack(spacing: 14) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2.weight(.semibold))
                VStack(alignment: .leading, spacing: 3) {
                    Text(context.state.exerciseName)
                        .font(.headline)
                        .lineLimit(1)
                    Text(context.state.setLabel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                        .font(.headline.monospacedDigit())
                    Text("\(context.state.completedSets)/\(context.state.totalSets) sets")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .activityBackgroundTint(Color.black)
            .activitySystemActionForegroundColor(Color.white)
            .widgetURL(URL(string: "onerep://workout"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.title3)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.attributes.startedAt...Date.distantFuture, countsDown: false)
                        .font(.body.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(context.state.exerciseName).font(.headline).lineLimit(1)
                            Text(context.state.setLabel).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(context.state.completedSets)/\(context.state.totalSets)")
                            .font(.headline.monospacedDigit())
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.strengthtraining.traditional")
            } compactTrailing: {
                Text("\(context.state.completedSets)/\(context.state.totalSets)")
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image(systemName: "dumbbell.fill")
            }
            .widgetURL(URL(string: "onerep://workout"))
            .keylineTint(.white)
        }
    }
}
