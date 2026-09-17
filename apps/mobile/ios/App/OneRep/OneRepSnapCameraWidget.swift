import SwiftUI
import WidgetKit

private struct SnapCameraEntry: TimelineEntry {
    let date: Date
}

private struct SnapCameraProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapCameraEntry { SnapCameraEntry(date: .now) }

    func getSnapshot(in context: Context, completion: @escaping (SnapCameraEntry) -> Void) {
        completion(SnapCameraEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapCameraEntry>) -> Void) {
        completion(Timeline(entries: [SnapCameraEntry(date: .now)], policy: .never))
    }
}

private struct SnapCameraView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "camera.fill").font(.title2)
                }
            case .accessoryInline:
                Label("Snap Camera", systemImage: "camera.fill")
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    Image(systemName: "camera.fill").font(.title2)
                    VStack(alignment: .leading) {
                        Text("Snap Camera").font(.headline)
                        Text("Log a meal").font(.caption)
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 6) {
                    Text("ONEREP").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    Image(systemName: "camera.fill").font(.system(size: 32, weight: .medium))
                        .widgetAccentable()
                    Spacer(minLength: 4)
                    Text("Snap Camera").font(.headline)
                    Text("Log a meal").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .foregroundStyle(.black)
            }
        }
        .widgetURL(URL(string: "onerep://camera")!)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Snap Camera. Open OneRep to photograph a meal.")
        .containerBackground(.white, for: .widget)
    }
}

struct OneRepSnapCameraWidget: Widget {
    let kind = "OneRepSnapCamera"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapCameraProvider()) { _ in
            SnapCameraView()
        }
        .configurationDisplayName("Snap Camera")
        .description("Open the camera to snap and log a meal.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
