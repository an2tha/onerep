import {
  assessmentDate,
  type AssessmentInput,
} from "../../../../convex/lib/goalAssessment"

export function assessmentFixture(): AssessmentInput {
  const today = "2026-09-25"
  return {
    today,
    plan: {
      focus: "hypertrophy",
    },
    catalog: {
      press: {
        primaryMuscles: ["chest"],
        secondaryMuscles: ["triceps", "shoulders"],
      },
      squat: {
        primaryMuscles: ["quadriceps", "glutes"],
        secondaryMuscles: ["abdominals"],
      },
      row: {
        primaryMuscles: ["lats", "upper back"],
        secondaryMuscles: ["biceps"],
      },
    },
    workouts: [0, 3, 7, 10, 14, 17, 21, 24].map((days) => ({
      date: assessmentDate(today, -days),
      durationSeconds: 3600,
      exercises: ["press", "squat", "row"].map((id) => ({
        id,
        sets: Array.from({ length: 4 }, () => ({
          completed: true,
          weight: 60,
          reps: 8,
          rir: 2,
        })),
      })),
    })),
    health: Array.from({ length: 28 }, (_, days) => ({
      date: assessmentDate(today, -days),
      provider: "apple_health",
      sleepMinutes: 450,
      restingHeartRateBpm: 55,
      hrvMs: 60,
      steps: 7000,
    })),
    food: [],
    body: [],
    activities: [],
    journal: [],
    proteinTarget: 140,
    paused: false,
    truncated: false,
  }
}
