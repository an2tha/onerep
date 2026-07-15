import { DuckDBInstance } from "@duckdb/node-api";
import { join } from "node:path";
import type { DatasourceDatabase } from "./database.ts";
import { download, finite, plausible, sqlString } from "./common.ts";
import type { BarcodeProduct } from "./models.ts";

function columnExpression(columns: Set<string>, candidates: string[], fallback = "NULL"): string {
  const found = candidates.find((candidate) => columns.has(candidate)); return found ? `"${found.replaceAll('"', '""')}"` : fallback;
}
function numeric(columns: Set<string>, candidates: string[]): string {
  const found = candidates.find((candidate) => columns.has(candidate));
  if (found) return `try_cast(${columnExpression(columns, [found])} as double)`;
  const nested = candidates.find((candidate) => candidate.startsWith("nutriments."));
  if (nested && columns.has("nutriments")) {
    const key = nested.slice("nutriments.".length).replaceAll("'", "''");
    return `try_cast(json_extract_string(try_cast("nutriments" as json), '$."${key}"') as double)`;
  }
  return "try_cast(NULL as double)";
}

async function projectParquet(input: string, output: string, countries: string[]): Promise<void> {
  const instance = await DuckDBInstance.create(":memory:", { threads: String(Math.max(1, Math.min(navigator.hardwareConcurrency ?? 4, 8))) }); const connection = await instance.connect();
  const description = await connection.runAndReadAll(`describe select * from read_parquet(${sqlString(input)})`); const columns = new Set(description.getRowObjectsJS().map((row) => String(row.column_name)));
  const code = columnExpression(columns, ["code", "_id", "barcode"]); const name = columnExpression(columns, ["product_name", "product_name_en", "name"]); const country = columnExpression(columns, ["countries_tags", "countries", "country_codes"]);
  const countryFilter = countries.length ? `and (${countries.map((item) => `lower(try_cast(${country} as varchar)) like ${sqlString(`%${item.toLowerCase()}%`)}`).join(" or ")})` : "";
  const sql = `copy (select try_cast(${code} as varchar) as "barcode", try_cast(${name} as varchar) as "name", try_cast(${columnExpression(columns,["brands","brand"])} as varchar) as "brand", try_cast(${columnExpression(columns,["quantity"])} as varchar) as "quantity", try_cast(${columnExpression(columns,["serving_size"])} as varchar) as "serving_size", ${numeric(columns,["nutriments.energy-kcal_100g","energy-kcal_100g","energy_kcal_100g","calories_100g"])} as "calories_100g", ${numeric(columns,["nutriments.proteins_100g","proteins_100g","protein_100g"])} as "protein_100g", ${numeric(columns,["nutriments.carbohydrates_100g","carbohydrates_100g","carbs_100g"])} as "carbs_100g", ${numeric(columns,["nutriments.fat_100g","fat_100g"])} as "fat_100g", ${numeric(columns,["nutriments.fiber_100g","fiber_100g"])} as "fiber_100g", ${numeric(columns,["nutriments.sugars_100g","sugars_100g","sugar_100g"])} as "sugar_100g", ${numeric(columns,["nutriments.saturated-fat_100g","saturated-fat_100g","saturated_fat_100g"])} as "saturated_fat_100g", ${numeric(columns,["nutriments.sodium_100g","sodium_100g"])} as "sodium_100g", try_cast(${country} as varchar) as "country_codes", try_cast(${columnExpression(columns,["lang","language"])} as varchar) as "language", try_cast(${columnExpression(columns,["image_front_small_url","image_url"])} as varchar) as "image_url", try_cast(${columnExpression(columns,["completeness"])} as double) as "completeness", try_cast(${columnExpression(columns,["last_modified_t","updated_at"])} as bigint) as "updated_at" from read_parquet(${sqlString(input)}) where ${code} is not null and ${name} is not null and ${numeric(columns,["nutriments.energy-kcal_100g","energy-kcal_100g","energy_kcal_100g","calories_100g"])} is not null and ${numeric(columns,["nutriments.proteins_100g","proteins_100g","protein_100g"])} is not null and ${numeric(columns,["nutriments.carbohydrates_100g","carbohydrates_100g","carbs_100g"])} is not null and ${numeric(columns,["nutriments.fat_100g","fat_100g"])} is not null ${countryFilter}) to ${sqlString(output)} (format json, array false)`;
  await connection.run(sql); connection.closeSync();
}

async function importProjected(db: DatasourceDatabase, path: string, withSearch: boolean): Promise<number> {
  const batch: BarcodeProduct[] = []; let total = 0; const decoder = new TextDecoder(); let pending = "";
  const processLine = (line: string) => {
    if (!line.trim()) return; const row = JSON.parse(line) as Record<string, unknown>;
    const calories = plausible(finite(row.calories_100g), 1000), protein = plausible(finite(row.protein_100g), 100), carbs = plausible(finite(row.carbs_100g), 100), fat = plausible(finite(row.fat_100g), 100);
    if (calories === undefined || protein === undefined || carbs === undefined || fat === undefined) return;
    const barcode = String(row.barcode ?? "").trim(), name = String(row.name ?? "").trim(); if (!/^\d{8,14}$/.test(barcode) || !name) return;
    batch.push({ barcode, name, brand: row.brand ? String(row.brand) : undefined, quantity: row.quantity ? String(row.quantity) : undefined, servingSize: row.serving_size ? String(row.serving_size) : undefined, calories100g: calories, protein100g: protein, carbs100g: carbs, fat100g: fat, fiber100g: plausible(finite(row.fiber_100g),100), sugar100g: plausible(finite(row.sugar_100g),100), saturatedFat100g: plausible(finite(row.saturated_fat_100g),100), sodium100g: plausible(finite(row.sodium_100g),100), countryCodes: row.country_codes ? String(row.country_codes) : undefined, language: row.language ? String(row.language) : undefined, imageUrl: row.image_url ? String(row.image_url) : undefined, completeness: Math.round((finite(row.completeness) ?? 0) * 100), updatedAt: finite(row.updated_at) });
    if (batch.length >= 1000) { db.insertOff(batch.splice(0), withSearch); total += 1000; }
  };
  for await (const chunk of Bun.file(path).stream()) {
    pending += decoder.decode(chunk, { stream: true });
    let newline = pending.indexOf("\n");
    while (newline >= 0) { processLine(pending.slice(0, newline)); pending = pending.slice(newline + 1); newline = pending.indexOf("\n"); }
  }
  pending += decoder.decode(); if (pending.trim()) processLine(pending);
  if (batch.length) { total += batch.length; db.insertOff(batch, withSearch); } return total;
}

export async function syncOff(args: { db: DatasourceDatabase; cacheDir: string; input?: string; url?: string; countries?: string[]; withSearch?: boolean }): Promise<number> {
  const input = args.input ?? join(args.cacheDir, "openfoodfacts.parquet"); if (args.url) await download(args.url, input); if (!(await Bun.file(input).exists())) throw new Error("OFF Parquet input does not exist");
  const projected = join(args.cacheDir, "openfoodfacts-projected.ndjson"); args.db.reset(); await projectParquet(input, projected, args.countries ?? []); const total = await importProjected(args.db, projected, args.withSearch === true);
  args.db.setMetadata({ source: "openfoodfacts", sourceUrl: args.url ?? input, countries: (args.countries ?? []).join(","), builtAt: new Date().toISOString(), rowCount: total, schemaVersion: 1 }); args.db.optimize(); return total;
}
