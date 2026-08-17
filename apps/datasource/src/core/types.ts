/**
 * The shapes every provider must produce.
 *
 * Nothing downstream of a provider knows what an `fdc_id` is, that USDA
 * publishes four rows per GTIN, or that wger writes its descriptions in HTML.
 * A provider's whole job is to turn its own vocabulary into these types; the
 * server, the registry and the wire format only ever see what's below.
 */

/** Per 100 g, in the units named. Null means the provider had no value. */
export type Nutrients = {
  /** kcal */ kcal: number | null;
  /** g */ protein: number | null;
  /** g */ carbs: number | null;
  /** g */ fat: number | null;
  /** g */ fiber: number | null;
  /** g */ sugar: number | null;
  /** g */ saturatedFat: number | null;
  /** g */ transFat: number | null;
  /** mg */ sodium: number | null;
  /** mg */ cholesterol: number | null;
  /** mg */ potassium: number | null;
  /** mg */ calcium: number | null;
  /** mg */ iron: number | null;
  /** mcg */ vitaminA: number | null;
  /** mg */ vitaminC: number | null;
  /** mcg */ vitaminD: number | null;
};

export const NUTRIENT_KEYS = [
  "kcal",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "saturatedFat",
  "transFat",
  "sodium",
  "cholesterol",
  "potassium",
  "calcium",
  "iron",
  "vitaminA",
  "vitaminC",
  "vitaminD",
] as const satisfies readonly (keyof Nutrients)[];

export const EMPTY_NUTRIENTS: Nutrients = Object.fromEntries(
  NUTRIENT_KEYS.map((key) => [key, null]),
) as Nutrients;

/** A human-readable portion and its mass, when the provider knows the mass. */
export type Serving = { description: string; grams: number | null };

export type Food = {
  /** Provider-qualified and globally unique, e.g. `usda:171077`. */
  id: string;
  providerId: string;
  name: string;
  brand: string | null;
  /** As the provider published it, separators and all. */
  barcode: string | null;
  ingredients: string | null;
  /**
   * The provider's own sub-catalog, where it has one — USDA's `foundation` vs
   * `branded`. Surfaced for display and debugging, never dispatched on.
   */
  variant: string | null;
  /** The serving a client should default to. */
  serving: Serving | null;
  /** Every other portion the provider knows, smallest first. */
  servings: Serving[];
  nutrients: Nutrients;
  imageUrl: string | null;
};

export type ExerciseImage = {
  url: string;
  thumbnailUrl: string | null;
  isMain: boolean;
  isAiGenerated: boolean;
  licenseAuthor: string | null;
};

export type Exercise = {
  id: string;
  providerId: string;
  /**
   * The provider's own stable identifier, where it publishes one distinct from
   * its numeric id — wger's uuid survives renumbering, so clients hold onto it.
   */
  uuid: string | null;
  name: string;
  category: string | null;
  description: string | null;
  equipment: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  images: ExerciseImage[];
  videos: string[];
  /**
   * wger's catalog is CC-BY-SA 4.0 and Open Food Facts is ODbL, so these ride
   * along with the content and must reach anything that displays it.
   */
  license: string | null;
  licenseAuthor: string | null;
};
