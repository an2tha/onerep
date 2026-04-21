import { z } from "zod";

export const foodSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().min(1, "Product name is required"),
  brands: z.string().optional(),
  categories: z.string().optional(),
  ingredients_text: z.string().optional(),
  nutriscore_grade: z.enum(["a", "b", "c", "d", "e"]).optional(),
  nutriscore_score: z.number().min(-15).max(40).optional(),
  energy_kcal_100g: z.number().optional(),
  proteins_100g: z.number().optional(),
  carbohydrates_100g: z.number().optional(),
  fat_100g: z.number().optional(),
  fiber_100g: z.number().optional(),
  salt_100g: z.number().optional(),
  sugars_100g: z.number().optional(),
  sodium_100g: z.number().optional(),
  saturated_fat_100g: z.number().optional(),
});

export const exerciseSchema = z.object({
  name: z.string().min(1, "Exercise name is required"),
  primaryMuscles: z.array(z.string()).optional(),
  secondaryMuscles: z.array(z.string()).optional(),
  equipment: z.string().optional(),
  category: z.string().optional(),
  force: z.string().optional(),
  level: z.string().optional(),
  instructions: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().max(500, "Search query is too long").optional(),
  grade: z.enum(["a", "b", "c", "d", "e"]).optional(),
  min_score: z.coerce.number().min(-15).max(40).optional(),
  max_score: z.coerce.number().min(-15).max(40).optional(),
  muscle: z.string().optional(),
  equipment: z.string().optional(),
  category: z.string().optional(),
  force: z.string().optional(),
});

export const barcodeSchema = z.object({
  code: z.string().regex(/^\d+$/, "Barcode must be numeric"),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format"),
});

export const idsArraySchema = z.object({
  ids: z
    .string()
    .transform((val) => val.split(",").map((s) => s.trim()))
    .pipe(z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format"))),
});

export const parseValidatedBody = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { data: T; error?: never } | { data?: never; error: z.ZodError } => {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { error: result.error };
  }
  return { data: result.data };
};
