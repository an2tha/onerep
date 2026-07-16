import WidgetKit
import SwiftUI

private let appGroup = "group.com.ananthh.onerep"

struct OneRepEntry: TimelineEntry {
    let date: Date
    let nutritionSynced: Bool
    let workoutSynced: Bool
    let calories: Int
    let calorieGoal: Int
    let caloriesLeft: Int
    let protein: Int
    let proteinGoal: Int
    let carbs: Int
    let carbsGoal: Int
    let fat: Int
    let fatGoal: Int
    let foodsLogged: String
    let workoutExercises: String
    let workoutBrief: String

    static func current() -> OneRepEntry {
        let defaults = UserDefaults(suiteName: appGroup)
        return OneRepEntry(
            date: .now,
            nutritionSynced: (defaults?.double(forKey: "nutritionWidgetUpdatedAt") ?? 0) > 0,
            workoutSynced: (defaults?.double(forKey: "workoutWidgetUpdatedAt") ?? 0) > 0,
            calories: defaults?.integer(forKey: "calories") ?? 0,
            calorieGoal: defaults?.integer(forKey: "calorieGoal") ?? 0,
            caloriesLeft: defaults?.integer(forKey: "caloriesLeft") ?? 0,
            protein: defaults?.integer(forKey: "protein") ?? 0,
            proteinGoal: defaults?.integer(forKey: "proteinGoal") ?? 0,
            carbs: defaults?.integer(forKey: "carbs") ?? 0,
            carbsGoal: defaults?.integer(forKey: "carbsGoal") ?? 0,
            fat: defaults?.integer(forKey: "fat") ?? 0,
            fatGoal: defaults?.integer(forKey: "fatGoal") ?? 0,
            foodsLogged: defaults?.string(forKey: "foodsLogged") ?? "",
            workoutExercises: defaults?.string(forKey: "workoutExercises") ?? "",
            workoutBrief: defaults?.string(forKey: "workoutBrief") ?? ""
        )
    }
}

struct OneRepProvider: TimelineProvider {
    func placeholder(in context: Context) -> OneRepEntry { .current() }
    func getSnapshot(in context: Context, completion: @escaping (OneRepEntry) -> Void) { completion(.current()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<OneRepEntry>) -> Void) {
        completion(Timeline(entries: [.current()], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

private struct ProgressBar: View {
    let value: Int
    let goal: Int
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.black.opacity(0.1))
                Capsule().fill(.black).frame(width: proxy.size.width * min(CGFloat(value) / CGFloat(max(goal, 1)), 1))
            }
        }.frame(height: 5)
    }
}

private struct UnsyncedView: View {
    var body: some View {
        Link(destination: URL(string: "onerep://today")!) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "arrow.triangle.2.circlepath").font(.title2)
                Spacer()
                Text("Open OneRep to sync").font(.headline)
                Text("Widget data updates from your account.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct QuickActionsView: View {
    @Environment(\.widgetFamily) private var family
    var body: some View {
        if family == .systemSmall {
            Link(destination: URL(string: "onerep://workout")!) {
                VStack(alignment: .leading) {
                    Image(systemName: "figure.strengthtraining.traditional").font(.title2.weight(.semibold))
                    Spacer(); Text("Start workout").font(.headline); Text("OneRep").font(.caption).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
        } else {
            HStack(spacing: 12) {
                action("Start workout", "figure.strengthtraining.traditional", "onerep://workout")
                Divider()
                action("Log a meal", "fork.knife", "onerep://nutrition")
            }
        }
    }
    private func action(_ title: String, _ icon: String, _ url: String) -> some View {
        Link(destination: URL(string: url)!) {
            VStack(spacing: 10) { Image(systemName: icon).font(.title2.weight(.semibold)); Text(title).font(.subheadline.weight(.semibold)) }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct NutritionOverviewView: View {
    let entry: OneRepEntry
    var body: some View {
        if !entry.nutritionSynced || entry.calorieGoal <= 0 { UnsyncedView() } else {
            Link(destination: URL(string: "onerep://nutrition")!) {
                VStack(alignment: .leading, spacing: 7) {
                    Label("Nutrition", systemImage: "fork.knife").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Text("\(max(entry.calorieGoal - entry.calories, 0)) left").font(.title2.weight(.semibold))
                    ProgressBar(value: entry.calories, goal: entry.calorieGoal)
                    Spacer(minLength: 0)
                    macroRow("P", entry.protein, entry.proteinGoal)
                    macroRow("C", entry.carbs, entry.carbsGoal)
                    macroRow("F", entry.fat, entry.fatGoal)
                }
            }
        }
    }
    private func macroRow(_ name: String, _ value: Int, _ goal: Int) -> some View {
        HStack { Text(name); Spacer(); Text("\(value)/\(goal)g") }.font(.caption.weight(.medium)).monospacedDigit()
    }
}

struct WorkoutScheduleView: View {
    let entry: OneRepEntry
    var body: some View {
        if !entry.workoutSynced { UnsyncedView() } else {
            Link(destination: URL(string: "onerep://workouts")!) {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Today's workout", systemImage: "figure.strengthtraining.traditional").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Text(entry.workoutExercises).font(.headline).lineLimit(4)
                    Spacer(minLength: 0)
                    Text(entry.workoutBrief).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct CombinedOverviewView: View {
    let entry: OneRepEntry
    var body: some View {
        if !entry.nutritionSynced || entry.calorieGoal <= 0 { UnsyncedView() } else {
            Link(destination: URL(string: "onerep://nutrition")!) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Nutrition").font(.headline)
                            Text("\(entry.calories) eaten · \(max(entry.calorieGoal - entry.calories, 0)) kcal left").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "fork.knife")
                    }
                    ProgressBar(value: entry.calories, goal: entry.calorieGoal)
                    Text(entry.foodsLogged).font(.subheadline.weight(.medium)).lineLimit(2)
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        macroCard("Protein", entry.protein, entry.proteinGoal)
                        macroCard("Carbs", entry.carbs, entry.carbsGoal)
                        macroCard("Fat", entry.fat, entry.fatGoal)
                    }
                }
            }
        }
    }
    private func macroCard(_ label: String, _ value: Int, _ goal: Int) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text("\(value) / \(goal)g").font(.caption.weight(.semibold)).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(8).background(.black.opacity(0.05), in: RoundedRectangle(cornerRadius: 9))
    }
}

struct OneRepQuickActionsWidget: Widget {
    let kind = "OneRepQuickActions"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: OneRepProvider()) { _ in QuickActionsView().foregroundStyle(.black).containerBackground(.white, for: .widget) }.configurationDisplayName("OneRep Actions").description("Start a workout or log a meal.").supportedFamilies([.systemSmall, .systemMedium]) }
}
struct OneRepNutritionWidget: Widget {
    let kind = "OneRepNutrition"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: OneRepProvider()) { NutritionOverviewView(entry: $0).foregroundStyle(.black).containerBackground(.white, for: .widget) }.configurationDisplayName("Nutrition Overview").description("Live calories and macros from OneRep.").supportedFamilies([.systemSmall]) }
}
struct OneRepScheduleWidget: Widget {
    let kind = "OneRepSchedule"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: OneRepProvider()) { WorkoutScheduleView(entry: $0).foregroundStyle(.black).containerBackground(.white, for: .widget) }.configurationDisplayName("Today's Workout").description("Exercises and sets scheduled for today.").supportedFamilies([.systemSmall, .systemMedium]) }
}
struct OneRepCombinedWidget: Widget {
    let kind = "OneRepCombined"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: OneRepProvider()) { CombinedOverviewView(entry: $0).foregroundStyle(.black).containerBackground(.white, for: .widget) }.configurationDisplayName("Nutrition Detail").description("Foods logged, calories left, and macro breakdown.").supportedFamilies([.systemMedium, .systemLarge]) }
}
