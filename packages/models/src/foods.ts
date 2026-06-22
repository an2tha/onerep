// Shared food and exercise result types used by both the food microservice
// and the Convex layer.

export type OpenFoodFactsNutriments = Record<
  string,
  string | number | null | undefined
>;

export type OpenFoodFactsImageSet = {
  front?: {
    display?: Record<string, string>;
    small?: Record<string, string>;
    thumb?: Record<string, string>;
  };
};

export type OpenFoodFactsProduct = {
  code: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: string | number;
  image_url?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  image_front_thumb_url?: string;
  selected_images?: OpenFoodFactsImageSet;
  nutriments?: OpenFoodFactsNutriments;
  nutriscore_grade?: string;
  nova_group?: string | number;
};

export type FoodResult = {
  id: string;
  source: "openfoodfacts";
  code: string;
  name: string;
  brand?: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  imageUrl?: string;
  openFoodFacts: OpenFoodFactsProduct;
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
