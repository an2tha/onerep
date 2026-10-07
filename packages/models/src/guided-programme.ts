/** Serializable programme input and preview shared by the app and backend. */
export type ProgrammeTrack = "nutrition" | "training";
export type ProgrammeStatus = "draft" | "active" | "paused" | "ended";
export interface ProgrammeSettings {
  name: string;
  goal: string;
  weeks: number;
  timezone: string;
  mode: "guided" | "manual";
  diet: string;
  allergies: string[];
  dislikes: string[];
  cookingMinutes: number;
  budget: string;
  mealsPerDay: number;
  daysPerWeek: number;
  sessionMinutes: number;
  experience: string;
  equipment: string[];
  preferredExercises: string[];
  limitations: string;
  baselineCalories: number;
  protein: number;
  fat: number;
  changePercent: number;
  nutritionGoal: "maintain" | "step_down" | "step_up";
  screeningConfirmed: boolean;
}
export interface ProgrammeIngredient {
  name: string;
  grams: number;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
}
export interface ProgrammeRecipe {
  id: string;
  recipeId?: string;
  name: string;
  category: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: ProgrammeIngredient[];
  steps: string[];
}
export interface ProgrammeMeal {
  id: string;
  day: number; // 0..6, repeats weekly
  slot: string;
  recipeId: string; // ProgrammeRecipe.id, not the library id
  servings: number;
}
export interface ProgrammeExercise {
  id: string;
  exerciseId: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  notes: string;
  alternatives: string[];
}
export interface ProgrammeSession {
  id: string;
  name: string;
  dayOfWeek: number; // Sunday = 0
  blockId?: string;
  presetId?: string;
  exercises: ProgrammeExercise[];
}
export interface ProgrammeMesocycle {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  objective: string;
  progression: string;
  deload: boolean;
}
export interface ProgrammePlan {
  summary: string;
  nutrition?: { recipes: ProgrammeRecipe[]; meals: ProgrammeMeal[] };
  training?: { mesocycles: ProgrammeMesocycle[]; sessions: ProgrammeSession[] };
}
export const GUIDED_PROGRAMME_COST = 5;
export const GUIDED_RECIPE_COUNT = 12;
export function defaultProgrammeSettings(timezone = "UTC"): ProgrammeSettings {
  return {
    name: "",
    goal: "Build a consistent routine",
    weeks: 6,
    timezone,
    mode: "guided",
    diet: "No preference",
    allergies: [],
    dislikes: [],
    cookingMinutes: 30,
    budget: "Moderate",
    mealsPerDay: 3,
    daysPerWeek: 3,
    sessionMinutes: 45,
    experience: "beginner",
    equipment: [],
    preferredExercises: [],
    limitations: "",
    baselineCalories: 2200,
    protein: 120,
    fat: 65,
    changePercent: 0,
    nutritionGoal: "maintain",
    screeningConfirmed: false,
  };
}
