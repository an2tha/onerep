import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toCompatProduct, type FoodRow } from "./compat.ts";
import { livePath } from "./db.ts";
import { barcodeKey, SEARCH_SQL, searchParams } from "./search.ts";
import { importUsda } from "./usda.ts";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "datasource-usda-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A miniature FoodData Central release covering each data type. */
async function writeFixture(): Promise<string> {
  const dir = tempDir();
  await Bun.write(
    join(dir, "food.csv"),
    'fdc_id,data_type,description\n' +
      '1,foundation_food,"Chicken, breast, raw"\n' +
      "2,branded_food,Chicken Breast Chunks\n" +
      "3,sr_legacy_food,Butter\n" +
      "4,sample_food,Ignored Sample\n" +
      "5,branded_food,Chicken Breast Chunks\n" +
      "6,branded_food,Empty Mystery Product\n" +
      "7,branded_food,Macros Only Bar\n",
  );
  await Bun.write(
    join(dir, "branded_food.csv"),
    "fdc_id,brand_owner,brand_name,gtin_upc,ingredients,serving_size,serving_size_unit," +
      "household_serving_fulltext\n" +
      '2,Acme Foods,ACME,"0 - 00012345678905","Chicken, salt",56,g,2 chunks\n' +
      "5,Acme Foods,ACME,012345678905,Chicken,56,g,2 chunks\n" +
      "6,Ghost Foods,GHOST,999999999991,,,,\n" +
      "7,Bar Co,BARCO,999999999992,Oats,40,g,1 bar\n",
  );
  // nutrient_nbr deliberately carries USDA's legacy SR numbering, which
  // differs from the id that food_nutrient.nutrient_id actually joins on.
  const nutrients = Object.entries({
    "1008": ["Energy", "KCAL", "208"],
    "1003": ["Protein", "G", "203"],
    "1004": ["Total lipid (fat)", "G", "204"],
    "1005": ["Carbohydrate, by difference", "G", "205"],
    "1079": ["Fiber, total dietary", "G", "291"],
    "2000": ["Sugars, total", "G", "269"],
    "1258": ["Fatty acids, total saturated", "G", "606"],
    "1257": ["Fatty acids, total trans", "G", "605"],
    "1093": ["Sodium, Na", "MG", "307"],
    "1253": ["Cholesterol", "MG", "601"],
    "1092": ["Potassium, K", "MG", "306"],
    "1087": ["Calcium, Ca", "MG", "301"],
    "1089": ["Iron, Fe", "MG", "303"],
    "1106": ["Vitamin A, RAE", "UG", "320"],
    "1162": ["Vitamin C", "MG", "401"],
    "1114": ["Vitamin D (D2 + D3)", "UG", "328"],
    "2047": ["Energy (Atwater General)", "KCAL", "957"],
  })
    .map(([id, [name, unit, nbr]]) => `${id},"${name}",${unit},${nbr}`)
    .join("\n");
  await Bun.write(join(dir, "nutrient.csv"), `id,name,unit_name,nutrient_nbr\n${nutrients}\n`);
  await Bun.write(
    join(dir, "food_nutrient.csv"),
    "id,fdc_id,nutrient_id,amount\n" +
      "10,1,1008,120\n" +
      "11,1,1003,22.5\n" +
      "12,2,1008,165\n" +
      "13,2,1093,400\n" +
      "14,3,2047,717\n" +
      "15,7,1003,10\n" +
      "16,7,1005,20\n" +
      "17,7,1004,5\n",
  );
  await Bun.write(
    join(dir, "food_portion.csv"),
    "id,fdc_id,amount,measure_unit_id,portion_description,modifier,gram_weight\n" +
      "20,1,1,1000,,cup diced,140\n" +
      "21,3,1,1001,1 tbsp,,14.2\n",
  );
  await Bun.write(join(dir, "measure_unit.csv"), "id,name\n1000,cup\n1001,tbsp\n");
  return dir;
}

async function importFixture() {
  const csvDir = await writeFixture();
  const dataDir = tempDir();
  const result = await importUsda({ csvDir, dataDir });
  return { dataDir, result, db: new Database(livePath(dataDir, "usda"), { readonly: true }) };
}

test("imports only the four catalog data types", async () => {
  const { result, db } = await importFixture();
  const names = (db.query("SELECT name FROM foods ORDER BY fdc_id").all() as { name: string }[])
    .map((row) => row.name);
  // The sample_food row is skipped, the duplicate GTIN is collapsed and the
  // product with no nutrition is dropped.
  expect(names).toEqual([
    "Chicken, breast, raw",
    "Chicken Breast Chunks",
    "Butter",
    "Macros Only Bar",
  ]);
  expect(result.foods).toBe(4);
  db.close();
});

test("derives energy from macros when USDA omits it", async () => {
  const { db } = await importFixture();
  // 10g protein + 20g carbs + 5g fat = 40 + 80 + 45
  expect(db.query("SELECT kcal FROM foods WHERE fdc_id = 7").get()).toEqual({ kcal: 165 });
  db.close();
});

test("drops foods carrying no nutrition at all", async () => {
  const { db } = await importFixture();
  expect(db.query("SELECT fdc_id FROM foods WHERE fdc_id = 6").get()).toBeNull();
  db.close();
});

test("collapses republished GTINs onto the most complete row", async () => {
  const { db } = await importFixture();
  // fdc 5 repeats fdc 2's GTIN but carries no nutrients, so fdc 2 survives.
  expect(db.query("SELECT fdc_id FROM foods WHERE fdc_id = 5").get()).toBeNull();
  expect(db.query("SELECT canonical_fdc_id FROM aliases WHERE fdc_id = 5").get()).toEqual({
    canonical_fdc_id: 2,
  });
  db.close();
});

test("attaches branded metadata and gram servings", async () => {
  const { db } = await importFixture();
  const row = db.query("SELECT * FROM foods WHERE fdc_id = 2").get() as FoodRow;
  expect(row.brand).toBe("ACME");
  expect(row.barcode).toBe("0 - 00012345678905");
  expect((row as unknown as { barcode_key: string }).barcode_key).toBe("12345678905");
  expect(row.serving_text).toBe("2 chunks");
  expect(row.serving_grams).toBe(56);
  expect(row.ingredients).toBe("Chicken, salt");
  db.close();
});

test("maps nutrients onto per-100g columns", async () => {
  const { db } = await importFixture();
  const row = db.query("SELECT * FROM foods WHERE fdc_id = 1").get() as FoodRow;
  expect(row.kcal).toBe(120);
  expect(row.protein).toBe(22.5);
  expect(db.query("SELECT sodium FROM foods WHERE fdc_id = 2").get()).toEqual({ sodium: 400 });
  db.close();
});

test("falls back to Atwater energy when 1008 is absent", async () => {
  const { db } = await importFixture();
  expect(db.query("SELECT kcal FROM foods WHERE fdc_id = 3").get()).toEqual({ kcal: 717 });
  db.close();
});

test("stores portions with resolved unit names", async () => {
  const { db } = await importFixture();
  const portions = db
    .query("SELECT amount, unit, gram_weight FROM portions WHERE fdc_id = 1")
    .all() as { amount: number; unit: string; gram_weight: number }[];
  expect(portions).toEqual([{ amount: 1, unit: "cup cup diced", gram_weight: 140 }]);
  db.close();
});

test("canonicalises GTINs so UPC and EAN forms resolve alike", async () => {
  const { db } = await importFixture();
  const lookup = db.query("SELECT fdc_id FROM foods WHERE barcode_key = ?");
  for (const input of ["012345678905", "0012345678905", "12345678905", "0-0001-2345678905"]) {
    expect(lookup.get(barcodeKey(input)!)).toEqual({ fdc_id: 2 });
  }
  db.close();
});

test("never leaves an alias pointing at a dropped food", async () => {
  const { db } = await importFixture();
  const dangling = db
    .query(
      `SELECT count(*) AS n FROM aliases
       WHERE canonical_fdc_id NOT IN (SELECT fdc_id FROM foods)`,
    )
    .get() as { n: number };
  expect(dangling.n).toBe(0);
  db.close();
});

test("ranks the generic food above the branded product", async () => {
  const { db } = await importFixture();
  const rows = db.query(SEARCH_SQL).all(searchParams("chicken breast", 10)!) as FoodRow[];
  expect(rows.map((row) => row.source)).toEqual(["foundation", "branded"]);
  db.close();
});

test("produces the compat product shape", async () => {
  const { db } = await importFixture();
  const row = db.query("SELECT * FROM foods WHERE fdc_id = 2").get() as FoodRow;
  const product = toCompatProduct(row, [{ amount: 2, unit: "chunks", gram_weight: 56 }]);
  expect(product.code).toBe("usda:2");
  expect(product.product_name).toBe("Chicken Breast Chunks");
  expect(product.brands).toBe("ACME");
  expect(product.serving_size).toBe("2 chunks");
  expect(product.serving_quantity).toBe(56);
  expect(product.nutriments["energy-kcal_100g"]).toBe(165);
  expect(product.nutriments.sodium_100g).toBe(400);
  expect(product.nutriments.sodium_unit).toBe("mg");
  // Missing nutrients must be 0 rather than null, as the mobile client expects.
  expect(product.nutriments.proteins_100g).toBe(0);
  db.close();
});

test("re-importing keeps a rollback copy and swaps the live database", async () => {
  const csvDir = await writeFixture();
  const dataDir = tempDir();
  await importUsda({ csvDir, dataDir });
  await importUsda({ csvDir, dataDir });
  expect(await Bun.file(join(dataDir, "usda.previous.sqlite")).exists()).toBe(true);
  expect(await Bun.file(join(dataDir, "usda.next.sqlite")).exists()).toBe(false);
});

test("refuses to promote when nutrient ids stop matching", async () => {
  const csvDir = await writeFixture();
  // Simulates a release that renumbers nutrients: the join would silently
  // produce foods with zero macros.
  await Bun.write(join(csvDir, "nutrient.csv"), "id,name,unit_name,nutrient_nbr\n9001,Energy,KCAL,208\n");
  const dataDir = tempDir();
  await expect(importUsda({ csvDir, dataDir })).rejects.toThrow("nutrient.csv matched only");
  expect(await Bun.file(livePath(dataDir, "usda")).exists()).toBe(false);
});

test("refuses to promote when the source has no usable foods", async () => {
  const csvDir = tempDir();
  await Bun.write(join(csvDir, "food.csv"), "fdc_id,data_type,description\n");
  const dataDir = tempDir();
  await expect(importUsda({ csvDir, dataDir })).rejects.toThrow("no foods parsed");
  expect(await Bun.file(livePath(dataDir, "usda")).exists()).toBe(false);
});
