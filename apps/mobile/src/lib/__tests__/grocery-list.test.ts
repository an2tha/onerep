import { describe, expect, test } from "bun:test"
import {
  buildGroceryList,
  groceryItemAmount,
  groceryListToText,
  groceryMergeKey,
  guessGroceryCategory,
  ingredientsFromRecipe,
  manualGroceryItem,
  mergeGroceryItems,
  sortGroceryItems,
  toGrams,
  type GroceryItem,
} from "@/lib/grocery-list"
import type { Recipe, RecipeIngredient } from "@/lib/food-log"

function ingredient(
  overrides: Partial<RecipeIngredient> = {}
): RecipeIngredient {
  return {
    id: "i1",
    name: "Chicken breast",
    grams: 200,
    caloriesPer100: 165,
    proteinPer100: 31,
    carbsPer100: 0,
    fatPer100: 3.6,
    ...overrides,
  }
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    name: "Test recipe",
    createdAt: 0,
    servings: 2,
    ingredients: [ingredient()],
    ...overrides,
  } as Recipe
}

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: "x",
    name: "Chicken breast",
    key: "chicken breast",
    grams: 200,
    category: "Protein",
    checked: false,
    ...overrides,
  }
}

describe("groceryMergeKey", () => {
  test("strips quantities, qualifiers and plurals", () => {
    expect(groceryMergeKey("2 large Free-Range Eggs")).toBe(
      groceryMergeKey("eggs")
    )
    expect(groceryMergeKey("eggs")).toBe("egg")
  })

  test("is case and punctuation insensitive", () => {
    expect(groceryMergeKey("Chicken Breast")).toBe(
      groceryMergeKey("chicken-breast")
    )
  })

  test("strips accents so jalapeño matches jalapeno", () => {
    expect(groceryMergeKey("Jalapeño")).toBe(groceryMergeKey("jalapeno"))
  })

  test("keeps distinct foods distinct", () => {
    expect(groceryMergeKey("chicken breast")).not.toBe(
      groceryMergeKey("chicken thigh")
    )
  })

  test("handles irregular plurals", () => {
    expect(groceryMergeKey("tomatoes")).toBe(groceryMergeKey("tomato"))
    expect(groceryMergeKey("bay leaves")).toBe(groceryMergeKey("bay leaf"))
    expect(groceryMergeKey("berries")).toBe(groceryMergeKey("berry"))
  })

  test("a name made only of qualifiers still yields a key", () => {
    expect(groceryMergeKey("large")).toBe("large")
  })

  test("non-string input is safe", () => {
    expect(groceryMergeKey(undefined as never)).toBe("")
  })
})

describe("toGrams", () => {
  test("converts mass units", () => {
    expect(toGrams(1, "kg")).toBe(1000)
    expect(toGrams(500, "g")).toBe(500)
    expect(toGrams(1, "lb")).toBeCloseTo(453.592, 3)
  })

  test("returns null for counts and volumes", () => {
    expect(toGrams(2, "count")).toBeNull()
    expect(toGrams(200, "ml")).toBeNull()
    expect(toGrams(1, "cup")).toBeNull()
  })

  test("rejects non-finite and non-positive amounts", () => {
    expect(toGrams(Number.NaN, "g")).toBeNull()
    expect(toGrams(0, "g")).toBeNull()
    expect(toGrams(-5, "g")).toBeNull()
  })
})

describe("mergeGroceryItems", () => {
  test("sums grams for two lines naming the same food", () => {
    const merged = mergeGroceryItems([
      item({ id: "a", grams: 200 }),
      item({ id: "b", name: "chicken breasts", grams: 300 }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].grams).toBe(500)
  })

  test("keeps grams and millilitres as separate lines", () => {
    const merged = mergeGroceryItems([
      item({ id: "a", name: "Milk", key: "milk", grams: 500 }),
      item({
        id: "b",
        name: "Milk",
        key: "milk",
        grams: undefined,
        displayAmount: 200,
        displayUnit: "ml",
      }),
    ])
    // Adding ml to g would produce a nonsense quantity.
    expect(merged).toHaveLength(2)
  })

  test("sums matching non-mass units", () => {
    const merged = mergeGroceryItems([
      item({
        id: "a",
        name: "Garlic",
        key: "garlic",
        grams: undefined,
        displayAmount: 2,
        displayUnit: "cloves",
      }),
      item({
        id: "b",
        name: "Garlic",
        key: "garlic",
        grams: undefined,
        displayAmount: 3,
        displayUnit: "cloves",
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].displayAmount).toBe(5)
  })

  test("a merged line stays checked only if every source was checked", () => {
    expect(
      mergeGroceryItems([
        item({ id: "a", checked: true }),
        item({ id: "b", checked: true }),
      ])[0].checked
    ).toBe(true)
    expect(
      mergeGroceryItems([
        item({ id: "a", checked: true }),
        item({ id: "b", checked: false }),
      ])[0].checked
    ).toBe(false)
  })

  test("sources are combined and deduplicated", () => {
    const merged = mergeGroceryItems([
      item({ id: "a", sources: ["Chilli"] }),
      item({ id: "b", sources: ["Curry", "Chilli"] }),
    ])
    expect(merged[0].sources?.sort()).toEqual(["Chilli", "Curry"])
  })

  test("malformed input does not throw", () => {
    expect(mergeGroceryItems(undefined as never)).toEqual([])
    expect(mergeGroceryItems([null as never, item()])).toHaveLength(1)
  })
})

describe("ingredientsFromRecipe", () => {
  test("scales ingredients to the servings wanted", () => {
    const scaled = ingredientsFromRecipe(recipe({ servings: 2 }), 4)
    expect(scaled[0].grams).toBe(400)
  })

  test("defaults to the recipe's own serving count", () => {
    expect(ingredientsFromRecipe(recipe({ servings: 2 }))[0].grams).toBe(200)
  })

  test("a zero or missing serving count does not divide by zero", () => {
    expect(ingredientsFromRecipe(recipe({ servings: 0 }), 3)[0].grams).toBe(600)
    expect(
      ingredientsFromRecipe(recipe({ servings: undefined }), 3)[0].grams
    ).toBe(600)
  })

  test("a recipe with no ingredients yields nothing", () => {
    expect(ingredientsFromRecipe(recipe({ ingredients: [] }))).toEqual([])
    expect(
      ingredientsFromRecipe(recipe({ ingredients: undefined as never }))
    ).toEqual([])
  })

  test("the recipe name is carried through as the source", () => {
    expect(
      ingredientsFromRecipe(recipe({ name: "Chilli" }))[0].sourceLabel
    ).toBe("Chilli")
  })
})

describe("buildGroceryList", () => {
  test("merges a shared ingredient across two recipes into one line", () => {
    const { items } = buildGroceryList({
      recipes: [
        { recipe: recipe({ name: "Curry", servings: 1 }) },
        { recipe: recipe({ name: "Stir fry", servings: 1 }) },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0].grams).toBe(400)
    expect(items[0].sources?.sort()).toEqual(["Curry", "Stir fry"])
  })

  test("a batch contributes groceries through its source recipe", () => {
    const source = recipe({ _id: "r1", name: "Chilli", servings: 2 })
    const { items, skippedBatches } = buildGroceryList({
      batches: [
        { sourceRecipeId: "r1", servingsTotal: 6, name: "Chilli batch" },
      ],
      recipesById: new Map([["r1", source]]),
    })
    expect(skippedBatches).toEqual([])
    expect(items[0].grams).toBe(600)
  })

  test("a batch with no resolvable recipe is reported, not dropped silently", () => {
    const { items, skippedBatches } = buildGroceryList({
      batches: [{ name: "Hand-entered batch" }],
      recipesById: new Map(),
    })
    expect(items).toEqual([])
    expect(skippedBatches).toEqual(["Hand-entered batch"])
  })

  test("an unresolvable sourceRecipeId does not throw", () => {
    const { skippedBatches } = buildGroceryList({
      batches: [{ sourceRecipeId: "missing", name: "Ghost" }],
      recipesById: new Map(),
    })
    expect(skippedBatches).toEqual(["Ghost"])
  })

  test("empty input yields an empty list", () => {
    expect(buildGroceryList({})).toEqual({ items: [], skippedBatches: [] })
  })
})

describe("categories and sorting", () => {
  test("guesses a sensible aisle", () => {
    expect(guessGroceryCategory("Chicken breast")).toBe("Protein")
    expect(guessGroceryCategory("Spinach")).toBe("Produce")
    expect(guessGroceryCategory("Greek yogurt")).toBe("Dairy")
    expect(guessGroceryCategory("Olive oil")).toBe("Pantry")
    expect(guessGroceryCategory("Novelty widget")).toBe("Other")
  })

  test("sorts by aisle then name, with checked items last", () => {
    const sorted = sortGroceryItems([
      item({ id: "1", name: "Spinach", key: "spinach", category: "Produce" }),
      item({ id: "2", name: "Chicken", key: "chicken", category: "Protein" }),
      item({
        id: "3",
        name: "Apple",
        key: "apple",
        category: "Produce",
        checked: true,
      }),
    ])
    expect(sorted.map((entry) => entry.name)).toEqual([
      "Spinach",
      "Chicken",
      "Apple",
    ])
  })
})

describe("presentation", () => {
  test("amounts read in kg past a kilo", () => {
    expect(groceryItemAmount(item({ grams: 250 }))).toBe("250 g")
    expect(groceryItemAmount(item({ grams: 1500 }))).toBe("1.5 kg")
  })

  test("count units are shown as entered", () => {
    expect(
      groceryItemAmount(
        item({ grams: undefined, displayAmount: 3, displayUnit: "cloves" })
      )
    ).toBe("3 cloves")
  })

  test("an item with no quantity has no amount string", () => {
    expect(groceryItemAmount(item({ grams: undefined }))).toBe("")
  })

  test("the text export groups by aisle and marks checked items", () => {
    const text = groceryListToText({
      name: "Week 1",
      items: [
        item({ id: "1", name: "Chicken", key: "chicken", category: "Protein" }),
        item({
          id: "2",
          name: "Spinach",
          key: "spinach",
          category: "Produce",
          grams: 100,
          checked: true,
        }),
      ],
    })
    expect(text.startsWith("Week 1")).toBe(true)
    expect(text).toContain("Protein")
    expect(text).toContain("[ ] Chicken — 200 g")
    expect(text).toContain("[x] Spinach — 100 g")
  })
})

describe("manualGroceryItem", () => {
  test("creates a flagged manual line", () => {
    const created = manualGroceryItem("  Bin bags  ")
    expect(created?.name).toBe("Bin bags")
    expect(created?.manual).toBe(true)
    expect(created?.checked).toBe(false)
  })

  test("an empty name creates nothing", () => {
    expect(manualGroceryItem("   ")).toBeNull()
  })
})
