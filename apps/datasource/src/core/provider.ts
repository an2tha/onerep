import type { Exercise, Food } from "./types.ts";

/**
 * What a provider is.
 *
 * A provider owns exactly one upstream catalog end to end: how it is fetched,
 * the SQLite schema it lands in, and how a row of that schema becomes a
 * {@link Food} or {@link Exercise}. Nothing outside a provider directory may
 * mention its vocabulary. Adding Open Food Facts should mean adding a
 * directory and one line in the registry, and touching nothing else.
 */

export type ProviderKind = "food" | "exercise";

export type Log = (message: string) => void;

export type BuildContext = {
  dataDir: string;
  cacheDir: string;
  log: Log;
  /** Value of a `--name <value>` flag passed to `cli.ts import`. */
  flag: (name: string) => string | undefined;
};

/** Row counts to report, plus the count `promote` validates as non-empty. */
export type BuildSummary = {
  primary: number;
  counts: Record<string, number>;
};

/** One `--flag <value>` a provider's build accepts, for usage text and errors. */
export type BuildFlag = {
  name: string;
  description: string;
  required: boolean;
};

/**
 * Provider-relative relevance, higher is better.
 *
 * Scores are only strictly comparable within a provider — BM25 over USDA and
 * BM25 over Open Food Facts are different scales. Providers normalise to
 * roughly 0..1 so the registry can interleave results, and the registry applies
 * a per-provider weight to express which catalog we would rather show.
 */
export type Ranked<T> = { item: T; score: number };

export interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
  /** Shown to users wherever this provider's content appears. */
  readonly attribution: string;
  readonly buildFlags: readonly BuildFlag[];

  /** Rebuilds this provider's database from upstream and promotes it. */
  build(context: BuildContext): Promise<BuildSummary>;

  /** Import metadata from the live database, or `imported: false`. */
  stats(): { imported: boolean } & Record<string, unknown>;

  /** Drops any open handle to the live database. */
  close(): void;
}

export interface FoodProvider extends Provider {
  readonly kind: "food";
  search(query: string, limit: number): Ranked<Food>[];
  /** `id` is the local part, with the `<provider>:` prefix already stripped. */
  byId(id: string): Food | null;
  byBarcode(barcode: string): Food | null;
}

export interface ExerciseProvider extends Provider {
  readonly kind: "exercise";
  search(query: string, limit: number): Ranked<Exercise>[];
  byId(id: string): Exercise | null;
}

export function isFoodProvider(provider: Provider): provider is FoodProvider {
  return provider.kind === "food";
}

export function isExerciseProvider(provider: Provider): provider is ExerciseProvider {
  return provider.kind === "exercise";
}

/**
 * Splits `usda:171077` into its provider and local id. A bare id belongs to no
 * particular provider and is offered to all of them, which is what keeps ids
 * logged before the multi-provider split resolving.
 */
export function parseQualifiedId(value: string): { providerId: string | null; localId: string } {
  const separator = value.indexOf(":");
  if (separator < 0) return { providerId: null, localId: value };
  return {
    providerId: value.slice(0, separator),
    localId: value.slice(separator + 1),
  };
}
