export type CompletedSet = {
  weight: string;
  reps: string;
  leftReps: string;
  rightReps: string;
  rpe: string;
  completed: boolean;
};

export type CardioDistanceUnit = "km" | "mi";

export type CardioSourceProvider =
  | "manual"
  | "apple_health"
  | "strava"
  | "garmin"
  | "fitbit"
  | "gpx"
  | "other";

export type HeartRateZones = {
  zone1Seconds?: number;
  zone2Seconds?: number;
  zone3Seconds?: number;
  zone4Seconds?: number;
  zone5Seconds?: number;
};

export type CardioWorkoutDetails = {
  distanceMeters?: number;
  distanceUnit?: CardioDistanceUnit;
  durationSeconds?: number;
  paceSecondsPerKm?: number;
  avgHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  heartRateZones?: HeartRateZones;
  route?: {
    name?: string;
    url?: string;
  };
  source?: {
    provider: CardioSourceProvider;
    name?: string;
    externalId?: string;
    importedAt?: string;
  };
  notes?: string;
};

export type CompletedExercise = {
  exerciseId: string;
  id?: string;
  name: string;
  category?: string;
  trackRpe: boolean;
  trackUnilateral: boolean;
  sets: CompletedSet[];
  cardio?: CardioWorkoutDetails;
};

export type WorkoutLog = {
  /** ISO date string YYYY-MM-DD */
  date: string;
  userId: string;
  exercises: CompletedExercise[];
  durationSeconds: number;
  completedAt: Date;
};
