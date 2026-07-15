import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const metadata = sqliteTable("metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const foods = sqliteTable("foods", {
  fdcId: integer("fdc_id").primaryKey(), dataType: text("data_type").notNull(), name: text("name").notNull(),
  brand: text("brand"), category: text("category"), calories100g: real("calories_100g"), protein100g: real("protein_100g"),
  carbs100g: real("carbs_100g"), fat100g: real("fat_100g"), fiber100g: real("fiber_100g"), sugar100g: real("sugar_100g"),
  saturatedFat100g: real("saturated_fat_100g"), sodium100g: real("sodium_100g"), nutrientsJson: text("nutrients_json"), portionsJson: text("portions_json"),
});

export const products = sqliteTable("products", {
  barcode: text("barcode").primaryKey(), name: text("name").notNull(), brand: text("brand"), quantity: text("quantity"), servingSize: text("serving_size"),
  calories100g: real("calories_100g").notNull(), protein100g: real("protein_100g").notNull(), carbs100g: real("carbs_100g").notNull(), fat100g: real("fat_100g").notNull(),
  fiber100g: real("fiber_100g"), sugar100g: real("sugar_100g"), saturatedFat100g: real("saturated_fat_100g"), sodium100g: real("sodium_100g"),
  countryCodes: text("country_codes"), language: text("language"), imageUrl: text("image_url"), completeness: integer("completeness").notNull(), updatedAt: integer("updated_at"),
});
