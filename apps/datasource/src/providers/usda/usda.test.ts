import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContext } from "../../core/provider.ts";
import { livePath } from "../../core/store.ts";
import { barcodeKey } from "../../core/text.ts";
import { UsdaProvider } from "./index.ts";

const dirs: string[] = [];
const open: UsdaProvider[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "datasource-usda-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const provider of open.splice(0)) provider.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function context(csvDir: string, dataDir: string): BuildContext {
  return {
    dataDir,
    cacheDir: join(dataDir, "cache"),
    log: () => {},
    flag: (name) => (name === "csv-dir" ? csvDir : undefined),
  };
}

/** A miniature FoodData Central release covering each data type. */
async function writeFixture(): Promise<string> {
  const dir = tempDir();
  await Bun.write(
    join(dir, "food.csv"),
    "fdc_id,data_type,description\n" +
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
  const summary = await new UsdaProvider(dataDir).build(context(csvDir, dataDir));

  const provider = new UsdaProvider(dataDir);
  open.push(provider);
  return {
    dataDir,
    summary,
    provider,
    db: new Database(livePath(dataDir, "usda"), { readonly: true }),
  };
}

test("imports only the four catalog data types", async () => {
  const { summary, db } = await importFixture();
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
  expect(summary.primary).toBe(4);
  db.close();
});

test("derives energy from macros when USDA omits it", async () => {
  const { provider } = await importFixture();
  // 10g protein + 20g carbs + 5g fat = 40 + 80 + 45
  expect(provider.byId("7")?.nutrients.kcal).toBe(165);
});

test("drops foods carrying no nutrition at all", async () => {
  const { provider } = await importFixture();
  expect(provider.byId("6")).toBeNull();
});

test("collapses republished GTINs onto the most complete row", async () => {
  const { provider } = await importFixture();
  // fdc 5 repeats fdc 2's GTIN but carries no nutrients, so fdc 2 survives —
  // and an id logged before the import still resolves through the alias.
  expect(provider.byId("5")?.id).toBe("usda:2");
});

test("attaches branded metadata and gram servings", async () => {
  const { provider } = await importFixture();
  const food = provider.byId("2");
  expect(food?.brand).toBe("ACME");
  expect(food?.barcode).toBe("0 - 00012345678905");
  expect(food?.serving).toEqual({ description: "2 chunks", grams: 56 });
  expect(food?.ingredients).toBe("Chicken, salt");
  expect(food?.variant).toBe("branded");
});

test("maps nutrients onto the normalised per-100g shape", async () => {
  const { provider } = await importFixture();
  expect(provider.byId("1")?.nutrients.kcal).toBe(120);
  expect(provider.byId("1")?.nutrients.protein).toBe(22.5);
  expect(provider.byId("2")?.nutrients.sodium).toBe(400);
});

test("falls back to Atwater energy when 1008 is absent", async () => {
  const { provider } = await importFixture();
  expect(provider.byId("3")?.nutrients.kcal).toBe(717);
});

test("stores portions with resolved unit names", async () => {
  const { provider } = await importFixture();
  expect(provider.byId("1")?.servings).toEqual([{ description: "1 cup cup diced", grams: 140 }]);
});

test("borrows a portion for serving text, then falls back to 100 g", async () => {
  const { provider } = await importFixture();
  // A generic food has no serving text of its own, so it takes the portion.
  expect(provider.byId("1")?.serving).toEqual({ description: "1 cup cup diced", grams: 140 });
  // ...and one with neither is described against the basis its nutrients use.
  expect(provider.byId("7")?.serving).toEqual({ description: "1 bar", grams: 40 });
});

test("canonicalises GTINs so UPC and EAN forms resolve alike", async () => {
  const { provider } = await importFixture();
  for (const input of ["012345678905", "0012345678905", "12345678905", "0-0001-2345678905"]) {
    expect(provider.byBarcode(input)?.id).toBe("usda:2");
  }
  expect(barcodeKey("00000")).toBeNull();
  expect(provider.byBarcode("00000")).toBeNull();
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
  const { provider } = await importFixture();
  const results = provider.search("chicken breast", 10);
  expect(results.map((result) => result.item.variant)).toEqual(["foundation", "branded"]);
  // Scores must fall away from the best match for the registry to merge on.
  expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
});

test("returns nothing for a query with no searchable tokens", async () => {
  const { provider } = await importFixture();
  expect(provider.search("   ", 10)).toEqual([]);
  expect(provider.search("!!!", 10)).toEqual([]);
});

test("reports import metadata once a build has landed", async () => {
  const { provider } = await importFixture();
  const stats = provider.stats();
  expect(stats.imported).toBe(true);
  expect(stats.foods).toBe("4");
  expect(stats.imported_at).toBeString();
});

test("reads as not imported before the first build", () => {
  const provider = new UsdaProvider(tempDir());
  open.push(provider);
  expect(provider.stats()).toEqual({ imported: false });
  expect(provider.search("chicken", 10)).toEqual([]);
  expect(provider.byId("1")).toBeNull();
  expect(provider.byBarcode("012345678905")).toBeNull();
});

test("re-importing keeps a rollback copy and swaps the live database", async () => {
  const csvDir = await writeFixture();
  const dataDir = tempDir();
  const provider = new UsdaProvider(dataDir);
  await provider.build(context(csvDir, dataDir));
  await provider.build(context(csvDir, dataDir));
  expect(await Bun.file(join(dataDir, "usda.previous.sqlite")).exists()).toBe(true);
  expect(await Bun.file(join(dataDir, "usda.next.sqlite")).exists()).toBe(false);
});

test("refuses to promote when nutrient ids stop matching", async () => {
  const csvDir = await writeFixture();
  // Simulates a release that renumbers nutrients: the join would silently
  // produce foods with zero macros.
  await Bun.write(
    join(csvDir, "nutrient.csv"),
    "id,name,unit_name,nutrient_nbr\n9001,Energy,KCAL,208\n",
  );
  const dataDir = tempDir();
  await expect(new UsdaProvider(dataDir).build(context(csvDir, dataDir))).rejects.toThrow(
    "nutrient.csv matched only",
  );
  expect(await Bun.file(livePath(dataDir, "usda")).exists()).toBe(false);
});

test("refuses to promote when the source has no usable foods", async () => {
  const csvDir = tempDir();
  await Bun.write(join(csvDir, "food.csv"), "fdc_id,data_type,description\n");
  const dataDir = tempDir();
  await expect(new UsdaProvider(dataDir).build(context(csvDir, dataDir))).rejects.toThrow(
    "no foods parsed",
  );
  expect(await Bun.file(livePath(dataDir, "usda")).exists()).toBe(false);
});

test("requires the csv-dir flag", async () => {
  const dataDir = tempDir();
  await expect(
    new UsdaProvider(dataDir).build({
      dataDir,
      cacheDir: dataDir,
      log: () => {},
      flag: () => undefined,
    }),
  ).rejects.toThrow("--csv-dir");
});
