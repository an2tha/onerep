import type { OpenFoodFactsProduct } from "./foods";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type FoodLogEntry = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedAt: string; // ISO datetime
  meal: MealType;
  // Open Food Facts source metadata — populated when logged via food search
  source?: "openfoodfacts";
  foodCode?: string;
  quantityGrams?: number;
  servingGrams?: number;
  servingLabel?: string;
  imageUrl?: string;
  openFoodFacts?: OpenFoodFactsProduct;
  // Optional micronutrients — populated when logged via food search
  fiber?: number; // g
  sugar?: number; // g
  saturatedFat?: number; // g
  transFat?: number; // g
  cholesterol?: number; // mg
  sodium?: number; // mg
  potassium?: number; // mg
  calcium?: number; // mg
  iron?: number; // mg
  magnesium?: number; // mg
  phosphorus?: number; // mg
  zinc?: number; // mg
  vitaminC?: number; // mg
  vitaminA?: number; // µg
  vitaminD?: number; // µg
  vitaminB12?: number; // µg
  caffeine?: number; // mg
  alcohol?: number; // g
};

export type FoodLogDay = {
  userId: string;
  date: string;
  entries: FoodLogEntry[];
  updatedAt: Date;
};
