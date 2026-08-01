import { v } from "convex/values";

/**
 * Shared shape of a completed workout entry.
 *
 * Lives here rather than in `logs/workouts.ts` so the Apple Health import path
 * writes exactly the same structure the app already understands.
 */
export const heartRateZonesValidator = v.object({
  zone1Seconds: v.optional(v.number()),
  zone2Seconds: v.optional(v.number()),
  zone3Seconds: v.optional(v.number()),
  zone4Seconds: v.optional(v.number()),
  zone5Seconds: v.optional(v.number()),
});

export const cardioDetailsValidator = v.object({
  distanceMeters: v.optional(v.number()),
  distanceUnit: v.optional(v.union(v.literal("km"), v.literal("mi"))),
  durationSeconds: v.optional(v.number()),
  paceSecondsPerKm: v.optional(v.number()),
  avgHeartRateBpm: v.optional(v.number()),
  maxHeartRateBpm: v.optional(v.number()),
  heartRateZones: v.optional(heartRateZonesValidator),
  route: v.optional(
    v.object({
      name: v.optional(v.string()),
      url: v.optional(v.string()),
    }),
  ),
  source: v.optional(
    v.object({
      provider: v.union(
        v.literal("manual"),
        v.literal("apple_health"),
        v.literal("strava"),
        v.literal("garmin"),
        v.literal("fitbit"),
        v.literal("gpx"),
        v.literal("other"),
      ),
      name: v.optional(v.string()),
      externalId: v.optional(v.string()),
      importedAt: v.optional(v.string()),
    }),
  ),
  notes: v.optional(v.string()),
});

export const completedSetValidator = v.object({
  type: v.string(), // "normal", "warmup", "dropset", "failure"
  reps: v.number(),
  weight: v.number(),
  completed: v.boolean(),
  rpe: v.optional(v.number()),
  rir: v.optional(v.number()),
});

export const completedExerciseValidator = v.object({
  id: v.string(),
  name: v.string(),
  category: v.optional(v.string()),
  sets: v.array(completedSetValidator),
  cardio: v.optional(cardioDetailsValidator),
});
