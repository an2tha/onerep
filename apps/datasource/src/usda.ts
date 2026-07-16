import { basename, join } from "node:path";
import { unzipSync } from "fflate";
import type { DatasourceDatabase } from "./database.ts";
import { download, finite, plausible } from "./common.ts";
import type { UsdaFood } from "./models.ts";

const DOWNLOADS_PAGE = "https://fdc.nal.usda.gov/download-datasets/";
const DATASET_PATTERNS = {
  foundation: /href="([^"]*FoodData_Central_foundation_food_json_[^"]+\.zip)"/i,
  survey: /href="([^"]*FoodData_Central_survey_food_json_[^"]+\.zip)"/i,
  legacy: /href="([^"]*FoodData_Central_sr_legacy_food_json_[^"]+\.zip)"/i,
} as const;

type RawNutrient = { amount?: number; nutrient?: { id?: number; name?: string; unitName?: string } };
type RawFood = { fdcId?: number; dataType?: string; description?: string; brandOwner?: string; brandName?: string; foodCategory?: { description?: string }; foodNutrients?: RawNutrient[]; foodPortions?: Array<{ amount?: number; gramWeight?: number; modifier?: string; measureUnit?: { name?: string; abbreviation?: string } }> };

function nutrientMap(rows: RawNutrient[] | undefined) {
  const result = new Map<string, { value: number; unit: string }>();
  for (const row of rows ?? []) {
    const name = row.nutrient?.name?.toLowerCase(); const value = finite(row.amount); if (!name || value === undefined) continue;
    const item = { value, unit: row.nutrient?.unitName ?? "" };
    result.set(`${name}|${item.unit.toLowerCase()}`, item);
    if (!result.has(name)) result.set(name, item);
  }
  return result;
}

function findNutrient(map: Map<string, { value: number; unit: string }>, names: string[], unit?: string): number | undefined {
  for (const name of names) { const exact = map.get(unit ? `${name}|${unit.toLowerCase()}` : name); if (exact) return exact.value; }
}

export function normalizeUsdaFood(raw: RawFood): UsdaFood | null {
  if (!Number.isInteger(raw.fdcId) || !raw.description?.trim()) return null;
  const nutrients = nutrientMap(raw.foodNutrients);
  const allNutrients = Object.fromEntries(nutrients);
  return {
    fdcId: raw.fdcId!, dataType: raw.dataType ?? "unknown", name: raw.description.trim(), brand: raw.brandOwner ?? raw.brandName,
    category: raw.foodCategory?.description,
    calories100g: plausible(findNutrient(nutrients, ["energy (atwater general factors)", "energy", "energy (atwater specific factors)"], "kcal"), 1000),
    protein100g: plausible(findNutrient(nutrients, ["protein"]), 100), carbs100g: plausible(findNutrient(nutrients, ["carbohydrate, by difference"]), 100),
    fat100g: plausible(findNutrient(nutrients, ["total lipid (fat)"]), 100), fiber100g: plausible(findNutrient(nutrients, ["fiber, total dietary"]), 100),
    sugar100g: plausible(findNutrient(nutrients, ["total sugars", "sugars, total including nlea"]), 100), saturatedFat100g: plausible(findNutrient(nutrients, ["fatty acids, total saturated"]), 100),
    sodium100g: plausible(findNutrient(nutrients, ["sodium, na"]), 100_000), nutrients: allNutrients,
    portions: (raw.foodPortions ?? []).flatMap((portion) => { const grams = finite(portion.gramWeight); if (!grams || grams <= 0) return []; return [{ amount: finite(portion.amount) ?? 1, unit: portion.measureUnit?.name ?? portion.measureUnit?.abbreviation ?? portion.modifier ?? "serving", grams }]; }),
  };
}

export async function discoverUsdaUrls(datasets: Array<keyof typeof DATASET_PATTERNS>): Promise<Array<{ dataset: string; url: string }>> {
  const response = await fetch(DOWNLOADS_PAGE); if (!response.ok) throw new Error(`USDA downloads page returned ${response.status}`); const html = await response.text();
  return datasets.map((dataset) => { const match = html.match(DATASET_PATTERNS[dataset]); if (!match?.[1]) throw new Error(`Could not discover current USDA ${dataset} download`); return { dataset, url: new URL(match[1], DOWNLOADS_PAGE).href }; });
}

export async function syncUsda(args: { db: DatasourceDatabase; cacheDir: string; datasets?: Array<"foundation" | "survey" | "legacy"> }): Promise<number> {
  const datasets: Array<keyof typeof DATASET_PATTERNS> = args.datasets?.length ? args.datasets : ["foundation", "survey"];
  const sources = await discoverUsdaUrls(datasets); args.db.reset(); let total = 0;
  const downloads = await Promise.all(sources.map(async (source) => {
    const zipPath = join(args.cacheDir, basename(new URL(source.url).pathname));
    await download(source.url, zipPath);
    return { source, zipPath };
  }));
  for (const { source, zipPath } of downloads) {
    const archive = unzipSync(new Uint8Array(await Bun.file(zipPath).arrayBuffer())); const entry = Object.entries(archive).find(([name]) => name.toLowerCase().endsWith(".json"));
    if (!entry) throw new Error(`No JSON file found in ${zipPath}`);
    const parsed = JSON.parse(new TextDecoder().decode(entry[1])) as { FoundationFoods?: RawFood[]; SurveyFoods?: RawFood[]; SRLegacyFoods?: RawFood[] } | RawFood[];
    const rows = Array.isArray(parsed) ? parsed : (parsed.FoundationFoods ?? parsed.SurveyFoods ?? parsed.SRLegacyFoods ?? []); const batch: UsdaFood[] = [];
    for (const raw of rows) { const food = normalizeUsdaFood(raw); if (!food) continue; batch.push(food); if (batch.length >= 500) { args.db.insertUsda(batch.splice(0)); total += 500; } }
    if (batch.length) { total += batch.length; args.db.insertUsda(batch); }
  }
  args.db.rebuildUsdaSearch(); args.db.setMetadata({ source: "usda", sourceUrls: sources.map((item) => item.url).join(","), builtAt: new Date().toISOString(), rowCount: total, schemaVersion: 1 }); args.db.optimize(); return total;
}
