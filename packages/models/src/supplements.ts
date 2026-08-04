import type { OpenFoodFactsProduct } from "./foods";

export type SupplementCategory =
  | "protein"
  | "creatine"
  | "multivitamin"
  | "vitamin_mineral"
  | "electrolyte"
  | "caffeine_pre_workout"
  | "omega_3"
  | "fiber"
  | "other";

export type SupplementForm =
  "capsule" | "tablet" | "powder" | "liquid" | "gummy" | "softgel" | "other";

export type SupplementScheduleType =
  "none" | "daily" | "weekdays" | "training_days" | "rest_days";

export type SupplementSchedule = {
  type: SupplementScheduleType;
  weekdays?: number[];
  preferredTime?: string;
};

export type SupplementNutrients = Partial<
  Record<
    | "calories"
    | "protein"
    | "carbs"
    | "fat"
    | "fiber"
    | "sugar"
    | "saturatedFat"
    | "transFat"
    | "cholesterol"
    | "sodium"
    | "potassium"
    | "calcium"
    | "iron"
    | "magnesium"
    | "phosphorus"
    | "zinc"
    | "vitaminA"
    | "vitaminC"
    | "vitaminD"
    | "vitaminB12"
    | "caffeine"
    | "alcohol"
    | "creatine"
    | "omega3"
    | "epa"
    | "dha",
    number
  >
>;

export type SupplementSource = "manual" | "openfoodfacts";

export type SupplementItem = {
  _id?: string;
  userId?: string;
  name: string;
  brand?: string;
  category: SupplementCategory;
  form: SupplementForm;
  servingLabel: string;
  defaultServingQuantity: number;
  barcode?: string;
  notes?: string;
  active: boolean;
  schedule: SupplementSchedule;
  nutrientsPerServing: SupplementNutrients;
  source: SupplementSource;
  importedOpenFoodFacts?: OpenFoodFactsProduct;
  createdAt?: number;
  updatedAt?: number;
};

export type SupplementIntakeStatus = "taken" | "skipped";

export type SupplementIntakeLog = {
  _id?: string;
  id?: string;
  userId?: string;
  supplementId: string;
  clientId?: string;
  date: string;
  status: SupplementIntakeStatus;
  loggedAt: string;
  servingMultiplier: number;
  servingLabel: string;
  name: string;
  brand?: string;
  category: SupplementCategory;
  nutrients: SupplementNutrients;
  note?: string;
  createdAt?: number;
  updatedAt?: number;
};
