import type { Food, Nutrients, Serving } from "../../core/types.ts";
import type { foods } from "./schema.ts";

export type FoodRow = typeof foods.$inferSelect;

/**
 * Turns Open Food Facts records into the shape the rest of the service speaks.
 *
 * Unlike USDA, this genuinely has arithmetic to do. OFF normalises *every*
 * nutrient to grams per 100 g regardless of what the label said — verified
 * against live records: `sodium_100g: 0.0428` carries `sodium_unit: "g"`, and
 * `vitamin-c_100g: 0.0543` likewise means 54.3 mg. Our {@link Nutrients}
 * declares mg for minerals and mcg for vitamins A and D, so the minerals scale
 * by 1e3 and those two vitamins by 1e6.
 *
 * Getting a factor wrong here is silent: the numbers stay plausible and only
 * the units are nonsense. That is why the scaling is a table rather than
 * open-coded per field, and why it is tested against real published values.
 */

/** Grams (OFF) to the unit {@link Nutrients} declares, per nutrient. */
const SCALE: Record<keyof Nutrients, number> = {
  // Energy is not a mass and is read from a separate field entirely.
  kcal: 1,
  // Macros are grams on both sides.
  protein: 1,
  carbs: 1,
  fat: 1,
  fiber: 1,
  sugar: 1,
  saturatedFat: 1,
  transFat: 1,
  // g -> mg
  sodium: 1_000,
  cholesterol: 1_000,
  potassium: 1_000,
  calcium: 1_000,
  iron: 1_000,
  vitaminC: 1_000,
  // g -> mcg
  vitaminA: 1_000_000,
  vitaminD: 1_000_000,
};

/** The `_100g` key each nutrient is published under. */
const OFF_KEYS: Record<keyof Nutrients, string> = {
  kcal: "energy-kcal_100g",
  protein: "proteins_100g",
  carbs: "carbohydrates_100g",
  fat: "fat_100g",
  fiber: "fiber_100g",
  sugar: "sugars_100g",
  saturatedFat: "saturated-fat_100g",
  transFat: "trans-fat_100g",
  sodium: "sodium_100g",
  cholesterol: "cholesterol_100g",
  potassium: "potassium_100g",
  calcium: "calcium_100g",
  iron: "iron_100g",
  vitaminA: "vitamin-a_100g",
  vitaminC: "vitamin-c_100g",
  vitaminD: "vitamin-d_100g",
};

/** Kilojoules per kilocalorie, for records carrying only `energy_100g`. */
const KJ_PER_KCAL = 4.184;
/** Europe labels salt, not sodium: salt = sodium x 2.5. */
const SALT_TO_SODIUM = 2.5;

/**
 * The nutrient names used by the newer `nutrition.input_sets` block, which
 * drops the `_100g` suffix the legacy `nutriments` map carried.
 */
const SET_KEYS: Record<keyof Nutrients, string> = {
  kcal: "energy-kcal",
  protein: "proteins",
  carbs: "carbohydrates",
  fat: "fat",
  fiber: "fiber",
  sugar: "sugars",
  saturatedFat: "saturated-fat",
  transFat: "trans-fat",
  sodium: "sodium",
  cholesterol: "cholesterol",
  potassium: "potassium",
  calcium: "calcium",
  iron: "iron",
  vitaminA: "vitamin-a",
  vitaminC: "vitamin-c",
  vitaminD: "vitamin-d",
};

/**
 * Mass units seen in the dump, as grams.
 *
 * Everything is normalised to grams first and then scaled by {@link SCALE},
 * so the two input formats share one conversion path.
 *
 * `% DV` and `IU` are deliberately absent. A percentage of a daily value needs
 * a reference intake to invert, and IU is substance-specific — converting
 * either by guess would put a plausible-looking but wrong number on a nutrition
 * label, so those values are dropped as unknown instead.
 */
const MASS_AS_GRAMS: Record<string, number> = {
  g: 1,
  mg: 1e-3,
  "µg": 1e-6,
  "μg": 1e-6,
  mcg: 1e-6,
  ug: 1e-6,
};

export function number(value: unknown): number | null {
  // OFF writes numbers as both JSON numbers and strings depending on vintage.
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

export function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

/**
 * Reads the nutriments block into our units.
 *
 * Absent is not zero: OFF omits a key entirely when a nutrient is unknown, and
 * rendering that as 0 would claim a product is fibre-free when nobody ever
 * measured it.
 */
type NutritionSet = {
  per?: unknown;
  per_unit?: unknown;
  per_quantity?: unknown;
  preparation?: unknown;
  nutrients?: unknown;
};

/**
 * The nutrient tables that describe 100 units of the product as sold, best
 * first.
 *
 * A record routinely carries several sets, and picking one is not enough. Two
 * real cases from the dump:
 *
 * - Coca-Cola has four. The first per-100g set holds nothing but `nova-group`,
 *   while the actual nutrition sits in the per-100ml set. Preferring grams and
 *   stopping there dropped the product entirely.
 * - Nutella has three per-100g sets between them holding the macros, the fibre
 *   and the vitamins. Reading only the first loses the rest.
 *
 * So every usable set is returned in preference order and the caller takes each
 * nutrient from the first set that actually declares it. 100 ml is accepted
 * alongside 100 g: OFF publishes drinks on a volume basis, and rejecting it
 * would strip the nutrition from every beverage in the catalog over a density
 * assumption very close to 1 for the liquids involved.
 */
function usableSets(sets: NutritionSet[]): NutritionSet[] {
  const usable = sets.filter((set) => {
    const unit = typeof set.per_unit === "string" ? set.per_unit.toLowerCase() : null;
    if (number(set.per_quantity) !== 100) return false;
    if (unit !== "g" && unit !== "ml") return false;
    // `prepared` describes the reconstituted product, not what is in the packet.
    if (set.preparation !== undefined && set.preparation !== "as_sold") return false;
    // A set carrying only scoring metadata is not nutrition.
    return countNutrients(set) > 0;
  });

  // Grams before millilitres; otherwise the record's own order.
  return usable.sort((a, b) => unitRank(a) - unitRank(b));
}

function unitRank(set: NutritionSet): number {
  return String(set.per_unit).toLowerCase() === "g" ? 0 : 1;
}

/** How many nutrients we actually care about a set declares. */
function countNutrients(set: NutritionSet): number {
  const table = set.nutrients;
  if (!table || typeof table !== "object") return 0;
  const known = new Set<string>([...Object.values(SET_KEYS), "energy-kj", "salt"]);
  return Object.keys(table as Record<string, unknown>).filter((key) => known.has(key)).length;
}

/** One `{ value, unit }` entry converted to grams, or null if not convertible. */
function grams(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const { value, value_computed, unit } = entry as Record<string, unknown>;
  // `sodium` frequently carries only `value_computed`, derived from salt.
  const raw = number(value) ?? number(value_computed);
  if (raw === null) return null;
  const scale = MASS_AS_GRAMS[typeof unit === "string" ? unit : ""];
  return scale === undefined ? null : raw * scale;
}

/**
 * Reads the newer `nutrition.input_sets` block.
 *
 * Open Food Facts is migrating off the flat `nutriments` map, and a migrated
 * record leaves it empty — Nutella is one. Reading only the legacy map silently
 * discarded those products, which is how a full import kept 21% of the catalog
 * and lost the single most recognisable product in it.
 *
 * Unlike the legacy map, every value here carries its own unit rather than
 * being pre-normalised to grams, so the unit is honoured and anything
 * unconvertible is dropped rather than guessed.
 */
function fromNutritionSets(nutrition: unknown): Nutrients | null {
  if (!nutrition || typeof nutrition !== "object") return null;
  const sets = (nutrition as { input_sets?: unknown }).input_sets;
  if (!Array.isArray(sets)) return null;

  const tables = usableSets(sets as NutritionSet[])
    .map((set) => set.nutrients)
    .filter((table): table is Record<string, unknown> => !!table && typeof table === "object");
  if (tables.length === 0) return null;

  /** The first set that declares this nutrient wins; later ones fill gaps. */
  const first = (name: string): Record<string, unknown> | undefined => {
    for (const table of tables) {
      const entry = table[name];
      if (entry && typeof entry === "object") return entry as Record<string, unknown>;
    }
    return undefined;
  };

  const result = {} as Nutrients;
  for (const key of Object.keys(SET_KEYS) as (keyof Nutrients)[]) {
    if (key === "kcal") continue;
    const value = grams(first(SET_KEYS[key]));
    result[key] = value === null ? null : value * SCALE[key];
  }

  // Energy is not a mass: take kcal directly, else convert the kJ every EU
  // label carries.
  const kcal = first("energy-kcal");
  const kcalValue = number(kcal?.value) ?? number(kcal?.value_computed);
  if (kcalValue !== null) {
    result.kcal = kcalValue;
  } else {
    const kj = first("energy-kj");
    const kjValue = number(kj?.value) ?? number(kj?.value_computed);
    result.kcal = kjValue === null ? null : Math.round((kjValue / KJ_PER_KCAL) * 10) / 10;
  }

  // Salt stands in for sodium on European labels.
  if (result.sodium === null) {
    const salt = grams(first("salt"));
    if (salt !== null) result.sodium = (salt / SALT_TO_SODIUM) * SCALE.sodium;
  }

  return result;
}

export function toNutrients(nutriments: Record<string, unknown>): Nutrients {
  const result = {} as Nutrients;
  for (const key of Object.keys(OFF_KEYS) as (keyof Nutrients)[]) {
    const raw = number(nutriments[OFF_KEYS[key]]);
    result[key] = raw === null ? null : raw * SCALE[key];
  }

  // Energy: prefer the kcal field, fall back to the kJ one every EU label has.
  if (result.kcal === null) {
    const kj = number(nutriments.energy_100g) ?? number(nutriments.energy);
    if (kj !== null) result.kcal = Math.round((kj / KJ_PER_KCAL) * 10) / 10;
  }

  // Sodium: most EU products declare salt instead, so derive when it is absent.
  if (result.sodium === null) {
    const salt = number(nutriments.salt_100g);
    if (salt !== null) result.sodium = (salt / SALT_TO_SODIUM) * SCALE.sodium;
  }

  return result;
}

/**
 * Builds the front-image URL for a product.
 *
 * The dump does not carry `image_front_small_url` — the API computes that. What
 * it has is `images.selected.front.<lang>.rev`, and the URL is assembled from
 * the revision plus a barcode split into 3/3/3/rest, which is how Open Food
 * Facts lays out its image store. Without this every product imports without a
 * picture, which is one of the few things OFF has that USDA does not.
 */
export function imageUrl(record: Record<string, unknown>): string | null {
  const code = text(record.code);
  if (!code) return null;

  const images = record.images;
  const selected = (images as { selected?: unknown } | undefined)?.selected;
  const front = (selected as { front?: unknown } | undefined)?.front;
  if (!front || typeof front !== "object") return null;

  // The product's own language first, then English, then whatever exists.
  const byLanguage = front as Record<string, { rev?: unknown }>;
  const lang = text(record.lang) ?? "";
  const candidate =
    byLanguage[lang] ?? byLanguage.en ?? byLanguage[Object.keys(byLanguage)[0] ?? ""];
  const rev = number(candidate?.rev);
  if (rev === null) return null;

  const language = byLanguage[lang] ? lang : byLanguage.en ? "en" : Object.keys(byLanguage)[0];
  const parts = /^(...)(...)(...)(.*)$/.exec(code);
  const path = parts ? `${parts[1]}/${parts[2]}/${parts[3]}/${parts[4]}` : code;
  return `https://images.openfoodfacts.org/images/products/${path}/front_${language}.${rev}.200.jpg`;
}

/**
 * Reads a product's nutrition from whichever of the two formats carries it.
 *
 * Open Food Facts is mid-migration: older records use the flat `nutriments`
 * map, migrated ones leave it empty and fill `nutrition.input_sets`, and the
 * proportion varies through the dump. Both are read, preferring whichever
 * actually produced values, so the importer does not care which era a record
 * belongs to.
 */
export function readNutrition(record: Record<string, unknown>): Nutrients {
  const legacy =
    record.nutriments && typeof record.nutriments === "object"
      ? toNutrients(record.nutriments as Record<string, unknown>)
      : EMPTY;
  if (hasNutrition(legacy)) return legacy;

  const modern = fromNutritionSets(record.nutrition);
  return modern && hasNutrition(modern) ? modern : legacy;
}

const EMPTY = Object.freeze(
  Object.fromEntries((Object.keys(OFF_KEYS) as (keyof Nutrients)[]).map((k) => [k, null])),
) as Nutrients;

/** A product with no energy and no macros cannot be logged and is dropped. */
export function hasNutrition(nutrients: Nutrients): boolean {
  return (
    nutrients.kcal !== null ||
    nutrients.protein !== null ||
    nutrients.carbs !== null ||
    nutrients.fat !== null
  );
}

export function toFood(row: FoodRow): Food {
  const serving: Serving | null =
    row.servingText || row.servingGrams !== null
      ? { description: row.servingText ?? `${row.servingGrams} g`, grams: row.servingGrams }
      : { description: "100 g", grams: null };

  return {
    id: `off:${row.code}`,
    providerId: "off",
    // The English name is preferred for display where it exists, with the
    // original kept reachable through search either way.
    name: row.nameEn ?? row.name,
    brand: row.brand,
    barcode: row.code,
    ingredients: row.ingredients,
    // OFF is entirely branded packaged product; there is no sub-catalog.
    variant: null,
    serving,
    // OFF publishes one serving per product, never a portion table.
    servings: serving && serving.grams !== null ? [serving] : [],
    nutrients: {
      kcal: row.kcal,
      protein: row.protein,
      carbs: row.carbs,
      fat: row.fat,
      fiber: row.fiber,
      sugar: row.sugar,
      saturatedFat: row.saturatedFat,
      transFat: row.transFat,
      sodium: row.sodium,
      cholesterol: row.cholesterol,
      potassium: row.potassium,
      calcium: row.calcium,
      iron: row.iron,
      vitaminA: row.vitaminA,
      vitaminC: row.vitaminC,
      vitaminD: row.vitaminD,
    },
    imageUrl: row.imageUrl,
  };
}
