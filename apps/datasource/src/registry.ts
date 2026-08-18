import {
  isExerciseProvider,
  isFoodProvider,
  parseQualifiedId,
  type ExerciseProvider,
  type FoodProvider,
  type Provider,
} from "./core/provider.ts";
import type { Exercise, Food } from "./core/types.ts";
import { OpenFoodFactsProvider } from "./providers/off/index.ts";
import { UsdaProvider } from "./providers/usda/index.ts";
import { WgerProvider } from "./providers/wger/index.ts";

/**
 * The one place that knows which providers exist.
 *
 * Everything above this file addresses catalogs by kind ("search foods") and
 * everything below it knows only its own upstream. Adding a catalog is a
 * directory under `providers/` and a line in {@link createRegistry}.
 */

/**
 * Multiplies a provider's self-reported relevance when results from several
 * catalogs are merged. Scores are only strictly comparable within a provider,
 * so this is the knob that says which catalog we would rather show when two of
 * them are equally confident — not a correction for scale.
 */
const WEIGHTS: Record<string, number> = {
  usda: 1,
  // Deliberately 1, not a discount.
  //
  // The quality difference that matters is generic-vs-branded, and the tier
  // prior in core/ranking.ts already encodes it: USDA's branded rows and every
  // Open Food Facts row carry the same penalty, so they compete on how well
  // they match. USDA branded is manufacturer label data exactly like OFF, so
  // there is nothing left to prefer it for.
  //
  // A discount here is also far blunter than it looks, because these scores are
  // already squashed into roughly 0.65..0.99 — an 0.85 multiplier was enough to
  // put USDA's "Nutella sandwich on white bread" above Open Food Facts' actual
  // Nutella. Tune the tier prior instead; it is in interpretable units.
  off: 1,
};

export function createRegistry(dataDir: string): Registry {
  return new Registry([
    new UsdaProvider(dataDir),
    new OpenFoodFactsProvider(dataDir),
    new WgerProvider(dataDir),
  ]);
}

export class Registry {
  constructor(readonly providers: Provider[]) {
    const seen = new Set<string>();
    for (const provider of providers) {
      if (seen.has(provider.id)) throw new Error(`duplicate provider id: ${provider.id}`);
      seen.add(provider.id);
    }
  }

  get(id: string): Provider | undefined {
    return this.providers.find((provider) => provider.id === id);
  }

  foodProviders(): FoodProvider[] {
    return this.providers.filter(isFoodProvider);
  }

  exerciseProviders(): ExerciseProvider[] {
    return this.providers.filter(isExerciseProvider);
  }

  searchFoods(query: string, limit: number): Food[] {
    return merge(
      this.foodProviders().map((provider) => provider.search(query, limit)),
      limit,
    );
  }

  searchExercises(query: string, limit: number): Exercise[] {
    return merge(
      this.exerciseProviders().map((provider) => provider.search(query, limit)),
      limit,
    );
  }

  /**
   * Resolves `usda:171077` against the provider that owns it. A bare id has no
   * provider prefix and is offered to every food provider in turn, which keeps
   * ids logged before the multi-provider split resolving.
   */
  foodById(id: string): Food | null {
    return this.resolve(this.foodProviders(), id, (provider, localId) => provider.byId(localId));
  }

  foodByBarcode(barcode: string): Food | null {
    for (const provider of this.foodProviders()) {
      const found = provider.byBarcode(barcode);
      if (found) return found;
    }
    return null;
  }

  exerciseById(id: string): Exercise | null {
    return this.resolve(this.exerciseProviders(), id, (provider, localId) =>
      provider.byId(localId),
    );
  }

  private resolve<P extends Provider, T>(
    providers: P[],
    id: string,
    lookup: (provider: P, localId: string) => T | null,
  ): T | null {
    const { providerId, localId } = parseQualifiedId(id);
    if (providerId !== null) {
      const provider = providers.find((candidate) => candidate.id === providerId);
      return provider ? lookup(provider, localId) : null;
    }
    for (const provider of providers) {
      const found = lookup(provider, localId);
      if (found) return found;
    }
    return null;
  }

  stats(): Record<string, unknown> {
    return Object.fromEntries(
      this.providers.map((provider) => [
        provider.id,
        { kind: provider.kind, attribution: provider.attribution, ...provider.stats() },
      ]),
    );
  }

  close(): void {
    for (const provider of this.providers) provider.close();
  }
}

function merge<T extends { providerId: string }>(
  results: { item: T; score: number }[][],
  limit: number,
): T[] {
  // Exercises still come from a single provider, and a lone provider has
  // already ranked its own results — re-sorting them would only risk perturbing
  // a correct order for nothing.
  if (results.length === 1) return results[0]!.map((entry) => entry.item).slice(0, limit);

  return results
    .flat()
    .map((entry) => ({ ...entry, score: entry.score * (WEIGHTS[entry.item.providerId] ?? 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}
