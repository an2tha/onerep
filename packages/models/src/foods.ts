// Shared food and exercise result types used by both the food microservice
// and the Convex layer.

export type FoodResult = {
  id: string;
  name: string;
  brand?: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FoodDetail = FoodResult & {
  servingGrams: number | null;
  servingLabel: string;
  nutriscoreGrade?: string;
  novaGroup?: number;
  nutrients: NutrientRow[];
  extraNutrients: NutrientRow[];
};

export type NutrientRow = {
  key: string;
  name: string;
  per100g: number;
  unit: string;
  indent?: boolean;
};

export type ExerciseCategory = "strength" | "cardio" | "mobility" | "core";

export type ExerciseResult = {
  id: string;
  name: string;
  category: ExerciseCategory;
  muscle: string;
  description: string;
  sets: string;
  color: string;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};
