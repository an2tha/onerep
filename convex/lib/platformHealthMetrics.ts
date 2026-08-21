/**
 * Every signal Apple Health and Health Connect expose that this app can
 * meaningfully read, and how the two platforms name the same thing.
 *
 * The two stores disagree more than their marketing suggests. Apple splits
 * distance by activity (`distanceWalkingRunning`, `distanceCycling`,
 * `distanceSwimming`) where Health Connect has one `DistanceRecord`. Apple has
 * no bone mass; Health Connect has no mindful minutes. Apple's HRV is SDNN and
 * Health Connect's is RMSSD — the same concept, different maths, never
 * comparable across platforms, only against the same person's own history.
 * Nutrition is the reverse shape: Health Connect keeps one record with a field
 * per nutrient, HealthKit a separate type for each, and neither arrangement
 * survives contact with the other, so every nutrient is its own entry here.
 *
 * So each entry names both sides where both exist and says so where they do
 * not. `apple: null` means the metric is Android-only and vice versa; a user on
 * the other platform sees it greyed with the reason rather than absent, because
 * "your phone cannot do this" is a better answer than a gap.
 *
 * `builtIn: true` marks the handful the app scores on its own and draws its own
 * screens for. Most of those are also rows in `healthMetricCatalog.ts`, which is
 * the list of daily values the sync reads and stores a column for; exercise
 * minutes is the exception and is explained at its entry. Everything not marked
 * built-in is available as a custom metric: pick it when creating one and the
 * sync fills it in, which is how blood glucose or blood pressure gets tracked
 * without the app pretending to have an opinion about what a good reading is.
 */

export type PlatformMetricGroup =
  | "activity"
  | "vitals"
  | "body"
  | "nutrition"
  | "sleep"
  | "reproductive"
  | "mindfulness";

/**
 * How a day's readings collapse into one number.
 *
 * `latest` is for point measurements someone takes (a weigh-in, a glucose
 * finger-prick), `sum` for things that accumulate (steps, calories), `average`
 * for sampled signals where no single reading is more true than another
 * (resting heart rate), `session` for things with a start and an end (sleep,
 * workouts).
 */
export type PlatformMetricAggregation =
  "sum" | "average" | "latest" | "max" | "session";

export type PlatformMetric = {
  key: string;
  label: string;
  /** What it is, in a sentence, for the metric picker. */
  detail: string;
  group: PlatformMetricGroup;
  unit: string;
  aggregation: PlatformMetricAggregation;
  /**
   * HealthKit identifier without its prefix — `HKQuantityTypeIdentifier` for
   * most, `HKCategoryTypeIdentifier` for the ones that are states rather than
   * amounts (sleep, menstrual flow, sexual activity). The plugin knows which.
   */
  apple: string | null;
  /** Health Connect record class, without the `Record` suffix. */
  google: string | null;
  /** Why one platform is missing, shown in place of the switch. */
  gap?: string;
  /** Plausible range; readings outside it are dropped, never the whole day. */
  min: number;
  max: number;
  /** True when the app scores on it and gives it dedicated UI. */
  builtIn?: boolean;
};

export const PLATFORM_METRICS: PlatformMetric[] = [
  // ── Activity ──────────────────────────────────────────────────────────────
  {
    key: "steps",
    label: "Steps",
    detail: "Steps taken across the day",
    group: "activity",
    unit: "steps",
    aggregation: "sum",
    apple: "stepCount",
    google: "Steps",
    min: 0,
    max: 200000,
    builtIn: true,
  },
  {
    key: "activeEnergyKcal",
    label: "Active calories",
    detail: "Energy burned beyond resting",
    group: "activity",
    unit: "kcal",
    aggregation: "sum",
    apple: "activeEnergyBurned",
    google: "ActiveCaloriesBurned",
    min: 0,
    max: 20000,
    builtIn: true,
  },
  {
    key: "totalEnergyKcal",
    label: "Total calories",
    detail: "Active and resting energy together",
    group: "activity",
    unit: "kcal",
    aggregation: "sum",
    apple: null,
    google: "TotalCaloriesBurned",
    gap: "Apple Health reports active and resting energy separately rather than as one total.",
    min: 0,
    max: 30000,
  },
  {
    key: "exerciseMinutes",
    label: "Exercise minutes",
    detail: "Time in recorded sessions",
    group: "activity",
    unit: "min",
    aggregation: "session",
    apple: "appleExerciseTime",
    google: "ExerciseSession",
    min: 0,
    max: 1440,
    // The one built-in that is not a row in `healthMetricCatalog.ts` and has no
    // column on `healthMetrics`. Minutes are summed from the workout sessions
    // in `healthWorkouts`, which sync down a path of their own, and
    // `lib/healthMetrics.ts:exerciseMinutesByDate` adds them up per local day
    // for the score. Adding it to the catalogue would draw a Settings switch
    // that turns nothing off and ask the plugin for a daily number with nowhere
    // to land; it stays built-in so nothing can bind a custom metric to it and
    // double-count the same sessions.
    builtIn: true,
  },
  {
    key: "distanceWalkingRunningM",
    label: "Walking and running distance",
    detail: "Ground covered on foot",
    group: "activity",
    unit: "m",
    aggregation: "sum",
    apple: "distanceWalkingRunning",
    google: "Distance",
    gap: "Health Connect keeps one distance figure across every activity; on Android this includes cycling and swimming.",
    min: 0,
    max: 500000,
  },
  {
    key: "distanceCyclingM",
    label: "Cycling distance",
    detail: "Ground covered on a bike",
    group: "activity",
    unit: "m",
    aggregation: "sum",
    apple: "distanceCycling",
    google: null,
    gap: "Health Connect does not split distance by activity.",
    min: 0,
    max: 1000000,
  },
  {
    key: "distanceSwimmingM",
    label: "Swimming distance",
    detail: "Distance swum",
    group: "activity",
    unit: "m",
    aggregation: "sum",
    apple: "distanceSwimming",
    google: null,
    gap: "Health Connect does not split distance by activity.",
    min: 0,
    max: 100000,
  },
  {
    key: "floorsClimbed",
    label: "Floors climbed",
    detail: "Flights of stairs",
    group: "activity",
    unit: "floors",
    aggregation: "sum",
    apple: "flightsClimbed",
    google: "FloorsClimbed",
    min: 0,
    max: 1000,
  },
  {
    key: "elevationGainedM",
    label: "Elevation gained",
    detail: "Height climbed over the day",
    group: "activity",
    unit: "m",
    aggregation: "sum",
    apple: null,
    google: "ElevationGained",
    gap: "Apple Health exposes flights climbed rather than metres ascended.",
    min: 0,
    max: 20000,
  },
  {
    key: "wheelchairPushes",
    label: "Wheelchair pushes",
    detail: "Pushes, the wheelchair equivalent of steps",
    group: "activity",
    unit: "pushes",
    aggregation: "sum",
    apple: "pushCount",
    google: "WheelchairPushes",
    min: 0,
    max: 100000,
  },
  {
    key: "vo2Max",
    label: "VO2 max",
    detail: "Estimated aerobic capacity",
    group: "activity",
    unit: "mL/kg/min",
    aggregation: "latest",
    // HealthKit spells this `HKQuantityTypeIdentifierVO2Max`, with the
    // acronym capitalised, where every other identifier is lowerCamelCase.
    // Anything deriving the identifier mechanically from this string has to
    // get the odd one right, so the odd one is stored as it really is.
    apple: "VO2Max",
    google: "Vo2Max",
    min: 5,
    max: 100,
  },
  {
    key: "cyclingCadenceRpm",
    label: "Cycling cadence",
    detail: "Pedal revolutions per minute",
    group: "activity",
    unit: "rpm",
    aggregation: "average",
    apple: "cyclingCadence",
    google: "CyclingPedalingCadence",
    min: 1,
    max: 250,
  },
  {
    key: "powerWatts",
    label: "Power",
    detail: "Output on a bike or rower",
    group: "activity",
    unit: "W",
    aggregation: "average",
    apple: "cyclingPower",
    google: "Power",
    min: 1,
    max: 2500,
  },
  {
    key: "speedMps",
    label: "Speed",
    detail: "Pace, in metres per second",
    group: "activity",
    unit: "m/s",
    aggregation: "average",
    apple: "runningSpeed",
    google: "Speed",
    min: 0,
    max: 50,
  },
  {
    key: "stepsCadenceSpm",
    label: "Steps cadence",
    detail: "Steps per minute while walking or running",
    group: "activity",
    unit: "steps/min",
    aggregation: "average",
    apple: null,
    google: "StepsCadence",
    // Apple ships cadence for cycling (iOS 17) but never for walking or
    // running; the running family is stride length, vertical oscillation,
    // ground contact time and power, and cadence is left to be divided out of
    // step count. We do not do that division, because the two come from
    // different windows and the quotient would be a fiction.
    gap: "Apple Health records cycling cadence but has no walking or running cadence type.",
    min: 1,
    max: 400,
  },

  // ── Vitals ────────────────────────────────────────────────────────────────
  {
    key: "restingHeartRateBpm",
    label: "Resting heart rate",
    detail: "Heart rate at rest, averaged across the day",
    group: "vitals",
    unit: "bpm",
    aggregation: "average",
    apple: "restingHeartRate",
    google: "RestingHeartRate",
    min: 20,
    max: 200,
    builtIn: true,
  },
  {
    key: "heartRateBpm",
    label: "Heart rate",
    detail: "Every reading, averaged over the day",
    group: "vitals",
    unit: "bpm",
    aggregation: "average",
    apple: "heartRate",
    google: "HeartRate",
    min: 20,
    max: 250,
  },
  {
    key: "hrvMs",
    label: "Heart rate variability",
    detail:
      "Beat-to-beat variation. SDNN on Apple, RMSSD on Android — never compare the two, only against your own history.",
    group: "vitals",
    unit: "ms",
    aggregation: "average",
    apple: "heartRateVariabilitySDNN",
    google: "HeartRateVariabilityRmssd",
    min: 1,
    max: 500,
    builtIn: true,
  },
  {
    key: "bloodGlucoseMmolL",
    label: "Blood glucose",
    detail: "Finger-prick or continuous monitor readings",
    group: "vitals",
    unit: "mmol/L",
    aggregation: "average",
    apple: "bloodGlucose",
    google: "BloodGlucose",
    min: 1,
    max: 40,
  },
  {
    key: "bloodPressureSystolic",
    label: "Blood pressure (systolic)",
    detail: "The upper number",
    group: "vitals",
    unit: "mmHg",
    aggregation: "average",
    apple: "bloodPressureSystolic",
    google: "BloodPressure",
    min: 50,
    max: 260,
  },
  {
    key: "bloodPressureDiastolic",
    label: "Blood pressure (diastolic)",
    detail: "The lower number",
    group: "vitals",
    unit: "mmHg",
    aggregation: "average",
    apple: "bloodPressureDiastolic",
    google: "BloodPressure",
    min: 30,
    max: 200,
  },
  {
    key: "oxygenSaturationPct",
    label: "Blood oxygen",
    detail: "SpO2, as a percentage",
    group: "vitals",
    unit: "%",
    aggregation: "average",
    apple: "oxygenSaturation",
    google: "OxygenSaturation",
    min: 50,
    max: 100,
  },
  {
    key: "respiratoryRateBpm",
    label: "Respiratory rate",
    detail: "Breaths per minute",
    group: "vitals",
    unit: "breaths/min",
    aggregation: "average",
    apple: "respiratoryRate",
    google: "RespiratoryRate",
    min: 3,
    max: 80,
  },
  {
    key: "bodyTemperatureC",
    label: "Body temperature",
    detail: "Measured temperature",
    group: "vitals",
    unit: "°C",
    aggregation: "latest",
    apple: "bodyTemperature",
    google: "BodyTemperature",
    min: 25,
    max: 45,
  },
  {
    key: "basalBodyTemperatureC",
    label: "Basal body temperature",
    detail: "Waking temperature, before getting up",
    group: "vitals",
    unit: "°C",
    aggregation: "latest",
    apple: "basalBodyTemperature",
    google: "BasalBodyTemperature",
    min: 25,
    max: 45,
  },
  {
    key: "walkingHeartRateAvgBpm",
    label: "Walking heart rate",
    detail:
      "Average rate over a steady walk, a slower-moving companion to resting rate",
    group: "vitals",
    unit: "bpm",
    aggregation: "average",
    apple: "walkingHeartRateAverage",
    google: null,
    gap: "Health Connect stores raw heart rate samples without labelling which came from walking.",
    min: 40,
    max: 200,
  },
  {
    key: "heartRateRecoveryBpm",
    label: "Heart rate recovery",
    detail: "Drop in beats per minute in the first minute after hard effort",
    group: "vitals",
    unit: "bpm",
    aggregation: "max",
    apple: "heartRateRecoveryOneMinute",
    google: null,
    gap: "Health Connect has no heart rate recovery type.",
    min: 1,
    max: 100,
  },
  {
    key: "wristTemperatureC",
    label: "Wrist temperature",
    detail: "Overnight skin temperature from a watch worn to bed",
    group: "vitals",
    unit: "°C",
    aggregation: "latest",
    apple: "appleSleepingWristTemperature",
    google: null,
    // Both platforms landed on overnight temperature and then disagreed about
    // what to store: Apple an absolute reading, Google a signed delta from a
    // baseline it computes itself. Merging them into one row would produce a
    // series that changes meaning when you change phone, so they are two rows.
    gap: "Health Connect reports a change from your baseline rather than an absolute temperature; see skin temperature change.",
    min: 25,
    max: 45,
  },
  {
    key: "skinTemperatureDeltaC",
    label: "Skin temperature change",
    detail: "How far last night's skin temperature sat from your own baseline",
    group: "vitals",
    unit: "°C",
    aggregation: "latest",
    apple: null,
    google: "SkinTemperature",
    gap: "Apple Health reports an absolute wrist temperature instead; see wrist temperature.",
    min: -10,
    max: 10,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  {
    key: "weightKg",
    label: "Weight",
    detail: "Scale readings, added to your check-ins",
    group: "body",
    unit: "kg",
    aggregation: "latest",
    apple: "bodyMass",
    google: "Weight",
    min: 20,
    max: 500,
    builtIn: true,
  },
  {
    key: "bodyFatPct",
    label: "Body fat",
    detail: "Percentage from a smart scale or caliper entry",
    group: "body",
    unit: "%",
    aggregation: "latest",
    apple: "bodyFatPercentage",
    google: "BodyFat",
    min: 1,
    max: 75,
    builtIn: true,
  },
  {
    key: "leanBodyMassKg",
    label: "Lean body mass",
    detail: "Everything that is not fat",
    group: "body",
    unit: "kg",
    aggregation: "latest",
    apple: "leanBodyMass",
    google: "LeanBodyMass",
    min: 10,
    max: 300,
    builtIn: true,
  },
  {
    key: "boneMassKg",
    label: "Bone mass",
    detail: "Reported by some smart scales",
    group: "body",
    unit: "kg",
    aggregation: "latest",
    apple: null,
    google: "BoneMass",
    gap: "Apple Health has no bone mass type; enter it as a custom metric on iOS.",
    min: 0.5,
    max: 20,
    builtIn: true,
  },
  {
    key: "basalMetabolicRateKcal",
    label: "Basal metabolic rate",
    detail: "Resting energy, used to sanity-check your targets",
    group: "body",
    unit: "kcal",
    aggregation: "sum",
    apple: "basalEnergyBurned",
    google: "BasalMetabolicRate",
    gap: "Apple reports resting energy accumulated over the day; Health Connect reports a rate. Both land here as kcal per day.",
    min: 500,
    max: 6000,
    builtIn: true,
  },
  {
    key: "heightCm",
    label: "Height",
    detail: "Standing height",
    group: "body",
    unit: "cm",
    aggregation: "latest",
    apple: "height",
    google: "Height",
    min: 50,
    max: 260,
  },
  {
    key: "waistCircumferenceCm",
    label: "Waist",
    detail: "Waist circumference",
    group: "body",
    unit: "cm",
    aggregation: "latest",
    apple: "waistCircumference",
    google: null,
    gap: "Health Connect has no waist type; log it as a check-in measurement on Android.",
    min: 30,
    max: 250,
  },
  {
    key: "bodyWaterMassKg",
    label: "Body water",
    detail: "Total body water, reported by scales that measure impedance",
    group: "body",
    unit: "kg",
    aggregation: "latest",
    apple: null,
    google: "BodyWaterMass",
    gap: "Apple Health has no body water type; enter it as a custom metric on iOS.",
    min: 5,
    max: 200,
  },
  {
    key: "bodyMassIndex",
    label: "BMI",
    detail: "Body mass index, as your scale or another app calculated it",
    group: "body",
    unit: "kg/m²",
    aggregation: "latest",
    apple: "bodyMassIndex",
    google: null,
    // Health Connect's position is that BMI is height and weight divided, so
    // it stores the two and lets readers do the sum. We do not do the sum here
    // either: a value that appears without a weigh-in behind it reads as a
    // measurement someone took, and it was not.
    gap: "Health Connect stores height and weight and expects apps to divide; there is no BMI record.",
    min: 8,
    max: 100,
  },

  // ── Nutrition ─────────────────────────────────────────────────────────────
  {
    key: "dietaryEnergyKcal",
    label: "Calories eaten",
    detail: "Energy consumed, as recorded by another app",
    group: "nutrition",
    unit: "kcal",
    aggregation: "sum",
    apple: "dietaryEnergyConsumed",
    google: "Nutrition",
    min: 0,
    max: 20000,
  },
  {
    key: "dietaryProteinG",
    label: "Protein eaten",
    detail: "Protein consumed",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietaryProtein",
    google: "Nutrition",
    min: 0,
    max: 1000,
  },
  {
    key: "dietaryCarbsG",
    label: "Carbohydrates eaten",
    detail: "Carbohydrate consumed",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietaryCarbohydrates",
    google: "Nutrition",
    min: 0,
    max: 2000,
  },
  {
    key: "dietaryFatG",
    label: "Fat eaten",
    detail: "Total fat consumed",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietaryFatTotal",
    google: "Nutrition",
    min: 0,
    max: 1000,
  },
  {
    key: "hydrationMl",
    label: "Water",
    detail: "Fluid intake",
    group: "nutrition",
    unit: "ml",
    aggregation: "sum",
    apple: "dietaryWater",
    google: "Hydration",
    min: 0,
    max: 20000,
  },
  {
    key: "caffeineMg",
    label: "Caffeine",
    detail: "Caffeine consumed",
    group: "nutrition",
    unit: "mg",
    aggregation: "sum",
    apple: "dietaryCaffeine",
    google: "Nutrition",
    min: 0,
    max: 3000,
  },
  // Health Connect packs every nutrient into one `NutritionRecord` with a field
  // per nutrient; HealthKit gives each its own quantity type. The entries below
  // are one row per nutrient either way, which is what a person tracking sodium
  // actually wants. HealthKit's roughly eighty dietary identifiers are not all
  // here on purpose — the B vitamins, zinc, selenium, copper, iodine, chromium
  // and the rest go unwritten by every food app worth syncing from, and a
  // picker that lists them is a picker nobody can find sodium in.
  {
    key: "dietaryFiberG",
    label: "Fibre",
    detail: "Dietary fibre consumed",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietaryFiber",
    google: "Nutrition",
    min: 0,
    max: 500,
  },
  {
    key: "dietarySugarG",
    label: "Sugar",
    detail: "Total sugars, added and naturally occurring together",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietarySugar",
    google: "Nutrition",
    min: 0,
    max: 1000,
  },
  {
    key: "dietarySodiumMg",
    label: "Sodium",
    detail: "Sodium consumed, not the weight of the salt it came in",
    group: "nutrition",
    unit: "mg",
    aggregation: "sum",
    apple: "dietarySodium",
    google: "Nutrition",
    min: 0,
    max: 50000,
  },
  {
    key: "dietaryCholesterolMg",
    label: "Cholesterol",
    detail: "Dietary cholesterol consumed",
    group: "nutrition",
    unit: "mg",
    aggregation: "sum",
    apple: "dietaryCholesterol",
    google: "Nutrition",
    min: 0,
    max: 10000,
  },
  {
    key: "dietarySaturatedFatG",
    label: "Saturated fat",
    detail: "The saturated share of the day's fat",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietaryFatSaturated",
    google: "Nutrition",
    min: 0,
    max: 500,
  },
  {
    key: "dietaryMonounsaturatedFatG",
    label: "Monounsaturated fat",
    detail: "The monounsaturated share of the day's fat",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietaryFatMonounsaturated",
    google: "Nutrition",
    min: 0,
    max: 500,
  },
  {
    key: "dietaryPolyunsaturatedFatG",
    label: "Polyunsaturated fat",
    detail: "The polyunsaturated share of the day's fat",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: "dietaryFatPolyunsaturated",
    google: "Nutrition",
    min: 0,
    max: 500,
  },
  {
    key: "dietaryTransFatG",
    label: "Trans fat",
    detail: "Trans fat consumed",
    group: "nutrition",
    unit: "g",
    aggregation: "sum",
    apple: null,
    google: "Nutrition",
    gap: "HealthKit has identifiers for saturated, monounsaturated and polyunsaturated fat but none for trans fat.",
    min: 0,
    max: 200,
  },
  {
    key: "dietaryPotassiumMg",
    label: "Potassium",
    detail: "Potassium consumed",
    group: "nutrition",
    unit: "mg",
    aggregation: "sum",
    apple: "dietaryPotassium",
    google: "Nutrition",
    min: 0,
    max: 50000,
  },
  {
    key: "dietaryCalciumMg",
    label: "Calcium",
    detail: "Calcium consumed",
    group: "nutrition",
    unit: "mg",
    aggregation: "sum",
    apple: "dietaryCalcium",
    google: "Nutrition",
    min: 0,
    max: 20000,
  },
  {
    key: "dietaryIronMg",
    label: "Iron",
    detail: "Iron consumed",
    group: "nutrition",
    unit: "mg",
    aggregation: "sum",
    apple: "dietaryIron",
    google: "Nutrition",
    min: 0,
    max: 1000,
  },
  {
    key: "dietaryVitaminAMcg",
    label: "Vitamin A",
    detail: "Vitamin A consumed, as retinol activity equivalents",
    group: "nutrition",
    unit: "µg",
    aggregation: "sum",
    apple: "dietaryVitaminA",
    google: "Nutrition",
    min: 0,
    max: 100000,
  },
  {
    key: "dietaryVitaminCMg",
    label: "Vitamin C",
    detail: "Vitamin C consumed",
    group: "nutrition",
    unit: "mg",
    aggregation: "sum",
    apple: "dietaryVitaminC",
    google: "Nutrition",
    min: 0,
    max: 20000,
  },
  {
    key: "dietaryVitaminDMcg",
    label: "Vitamin D",
    detail: "Vitamin D consumed, food and supplements together",
    group: "nutrition",
    unit: "µg",
    aggregation: "sum",
    apple: "dietaryVitaminD",
    google: "Nutrition",
    min: 0,
    max: 5000,
  },

  // ── Sleep ─────────────────────────────────────────────────────────────────
  {
    key: "sleepMinutes",
    label: "Sleep",
    detail: "Time asleep, credited to the waking day",
    group: "sleep",
    unit: "min",
    aggregation: "session",
    apple: "sleepAnalysis",
    google: "SleepSession",
    min: 0,
    max: 1440,
    builtIn: true,
  },
  // The stages are not separate record types on either platform: Apple files
  // them as values of `sleepAnalysis`, Google as stages inside a
  // `SleepSessionRecord`. Both are read through the same permission as the
  // session, so a plugin already reading sleep gets these for the cost of
  // summing them. Whether a watch can tell REM from light is its own question,
  // and the answer varies by device rather than by platform.
  {
    key: "sleepDeepMinutes",
    label: "Deep sleep",
    detail: "Time in deep sleep, as your watch scored it",
    group: "sleep",
    unit: "min",
    aggregation: "session",
    apple: "sleepAnalysis",
    google: "SleepSession",
    min: 0,
    max: 1440,
  },
  {
    key: "sleepRemMinutes",
    label: "REM sleep",
    detail: "Time in REM sleep, as your watch scored it",
    group: "sleep",
    unit: "min",
    aggregation: "session",
    apple: "sleepAnalysis",
    google: "SleepSession",
    min: 0,
    max: 1440,
  },
  {
    key: "sleepLightMinutes",
    label: "Light sleep",
    detail: "Time in light sleep, as your watch scored it",
    group: "sleep",
    unit: "min",
    aggregation: "session",
    apple: "sleepAnalysis",
    google: "SleepSession",
    min: 0,
    max: 1440,
  },
  {
    key: "sleepAwakeMinutes",
    label: "Awake in bed",
    detail: "Time in bed but awake, between falling asleep and getting up",
    group: "sleep",
    unit: "min",
    aggregation: "session",
    apple: "sleepAnalysis",
    google: "SleepSession",
    min: 0,
    max: 1440,
  },

  // ── Reproductive health ───────────────────────────────────────────────────
  {
    key: "menstruationFlow",
    label: "Menstrual flow",
    detail: "Flow level, as a number from none to heavy",
    group: "reproductive",
    unit: "level",
    aggregation: "latest",
    apple: "menstrualFlow",
    google: "MenstruationFlow",
    min: 0,
    max: 3,
  },
  {
    key: "cervicalMucus",
    label: "Cervical mucus",
    detail: "Recorded quality, as a level",
    group: "reproductive",
    unit: "level",
    aggregation: "latest",
    apple: "cervicalMucusQuality",
    google: "CervicalMucus",
    min: 0,
    max: 5,
  },
  {
    key: "ovulationTest",
    label: "Ovulation test",
    detail: "Test result, as a level",
    group: "reproductive",
    unit: "level",
    aggregation: "latest",
    apple: "ovulationTestResult",
    google: "OvulationTest",
    min: 0,
    max: 4,
  },
  {
    key: "intermenstrualBleeding",
    label: "Intermenstrual bleeding",
    detail: "Spotting between periods",
    group: "reproductive",
    unit: "recorded",
    aggregation: "latest",
    apple: "intermenstrualBleeding",
    google: "IntermenstrualBleeding",
    min: 0,
    max: 1,
  },
  {
    key: "menstruationPeriod",
    label: "Period",
    detail: "Whether the day falls inside a period",
    group: "reproductive",
    unit: "recorded",
    aggregation: "latest",
    apple: null,
    google: "MenstruationPeriod",
    // Health Connect records the period as an interval with a start and an end;
    // Apple has only the per-day flow category and infers the boundaries in the
    // Cycle Tracking UI rather than storing them. On iOS a day with any flow
    // recorded is the closest honest answer, so use menstrual flow there.
    gap: "Apple Health stores flow per day and works the period out in its own app; use menstrual flow on iOS.",
    min: 0,
    max: 1,
  },
  {
    key: "sexualActivity",
    label: "Sexual activity",
    detail: "Recorded occurrences, which some people track alongside a cycle",
    group: "reproductive",
    unit: "recorded",
    aggregation: "sum",
    apple: "sexualActivity",
    google: "SexualActivity",
    min: 0,
    max: 50,
  },

  // ── Mindfulness ───────────────────────────────────────────────────────────
  {
    key: "mindfulMinutes",
    label: "Mindful minutes",
    detail: "Time in recorded mindfulness sessions",
    group: "mindfulness",
    unit: "min",
    aggregation: "session",
    apple: "mindfulSession",
    google: null,
    gap: "Health Connect has no mindfulness type.",
    min: 0,
    max: 1440,
  },
];

export const PLATFORM_METRIC_GROUP_LABELS: Record<PlatformMetricGroup, string> =
  {
    activity: "Activity",
    vitals: "Vitals",
    body: "Body",
    nutrition: "Nutrition",
    sleep: "Sleep",
    reproductive: "Reproductive health",
    mindfulness: "Mindfulness",
  };

const BY_KEY = new Map(PLATFORM_METRICS.map((metric) => [metric.key, metric]));

export function platformMetric(key: string): PlatformMetric | undefined {
  return BY_KEY.get(key);
}

export const PLATFORM_METRIC_KEYS = PLATFORM_METRICS.map(
  (metric) => metric.key,
);

/** Metrics a given platform can actually deliver. */
export function metricsForPlatform(
  platform: "ios" | "android",
): PlatformMetric[] {
  return PLATFORM_METRICS.filter((metric) =>
    platform === "ios" ? metric.apple !== null : metric.google !== null,
  );
}

/**
 * The ones available to bind a custom metric to — everything except the
 * handful the app already scores on and draws its own screens for.
 */
export function bindableMetrics(): PlatformMetric[] {
  return PLATFORM_METRICS.filter((metric) => !metric.builtIn);
}

export function platformMetricGroups(metrics: PlatformMetric[]): {
  group: PlatformMetricGroup;
  label: string;
  metrics: PlatformMetric[];
}[] {
  const order: PlatformMetricGroup[] = [
    "activity",
    "vitals",
    "body",
    "nutrition",
    "sleep",
    "reproductive",
    "mindfulness",
  ];
  return order
    .map((group) => ({
      group,
      label: PLATFORM_METRIC_GROUP_LABELS[group],
      metrics: metrics.filter((metric) => metric.group === group),
    }))
    .filter((entry) => entry.metrics.length > 0);
}

/** Drops a reading outside the plausible range for its metric. */
export function sanePlatformReading(
  key: string,
  value: number | undefined,
): number | undefined {
  const metric = BY_KEY.get(key);
  if (!metric) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < metric.min || value > metric.max) return undefined;
  return value;
}
