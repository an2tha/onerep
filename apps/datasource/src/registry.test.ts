import { expect, test } from "bun:test";
import type {
  BuildSummary,
  ExerciseProvider,
  FoodProvider,
  Ranked,
} from "./core/provider.ts";
import { EMPTY_NUTRIENTS, type Exercise, type Food } from "./core/types.ts";
import { Registry } from "./registry.ts";

function food(providerId: string, localId: string, name: string): Food {
  return {
    id: `${providerId}:${localId}`,
    providerId,
    name,
    brand: null,
    barcode: null,
    ingredients: null,
    variant: null,
    serving: null,
    servings: [],
    nutrients: EMPTY_NUTRIENTS,
    imageUrl: null,
  };
}

/** A food provider backed by a fixed list, so routing is tested, not SQLite. */
class FakeFoods implements FoodProvider {
  readonly kind = "food" as const;
  readonly attribution: string;
  readonly buildFlags = [];
  closed = false;

  constructor(
    readonly id: string,
    private readonly items: { localId: string; name: string; score: number; barcode?: string }[],
  ) {
    this.attribution = `${id} attribution`;
  }

  build(): Promise<BuildSummary> {
    return Promise.resolve({ primary: this.items.length, counts: {} });
  }

  stats() {
    return { imported: true };
  }

  close(): void {
    this.closed = true;
  }

  search(query: string, limit: number): Ranked<Food>[] {
    return this.items
      .filter((item) => item.name.includes(query))
      .slice(0, limit)
      .map((item) => ({ item: food(this.id, item.localId, item.name), score: item.score }));
  }

  byId(id: string): Food | null {
    const found = this.items.find((item) => item.localId === id);
    return found ? food(this.id, found.localId, found.name) : null;
  }

  byBarcode(barcode: string): Food | null {
    const found = this.items.find((item) => item.barcode === barcode);
    return found ? food(this.id, found.localId, found.name) : null;
  }
}

class FakeExercises implements ExerciseProvider {
  readonly kind = "exercise" as const;
  readonly attribution = "fake exercises";
  readonly buildFlags = [];

  constructor(readonly id: string) {}

  build(): Promise<BuildSummary> {
    return Promise.resolve({ primary: 1, counts: {} });
  }

  stats() {
    return { imported: true };
  }

  close(): void {}

  search(): Ranked<Exercise>[] {
    return [];
  }

  byId(id: string): Exercise | null {
    return id === "1" ? ({ id: `${this.id}:1`, providerId: this.id } as Exercise) : null;
  }
}

test("rejects two providers claiming the same id", () => {
  expect(() => new Registry([new FakeFoods("usda", []), new FakeFoods("usda", [])])).toThrow(
    "duplicate provider id",
  );
});

test("separates providers by kind", () => {
  const registry = new Registry([new FakeFoods("usda", []), new FakeExercises("wger")]);
  expect(registry.foodProviders().map((p) => p.id)).toEqual(["usda"]);
  expect(registry.exerciseProviders().map((p) => p.id)).toEqual(["wger"]);
});

test("routes a qualified id to the provider that owns it", () => {
  const registry = new Registry([
    new FakeFoods("usda", [{ localId: "1", name: "chicken", score: 0.9 }]),
    new FakeFoods("off", [{ localId: "1", name: "off chicken", score: 0.9 }]),
  ]);
  expect(registry.foodById("usda:1")?.name).toBe("chicken");
  expect(registry.foodById("off:1")?.name).toBe("off chicken");
});

test("returns nothing for a qualified id whose provider is not registered", () => {
  const registry = new Registry([new FakeFoods("usda", [{ localId: "1", name: "x", score: 1 }])]);
  expect(registry.foodById("nope:1")).toBeNull();
});

test("offers a bare id to every provider, so pre-split ids still resolve", () => {
  // Ids logged before the multi-provider split carry no prefix at all.
  const registry = new Registry([
    new FakeFoods("usda", []),
    new FakeFoods("off", [{ localId: "77", name: "off only", score: 1 }]),
  ]);
  expect(registry.foodById("77")?.name).toBe("off only");
});

test("takes the first provider that recognises a barcode", () => {
  const registry = new Registry([
    new FakeFoods("usda", [{ localId: "1", name: "usda tin", score: 1, barcode: "123" }]),
    new FakeFoods("off", [{ localId: "2", name: "off tin", score: 1, barcode: "123" }]),
  ]);
  expect(registry.foodByBarcode("123")?.name).toBe("usda tin");
  expect(registry.foodByBarcode("999")).toBeNull();
});

test("passes a single provider's ranking through untouched", () => {
  const registry = new Registry([
    new FakeFoods("usda", [
      { localId: "1", name: "a chicken", score: 0.2 },
      { localId: "2", name: "b chicken", score: 0.9 },
    ]),
  ]);
  // Already ordered by the provider; the registry must not re-sort it.
  expect(registry.searchFoods("chicken", 10).map((f) => f.id)).toEqual(["usda:1", "usda:2"]);
});

test("interleaves several providers by score", () => {
  const registry = new Registry([
    new FakeFoods("usda", [
      { localId: "1", name: "chicken one", score: 0.9 },
      { localId: "2", name: "chicken two", score: 0.3 },
    ]),
    new FakeFoods("off", [{ localId: "9", name: "chicken nine", score: 0.6 }]),
  ]);
  expect(registry.searchFoods("chicken", 10).map((f) => f.id)).toEqual([
    "usda:1",
    "off:9",
    "usda:2",
  ]);
});

test("ranks on match quality, not on which catalog a result came from", () => {
  // No provider carries a discount. The generic-vs-branded difference is
  // already priced into the tier prior each provider applies to its own score,
  // so a second thumb on the scale here only buries better matches: an 0.85
  // multiplier was enough to put USDA's "Nutella sandwich on white bread" above
  // Open Food Facts' actual Nutella.
  const registry = new Registry([
    new FakeFoods("usda", [{ localId: "1", name: "nutella sandwich", score: 0.8 }]),
    new FakeFoods("off", [{ localId: "9", name: "nutella", score: 0.87 }]),
  ]);
  expect(registry.searchFoods("nutella", 10).map((f) => f.id)).toEqual(["off:9", "usda:1"]);
});

test("orders a mixed result set purely by score", () => {
  const registry = new Registry([
    new FakeFoods("usda", [
      { localId: "1", name: "chicken a", score: 0.95 },
      { localId: "2", name: "chicken b", score: 0.4 },
    ]),
    new FakeFoods("off", [{ localId: "9", name: "chicken c", score: 0.7 }]),
  ]);
  expect(registry.searchFoods("chicken", 10).map((f) => f.id)).toEqual([
    "usda:1",
    "off:9",
    "usda:2",
  ]);
});

test("honours the limit across providers", () => {
  const registry = new Registry([
    new FakeFoods("usda", [{ localId: "1", name: "chicken one", score: 0.9 }]),
    new FakeFoods("off", [{ localId: "9", name: "chicken nine", score: 0.6 }]),
  ]);
  expect(registry.searchFoods("chicken", 1).map((f) => f.id)).toEqual(["usda:1"]);
});

test("reports every provider's kind, attribution and import state", () => {
  const registry = new Registry([new FakeFoods("usda", []), new FakeExercises("wger")]);
  expect(registry.stats()).toEqual({
    usda: { kind: "food", attribution: "usda attribution", imported: true },
    wger: { kind: "exercise", attribution: "fake exercises", imported: true },
  });
});

test("closes every provider", () => {
  const usda = new FakeFoods("usda", []);
  new Registry([usda]).close();
  expect(usda.closed).toBe(true);
});
