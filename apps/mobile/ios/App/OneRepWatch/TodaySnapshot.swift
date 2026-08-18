import Foundation

/// Everything the watch knows about today.
///
/// The phone is the only writer. The watch never talks to Convex — it has no
/// session, no auth, and no business holding either — so this struct is the
/// entire contract between the two devices. Keep it small and flat: it travels
/// through `WCSession.updateApplicationContext`, which takes a property-list
/// dictionary and coalesces sends, so anything that cannot survive a round trip
/// through `[String: Any]` does not belong here.
struct TodaySnapshot: Codable, Equatable {
    var calories = 0
    var calorieGoal = 0
    var caloriesLeft = 0
    var protein = 0
    var proteinGoal = 0
    var carbs = 0
    var carbsGoal = 0
    var fat = 0
    var fatGoal = 0
    var waterMl = 0
    var waterGoalMl = 0
    var streakDays = 0
    var workoutBrief = ""
    /// Seconds since the epoch. Zero means the phone has never reported in,
    /// which the watch shows as "Open OneRep on your iPhone" rather than as a
    /// day in which you ate nothing.
    var updatedAt: Double = 0

    var hasData: Bool { updatedAt > 0 }

    /// A goal of zero would divide by nothing and render a full ring, so an
    /// unset goal reads as no progress rather than as perfect progress.
    func fraction(_ value: Int, of goal: Int) -> Double {
        guard goal > 0 else { return 0 }
        return min(Double(value) / Double(goal), 1)
    }
}

// MARK: - Property-list bridging

extension TodaySnapshot {
    var dictionary: [String: Any] {
        [
            "calories": calories,
            "calorieGoal": calorieGoal,
            "caloriesLeft": caloriesLeft,
            "protein": protein,
            "proteinGoal": proteinGoal,
            "carbs": carbs,
            "carbsGoal": carbsGoal,
            "fat": fat,
            "fatGoal": fatGoal,
            "waterMl": waterMl,
            "waterGoalMl": waterGoalMl,
            "streakDays": streakDays,
            "workoutBrief": workoutBrief,
            "updatedAt": updatedAt,
        ]
    }

    init(dictionary: [String: Any]) {
        func int(_ key: String) -> Int { dictionary[key] as? Int ?? 0 }
        calories = int("calories")
        calorieGoal = int("calorieGoal")
        caloriesLeft = int("caloriesLeft")
        protein = int("protein")
        proteinGoal = int("proteinGoal")
        carbs = int("carbs")
        carbsGoal = int("carbsGoal")
        fat = int("fat")
        fatGoal = int("fatGoal")
        waterMl = int("waterMl")
        waterGoalMl = int("waterGoalMl")
        streakDays = int("streakDays")
        workoutBrief = dictionary["workoutBrief"] as? String ?? ""
        updatedAt = dictionary["updatedAt"] as? Double ?? 0
    }
}
