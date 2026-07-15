export type SourceMetadata = {
  source: "usda" | "openfoodfacts";
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  builtAt: string;
  rowCount: number;
  schemaVersion: number;
};

export type UsdaFood = {
  fdcId: number;
  dataType: string;
  name: string;
  brand?: string;
  category?: string;
  calories100g?: number;
  protein100g?: number;
  carbs100g?: number;
  fat100g?: number;
  fiber100g?: number;
  sugar100g?: number;
  saturatedFat100g?: number;
  sodium100g?: number;
  nutrients?: Record<string, { value: number; unit: string }>;
  portions?: Array<{ amount: number; unit: string; grams: number }>;
};

export type BarcodeProduct = {
  barcode: string;
  name: string;
  brand?: string;
  quantity?: string;
  servingSize?: string;
  calories100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  fiber100g?: number;
  sugar100g?: number;
  saturatedFat100g?: number;
  sodium100g?: number;
  countryCodes?: string;
  language?: string;
  imageUrl?: string;
  completeness: number;
  updatedAt?: number;
};
