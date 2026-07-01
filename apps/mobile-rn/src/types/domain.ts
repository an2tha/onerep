export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodLog = {
  id: string;
  name: string;
  meal: Meal;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
};
export type RecipeIngredient = {
  id: string;
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
export type Recipe = {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
};
export type WaterLog = { id: string; amountMl: number; time: string };
export type SupplementLog = {
  id: string;
  name: string;
  dose: string;
  schedule: "daily" | "training" | "as-needed";
  taken: boolean;
};
export type WorkoutSet = {
  id: string;
  weight: number;
  reps: number;
  rpe?: number;
  restSeconds: number;
  done: boolean;
};
export type WorkoutExercise = {
  id: string;
  name: string;
  muscle: string;
  sets: WorkoutSet[];
};
export type WorkoutPreset = {
  id: string;
  name: string;
  duration: string;
  focus: string;
  exercises: WorkoutExercise[];
};
export type WorkoutLog = {
  id: string;
  presetName: string;
  completedAt: string;
  volumeKg: number;
  durationMin: number;
};
export type BodyEntry = {
  id: string;
  date: string;
  weightKg: number;
  waistCm?: number;
};
export type Reminder = {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
};
export type AuthSession = {
  isAuthenticated: boolean;
  email?: string;
  displayName?: string;
};
export type UserProfile = {
  name: string;
  goal: "lose" | "build" | "maintain" | "perform";
  calorieTarget: number;
  proteinTarget: number;
  waterTargetMl: number;
  trainingDays: string[];
  hasCompletedOnboarding: boolean;
};
