import type {
  AuthSession,
  BodyEntry,
  FoodLog,
  Recipe,
  Reminder,
  SupplementLog,
  UserProfile,
  WaterLog,
  WorkoutLog,
  WorkoutPreset,
} from "@/types/domain";
export const authSession: AuthSession = {
  isAuthenticated: true,
  email: "alex@onerep.app",
  displayName: "Alex",
};
export const profile: UserProfile = {
  name: "Alex",
  goal: "build",
  calorieTarget: 2450,
  proteinTarget: 175,
  waterTargetMl: 2500,
  trainingDays: ["Mon", "Wed", "Fri", "Sat"],
  hasCompletedOnboarding: true,
};
export const foodLogs: FoodLog[] = [
  {
    id: "f1",
    meal: "breakfast",
    name: "Greek yogurt, berries",
    calories: 310,
    protein: 28,
    carbs: 32,
    fat: 8,
    time: "08:10",
  },
  {
    id: "f2",
    meal: "lunch",
    name: "Chicken rice bowl",
    calories: 640,
    protein: 48,
    carbs: 72,
    fat: 18,
    time: "12:42",
  },
  {
    id: "f3",
    meal: "snack",
    name: "Protein shake",
    calories: 190,
    protein: 32,
    carbs: 8,
    fat: 3,
    time: "16:05",
  },
];
export const foods = [
  { name: "Chicken rice bowl", calories: 640, protein: 48, carbs: 72, fat: 18 },
  {
    name: "Greek yogurt, berries",
    calories: 310,
    protein: 28,
    carbs: 32,
    fat: 8,
  },
  { name: "Salmon, potatoes", calories: 710, protein: 46, carbs: 54, fat: 32 },
  { name: "Protein shake", calories: 190, protein: 32, carbs: 8, fat: 3 },
  { name: "Avocado toast", calories: 420, protein: 16, carbs: 46, fat: 20 },
  {
    name: "Egg white omelette",
    calories: 360,
    protein: 34,
    carbs: 12,
    fat: 18,
  },
  { name: "Turkey sandwich", calories: 520, protein: 38, carbs: 58, fat: 15 },
];
export const recipes: Recipe[] = [
  {
    id: "r1",
    name: "Lean bulk bowl",
    servings: 2,
    ingredients: [
      {
        id: "ri1",
        name: "Chicken breast",
        grams: 220,
        calories: 360,
        protein: 68,
        carbs: 0,
        fat: 8,
      },
      {
        id: "ri2",
        name: "Jasmine rice",
        grams: 260,
        calories: 340,
        protein: 7,
        carbs: 74,
        fat: 1,
      },
      {
        id: "ri3",
        name: "Avocado",
        grams: 80,
        calories: 130,
        protein: 2,
        carbs: 7,
        fat: 12,
      },
    ],
  },
];
export const waterLogs: WaterLog[] = [
  { id: "w1", amountMl: 500, time: "08:20" },
  { id: "w2", amountMl: 750, time: "11:45" },
];
export const supplements: SupplementLog[] = [
  { id: "s1", name: "Creatine", dose: "5 g", schedule: "daily", taken: true },
  {
    id: "s2",
    name: "Vitamin D",
    dose: "2000 IU",
    schedule: "daily",
    taken: false,
  },
  {
    id: "s3",
    name: "Caffeine",
    dose: "100 mg",
    schedule: "training",
    taken: false,
  },
];
export const reminders: Reminder[] = [
  { id: "rem1", label: "Drink water", time: "10:00", enabled: true },
  { id: "rem2", label: "Supplements", time: "19:00", enabled: true },
];
export const exercises = [
  "Back squat",
  "Bench press",
  "Deadlift",
  "Barbell row",
  "Overhead press",
  "Romanian deadlift",
  "Pull-up",
  "Incline dumbbell press",
  "Leg press",
  "Lat pulldown",
  "Cable row",
  "Bulgarian split squat",
  "Hip thrust",
  "Hammer curl",
  "Triceps pressdown",
];
export const presets: WorkoutPreset[] = [
  {
    id: "p1",
    name: "Upper strength",
    duration: "48 min",
    focus: "Strength",
    exercises: [
      {
        id: "e1",
        name: "Bench press",
        muscle: "Chest",
        sets: [
          {
            id: "1",
            weight: 80,
            reps: 5,
            rpe: 8,
            restSeconds: 150,
            done: true,
          },
          {
            id: "2",
            weight: 80,
            reps: 5,
            rpe: 8,
            restSeconds: 150,
            done: false,
          },
          {
            id: "3",
            weight: 77.5,
            reps: 6,
            rpe: 8,
            restSeconds: 120,
            done: false,
          },
        ],
      },
      {
        id: "e2",
        name: "Barbell row",
        muscle: "Back",
        sets: [
          {
            id: "4",
            weight: 72.5,
            reps: 8,
            rpe: 7,
            restSeconds: 120,
            done: false,
          },
          {
            id: "5",
            weight: 72.5,
            reps: 8,
            rpe: 8,
            restSeconds: 120,
            done: false,
          },
        ],
      },
    ],
  },
];
export const workoutLogs: WorkoutLog[] = [
  {
    id: "wl1",
    presetName: "Lower strength",
    completedAt: "Jun 28",
    volumeKg: 8420,
    durationMin: 52,
  },
  {
    id: "wl2",
    presetName: "Upper strength",
    completedAt: "Jun 30",
    volumeKg: 6240,
    durationMin: 48,
  },
];
export const bodyEntries: BodyEntry[] = [
  { id: "b1", date: "Jun 10", weightKg: 82.4, waistCm: 86 },
  { id: "b2", date: "Jun 17", weightKg: 81.9, waistCm: 85 },
  { id: "b3", date: "Jun 24", weightKg: 81.2, waistCm: 84.5 },
];
