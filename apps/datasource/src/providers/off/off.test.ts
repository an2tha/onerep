import { afterEach, expect, test } from "bun:test";
import { gzipSync } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContext } from "../../core/provider.ts";
import { livePath } from "../../core/store.ts";
import { OpenFoodFactsProvider } from "./index.ts";
import { imageUrl, readNutrition, toNutrients } from "./normalize.ts";

const dirs: string[] = [];
const open: OpenFoodFactsProvider[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "datasource-off-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const provider of open.splice(0)) provider.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function context(file: string, dataDir: string, limit?: string): BuildContext {
  return {
    dataDir,
    cacheDir: join(dataDir, "cache"),
    log: () => {},
    flag: (name) => (name === "file" ? file : name === "limit" ? limit : undefined),
  };
}

/**
 * Nutella, verbatim from the live API (barcode 3017620422003), trimmed to the
 * fields the importer reads. The nutriment values are real: this is what pins
 * the gram-to-milligram conversion to something OFF actually publishes.
 */
const NUTELLA = {
  code: "3017620422003",
  lang: "fr",
  product_name: "Nutella",
  product_name_en: "Nutella",
  brands: "Ferrero,Nutella",
  serving_size: "15 g",
  serving_quantity: 15,
  image_front_small_url: "https://images.openfoodfacts.org/front_en.200.jpg",
  ingredients_text: "Sucre, huile de palme, NOISETTES 13%",
  ingredients_text_en: "Sugar, palm oil, HAZELNUTS 13%",
  nutriments: {
    "energy-kcal_100g": 539,
    fat_100g: 30.9,
    "saturated-fat_100g": 10.6,
    sugars_100g: 56.3,
    salt_100g: 0.107,
    sodium_100g: 0.0428,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
  },
};

/** A French-only product, to prove the original language is searchable. */
const CHOCOLAT = {
  code: "3045320094008",
  lang: "fr",
  product_name: "Chocolat noir dégustation",
  brands: "Lindt",
  nutriments: { "energy-kcal_100g": 530, proteins_100g: 8, carbohydrates_100g: 34, fat_100g: 40 },
};

/** Fortified cereal: the vitamin and mineral units come from a live record. */
const CEREAL = {
  code: "0016000275911",
  lang: "en",
  product_name: "Cheerios",
  brands: "General Mills",
  nutriments: {
    "energy-kcal_100g": 371.42857142857,
    carbohydrates_100g: 80,
    fat_100g: 5.7142857142857,
    "vitamin-c_100g": 0.0543,
    calcium_100g: 0.5,
    iron_100g: 0.0288,
    "vitamin-a_100g": 0.0005,
    "vitamin-d_100g": 0.0000106,
  },
};

/** Energy only in kilojoules, which is how EU labels are written. */
const KJ_ONLY = {
  code: "5000112637922",
  lang: "en",
  product_name: "Kilojoule Only Drink",
  nutriments: { energy_100g: 180, proteins_100g: 0.5, carbohydrates_100g: 11, fat_100g: 0 },
};

/** No nutrition at all: a skeleton record nobody has photographed. */
const SKELETON = { code: "1111111111111", lang: "en", product_name: "Mystery Item" };
/** No name: unusable and unsearchable. */
const NAMELESS = { code: "2222222222222", nutriments: { "energy-kcal_100g": 100 } };
/** No barcode: cannot be identified. */
const CODELESS = { product_name: "Ghost", nutriments: { "energy-kcal_100g": 100 } };

async function writeDump(records: unknown[], { gzip = false } = {}): Promise<string> {
  const dir = tempDir();
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  const path = join(dir, gzip ? "off.jsonl.gz" : "off.jsonl");
  await Bun.write(path, gzip ? gzipSync(Buffer.from(body)) : body);
  return path;
}

async function importFixture(records: unknown[] = [NUTELLA, CHOCOLAT, CEREAL, KJ_ONLY, SKELETON]) {
  const file = await writeDump(records);
  const dataDir = tempDir();
  const summary = await new OpenFoodFactsProvider(dataDir).build(context(file, dataDir));
  const provider = new OpenFoodFactsProvider(dataDir);
  open.push(provider);
  return { dataDir, summary, provider };
}

// --- unit conversion, the part that fails silently if it is wrong -----------

test("converts OFF's grams into the units the normalised shape declares", () => {
  const nutrients = toNutrients(CEREAL.nutriments);
  // Macros are grams on both sides.
  expect(nutrients.carbs).toBe(80);
  // g -> mg: 0.0543 g of vitamin C is 54.3 mg, a plausible fortified value.
  expect(nutrients.vitaminC).toBeCloseTo(54.3, 6);
  expect(nutrients.calcium).toBeCloseTo(500, 6);
  expect(nutrients.iron).toBeCloseTo(28.8, 6);
  // g -> mcg: 0.0005 g of vitamin A is 500 mcg, not 0.0005 and not 0.5.
  expect(nutrients.vitaminA).toBeCloseTo(500, 6);
  expect(nutrients.vitaminD).toBeCloseTo(10.6, 6);
});

test("reads sodium in milligrams from OFF's grams", () => {
  // 0.0428 g is 42.8 mg. Storing 0.0428 would under-report sodium 1000-fold.
  expect(toNutrients(NUTELLA.nutriments).sodium).toBeCloseTo(42.8, 6);
});

test("derives sodium from salt when only salt is declared", () => {
  // EU labels carry salt, not sodium: salt = sodium x 2.5.
  const nutrients = toNutrients({ salt_100g: 1.25, "energy-kcal_100g": 10 });
  expect(nutrients.sodium).toBeCloseTo(500, 6);
});

test("prefers a declared sodium over one derived from salt", () => {
  const nutrients = toNutrients({ salt_100g: 99, sodium_100g: 0.0428 });
  expect(nutrients.sodium).toBeCloseTo(42.8, 6);
});

test("converts kilojoules to kilocalories when kcal is absent", () => {
  // 180 kJ / 4.184 = 43.0 kcal.
  expect(toNutrients(KJ_ONLY.nutriments).kcal).toBeCloseTo(43, 1);
});

test("treats an absent nutrient as unknown rather than zero", () => {
  // Claiming 0 g of fibre for a product nobody measured is a fabricated fact.
  const nutrients = toNutrients(NUTELLA.nutriments);
  expect(nutrients.fiber).toBeNull();
  expect(nutrients.potassium).toBeNull();
  expect(nutrients.vitaminA).toBeNull();
});

test("parses numbers OFF wrote as strings", () => {
  expect(toNutrients({ "energy-kcal_100g": "250", proteins_100g: "9.5" }).kcal).toBe(250);
  expect(toNutrients({ proteins_100g: "9.5" }).protein).toBe(9.5);
  expect(toNutrients({ proteins_100g: "not a number" }).protein).toBeNull();
});

// --- the newer nutrition.input_sets format ---------------------------------

/**
 * Nutella as it actually appears in the dump (barcode 3017620422003), trimmed.
 * Note `nutriments` is empty: this record has been migrated, and reading only
 * the legacy map is what dropped it — and 78% of the catalog with it.
 */
const NUTELLA_MIGRATED = {
  code: "3017620422003",
  lang: "fr",
  product_name: "Nutella",
  brands: "Ferrero",
  nutriments: {},
  nutrition: {
    input_sets: [
      {
        source: "manufacturer",
        per: "100g",
        per_unit: "g",
        per_quantity: 100,
        preparation: "as_sold",
        nutrients: {
          fat: { value: 30.9, unit: "g" },
          "energy-kj": { value: 2252, unit: "kJ" },
          "energy-kcal": { value: 539, unit: "kcal" },
          salt: { value: 0.107, unit: "g" },
          // Carries only value_computed, as the real record does.
          sodium: { value_computed: 0.0428, unit: "g" },
          sugars: { value: 56.3, unit: "g" },
          proteins: { value: 6.3, unit: "g" },
          carbohydrates: { value: 57.5, unit: "g" },
          "saturated-fat": { value: 10.6, unit: "g" },
        },
      },
      // A per-serving set that must not be mistaken for the 100 g basis.
      {
        per_quantity: 15,
        per_unit: "g",
        source: "manufacturer",
        nutrients: { "energy-kcal": { value: 81, unit: "kcal" }, salt: { value: 0.016, unit: "g" } },
      },
    ],
  },
};

test("reads the migrated nutrition.input_sets format", () => {
  const n = readNutrition(NUTELLA_MIGRATED);
  expect(n.kcal).toBe(539);
  expect(n.fat).toBe(30.9);
  expect(n.protein).toBe(6.3);
  expect(n.carbs).toBe(57.5);
  expect(n.sugar).toBe(56.3);
  expect(n.saturatedFat).toBe(10.6);
  // g -> mg, and taken from value_computed since there is no value.
  expect(n.sodium).toBeCloseTo(42.8, 6);
});

test("takes the per-100g set, never the per-serving one", () => {
  // The serving set says 81 kcal per 15 g. Picking it would under-report the
  // product more than six-fold.
  expect(readNutrition(NUTELLA_MIGRATED).kcal).toBe(539);
});

test("honours each nutrient's own unit rather than assuming grams", () => {
  // The legacy map was pre-normalised to grams; this format is not.
  const n = readNutrition({
    nutrition: {
      input_sets: [
        {
          per_unit: "g",
          per_quantity: 100,
          preparation: "as_sold",
          nutrients: {
            "energy-kcal": { value: 100, unit: "kcal" },
            sodium: { value: 500, unit: "mg" },
            calcium: { value: 0.2, unit: "g" },
            "vitamin-d": { value: 5, unit: "\u00b5g" },
          },
        },
      ],
    },
  });
  expect(n.sodium).toBeCloseTo(500, 6);
  expect(n.calcium).toBeCloseTo(200, 6);
  expect(n.vitaminD).toBeCloseTo(5, 6);
});

test("drops values in units it cannot honestly convert", () => {
  // "% DV" needs a reference intake and IU is substance-specific. A guess here
  // would put a plausible but wrong number on a nutrition label.
  const n = readNutrition({
    nutrition: {
      input_sets: [
        {
          per_unit: "g",
          per_quantity: 100,
          preparation: "as_sold",
          nutrients: {
            "energy-kcal": { value: 100, unit: "kcal" },
            iron: { value: 25, unit: "% DV" },
            "vitamin-d": { value: 400, unit: "IU" },
          },
        },
      ],
    },
  });
  expect(n.iron).toBeNull();
  expect(n.vitaminD).toBeNull();
  expect(n.kcal).toBe(100);
});

test("ignores prepared-only sets, which describe reconstituted product", () => {
  const n = readNutrition({
    nutrition: {
      input_sets: [
        {
          per_unit: "g",
          per_quantity: 100,
          preparation: "prepared",
          nutrients: { "energy-kcal": { value: 40, unit: "kcal" } },
        },
      ],
    },
  });
  expect(n.kcal).toBeNull();
});

test("accepts a per-100ml basis so beverages keep their nutrition", () => {
  const n = readNutrition({
    nutrition: {
      input_sets: [
        {
          per_unit: "ml",
          per_quantity: 100,
          preparation: "as_sold",
          nutrients: { "energy-kcal": { value: 42, unit: "kcal" }, sugars: { value: 10.6, unit: "g" } },
        },
      ],
    },
  });
  expect(n.kcal).toBe(42);
  expect(n.sugar).toBe(10.6);
});

test("prefers whichever format actually carries values", () => {
  // Legacy populated, modern absent.
  expect(readNutrition({ nutriments: { "energy-kcal_100g": 250 } }).kcal).toBe(250);
  // Legacy present but empty, modern populated — the migration case.
  expect(readNutrition(NUTELLA_MIGRATED).kcal).toBe(539);
  // Neither.
  expect(readNutrition({ nutriments: {} }).kcal).toBeNull();
});

test("derives energy from kilojoules when the set omits kcal", () => {
  const n = readNutrition({
    nutrition: {
      input_sets: [
        {
          per_unit: "g",
          per_quantity: 100,
          preparation: "as_sold",
          nutrients: { "energy-kj": { value: 2252, unit: "kJ" } },
        },
      ],
    },
  });
  expect(n.kcal).toBeCloseTo(538.2, 1);
});

test("skips a per-100g set that holds only scoring metadata", () => {
  // Coca-Cola, verbatim in shape: the first per-100g set carries nothing but
  // nova-group, and the real nutrition is on the per-100ml set. Taking the
  // gram set because it is grams dropped the product from the catalog.
  const n = readNutrition({
    code: "5449000000996",
    nutrition: {
      input_sets: [
        { per: "100g", per_quantity: 100, per_unit: "g", preparation: "as_sold", nutrients: { "nova-group": { value: 4, unit: "" } } },
        { per: "100ml", per_quantity: 100, per_unit: "ml", preparation: "as_sold", nutrients: { "energy-kcal": { value: 42, unit: "kcal" }, sugars: { value: 10.6, unit: "g" }, salt: { value: 0.01, unit: "g" } } },
        { per: "serving", per_quantity: 330, per_unit: "ml", preparation: "as_sold", nutrients: { "energy-kcal": { value: 139, unit: "kcal" } } },
      ],
    },
  });
  expect(n.kcal).toBe(42);
  expect(n.sugar).toBe(10.6);
});

test("merges several per-100g sets so no nutrient is left behind", () => {
  // Nutella spreads its macros, fibre and vitamins across three sets. Reading
  // only the first reports the product as having no fibre at all.
  const n = readNutrition({
    nutrition: {
      input_sets: [
        { per_quantity: 100, per_unit: "g", preparation: "as_sold", nutrients: { fat: { value: 30.9, unit: "g" }, "energy-kcal": { value: 539, unit: "kcal" } } },
        { per_quantity: 100, per_unit: "g", preparation: "as_sold", nutrients: { fiber: { value: 3.4, unit: "g" }, "energy-kcal": { value: 999, unit: "kcal" } } },
        { per_quantity: 100, per_unit: "g", preparation: "as_sold", nutrients: { calcium: { value: 0.108, unit: "g" } } },
      ],
    },
  });
  expect(n.fat).toBe(30.9);
  expect(n.fiber).toBe(3.4);
  expect(n.calcium).toBeCloseTo(108, 6);
  // The earlier set wins where two disagree.
  expect(n.kcal).toBe(539);
});

test("builds a front image URL from the dump's image metadata", () => {
  // The dump has no image_front_small_url; it must be assembled from the
  // selected revision and a barcode split into 3/3/3/rest.
  expect(
    imageUrl({ code: "3017620422003", lang: "fr", images: { selected: { front: { en: { rev: 879 } } } } }),
  ).toBe("https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.879.200.jpg");
  // Prefers the product's own language when it has one.
  expect(
    imageUrl({ code: "3017620422003", lang: "fr", images: { selected: { front: { fr: { rev: 12 }, en: { rev: 879 } } } } }),
  ).toContain("front_fr.12.200.jpg");
  // Short codes are not split.
  expect(imageUrl({ code: "12345", lang: "en", images: { selected: { front: { en: { rev: 3 } } } } }))
    .toBe("https://images.openfoodfacts.org/images/products/12345/front_en.3.200.jpg");
  // No image, no guess.
  expect(imageUrl({ code: "3017620422003", images: {} })).toBeNull();
  expect(imageUrl({ images: { selected: { front: { en: { rev: 1 } } } } })).toBeNull();
});

// --- import ----------------------------------------------------------------

test("imports usable products and drops the rest", async () => {
  const { summary } = await importFixture();
  // Nutella, the chocolate, the cereal and the kJ-only drink survive; the
  // skeleton record with no nutrition does not.
  expect(summary.primary).toBe(4);
  expect(summary.counts.scanned).toBe(5);
});

test("drops records with no name or no barcode", async () => {
  const { summary } = await importFixture([NUTELLA, NAMELESS, CODELESS]);
  expect(summary.primary).toBe(1);
});

test("reads a gzipped dump without expanding it first", async () => {
  const file = await writeDump([NUTELLA, CHOCOLAT], { gzip: true });
  const dataDir = tempDir();
  const summary = await new OpenFoodFactsProvider(dataDir).build(context(file, dataDir));
  expect(summary.primary).toBe(2);
});

test("honours --limit for a partial import", async () => {
  const file = await writeDump([NUTELLA, CHOCOLAT, CEREAL]);
  const dataDir = tempDir();
  const summary = await new OpenFoodFactsProvider(dataDir).build(context(file, dataDir, "2"));
  expect(summary.primary).toBe(2);
});

test("collapses a repeated barcode instead of failing the unique index", async () => {
  // The same barcode twice: one skeleton contribution, one complete record.
  const poorer = {
    code: NUTELLA.code,
    lang: "fr",
    product_name: "Nutella",
    nutriments: { proteins_100g: 6.3 },
  };
  const { summary, provider } = await importFixture([poorer, NUTELLA]);
  expect(summary.primary).toBe(1);
  expect(summary.counts.duplicates).toBe(1);

  // The row carrying energy and a serving is the one that survives.
  const food = provider.byId(NUTELLA.code);
  expect(food?.nutrients.kcal).toBe(539);
  expect(food?.serving).toEqual({ description: "15 g", grams: 15 });
});

test("prefers the English name for display, keeping the original searchable", async () => {
  const { provider } = await importFixture([
    {
      code: "4000000000001",
      lang: "fr",
      product_name: "Chocolat noir dégustation",
      product_name_en: "Dark chocolate",
      nutriments: { "energy-kcal_100g": 530 },
    },
  ]);
  // Shown in English, because that is the language the client renders in...
  expect(provider.search("dark chocolate", 10)[0]?.item.name).toBe("Dark chocolate");
  // ...but still reachable by the name actually printed on the packet.
  expect(provider.search("chocolat noir", 10)[0]?.item.name).toBe("Dark chocolate");
});

test("tolerates a few malformed lines but refuses a truncated dump", async () => {
  const dir = tempDir();
  const path = join(dir, "broken.jsonl");
  await Bun.write(path, `${JSON.stringify(NUTELLA)}\n{"code": "broken"\n${JSON.stringify(CHOCOLAT)}`);
  const dataDir = tempDir();
  const summary = await new OpenFoodFactsProvider(dataDir).build(context(path, dataDir));
  expect(summary.primary).toBe(2);
  expect(summary.counts.malformed).toBe(1);
});

test("refuses to promote a dump with nothing usable in it", async () => {
  const file = await writeDump([SKELETON, NAMELESS]);
  const dataDir = tempDir();
  await expect(new OpenFoodFactsProvider(dataDir).build(context(file, dataDir))).rejects.toThrow(
    "no usable products",
  );
  expect(await Bun.file(livePath(dataDir, "off")).exists()).toBe(false);
});

test("requires the file flag and rejects a missing dump", async () => {
  const dataDir = tempDir();
  const base = { dataDir, cacheDir: dataDir, log: () => {} };
  await expect(
    new OpenFoodFactsProvider(dataDir).build({ ...base, flag: () => undefined }),
  ).rejects.toThrow("--file");
  await expect(
    new OpenFoodFactsProvider(dataDir).build({ ...base, flag: () => "/nope/off.jsonl.gz" }),
  ).rejects.toThrow("missing Open Food Facts dump");
});

// --- reading ---------------------------------------------------------------

test("normalises a product into the shared shape", async () => {
  const { provider } = await importFixture();
  const food = provider.byId(NUTELLA.code);
  expect(food?.id).toBe("off:3017620422003");
  expect(food?.providerId).toBe("off");
  expect(food?.brand).toBe("Ferrero");
  expect(food?.barcode).toBe("3017620422003");
  expect(food?.serving).toEqual({ description: "15 g", grams: 15 });
  expect(food?.imageUrl).toBe("https://images.openfoodfacts.org/front_en.200.jpg");
  // English ingredients where contributed, matching the display name.
  expect(food?.ingredients).toBe("Sugar, palm oil, HAZELNUTS 13%");
  expect(food?.nutrients.kcal).toBe(539);
});

test("finds a product by its own language and by English alike", async () => {
  const { provider } = await importFixture();
  // The French-only product must be reachable by its French name...
  expect(provider.search("chocolat noir", 10).map((r) => r.item.barcode)).toEqual([
    CHOCOLAT.code,
  ]);
  // ...and an English-named one by English.
  expect(provider.search("cheerios", 10).map((r) => r.item.barcode)).toEqual([CEREAL.code]);
});

test("resolves a barcode through every published GTIN form", async () => {
  const { provider } = await importFixture();
  for (const input of ["3017620422003", "03017620422003", "3-017620-422003"]) {
    expect(provider.byBarcode(input)?.id).toBe("off:3017620422003");
  }
  expect(provider.byBarcode("00000")).toBeNull();
  expect(provider.byBarcode("9999999999999")).toBeNull();
});

test("resolves an id that lost its leading zero somewhere downstream", async () => {
  const { provider } = await importFixture([{ ...NUTELLA, code: "0016000275911" }]);
  expect(provider.byId("16000275911")?.barcode).toBe("0016000275911");
});

test("reports import metadata once a build has landed", async () => {
  const { provider } = await importFixture();
  const stats = provider.stats();
  expect(stats.imported).toBe(true);
  expect(stats.products).toBe("4");
  expect(stats.imported_at).toBeString();
});

test("reads as not imported before the first build", () => {
  const provider = new OpenFoodFactsProvider(tempDir());
  open.push(provider);
  expect(provider.stats()).toEqual({ imported: false });
  expect(provider.search("nutella", 10)).toEqual([]);
  expect(provider.byId("3017620422003")).toBeNull();
  expect(provider.byBarcode("3017620422003")).toBeNull();
});
