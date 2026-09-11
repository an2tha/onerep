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
    /// How the watch should render water: "ml" or "fl oz". The phone writes
    /// its user's choice; "ml" keeps older cached snapshots rendering as
    /// before.
    var waterUnit = "ml"
    var daysLast28 = 0
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
    private enum CodingKeys: String, CodingKey {
        case calories, calorieGoal, caloriesLeft, protein, proteinGoal, carbs, carbsGoal, fat, fatGoal
        case waterMl, waterGoalMl, waterUnit, daysLast28, workoutBrief, updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        calories = try container.decodeIfPresent(Int.self, forKey: .calories) ?? 0
        calorieGoal = try container.decodeIfPresent(Int.self, forKey: .calorieGoal) ?? 0
        caloriesLeft = try container.decodeIfPresent(Int.self, forKey: .caloriesLeft) ?? 0
        protein = try container.decodeIfPresent(Int.self, forKey: .protein) ?? 0
        proteinGoal = try container.decodeIfPresent(Int.self, forKey: .proteinGoal) ?? 0
        carbs = try container.decodeIfPresent(Int.self, forKey: .carbs) ?? 0
        carbsGoal = try container.decodeIfPresent(Int.self, forKey: .carbsGoal) ?? 0
        fat = try container.decodeIfPresent(Int.self, forKey: .fat) ?? 0
        fatGoal = try container.decodeIfPresent(Int.self, forKey: .fatGoal) ?? 0
        waterMl = try container.decodeIfPresent(Int.self, forKey: .waterMl) ?? 0
        waterGoalMl = try container.decodeIfPresent(Int.self, forKey: .waterGoalMl) ?? 0
        waterUnit = try container.decodeIfPresent(String.self, forKey: .waterUnit) ?? "ml"
        daysLast28 = try container.decodeIfPresent(Int.self, forKey: .daysLast28) ?? 0
        workoutBrief = try container.decodeIfPresent(String.self, forKey: .workoutBrief) ?? ""
        updatedAt = try container.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0
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
            "waterUnit": waterUnit,
            "daysLast28": daysLast28,
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
        waterUnit = dictionary["waterUnit"] as? String ?? "ml"
        daysLast28 = int("daysLast28")
        workoutBrief = dictionary["workoutBrief"] as? String ?? ""
        updatedAt = dictionary["updatedAt"] as? Double ?? 0
    }
}
