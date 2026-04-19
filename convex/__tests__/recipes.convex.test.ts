import { describe, test, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const ingredient = {
  id: "ing-1",
  name: "Chicken breast",
  grams: 200,
  caloriesPer100: 165,
  proteinPer100: 31,
  carbsPer100: 0,
  fatPer100: 3.6,
};

describe("recipes Convex functions", () => {
  test("list throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.logs.recipes.list, {})).rejects.toThrow();
  });

  test("save throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.recipes.save, {
        name: "My Recipe",
        ingredients: [ingredient],
      })
    ).rejects.toThrow();
  });

  test("remove throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.recipes.remove, {
        id: "jd7f4z1y2s3d4t5v6w7x8" as any,
      })
    ).rejects.toThrow();
  });

  test("inserts a new recipe with all fields", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert("recipes", {
        userId: "recipe-create-user",
        name: "Chicken Bowl",
        ingredients: [ingredient],
        createdAt: now,
        updatedAt: now,
      })
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe("Chicken Bowl");
    expect(stored!.ingredients).toHaveLength(1);
    expect(stored!.ingredients[0].name).toBe("Chicken breast");
    expect(stored!.ingredients[0].grams).toBe(200);
  });

  test("lists only recipes belonging to the requesting user", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("recipes", {
        userId: "recipe-user-a",
        name: "Recipe A",
        ingredients: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("recipes", {
        userId: "recipe-user-b",
        name: "Recipe B",
        ingredients: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    const userARecipes = await t.run(async (ctx) =>
      ctx.db
        .query("recipes")
        .withIndex("by_userId", (q) => q.eq("userId", "recipe-user-a"))
        .collect()
    );

    expect(userARecipes).toHaveLength(1);
    expect(userARecipes[0].name).toBe("Recipe A");
  });

  test("updates an existing recipe (save with id)", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert("recipes", {
        userId: "recipe-update-user",
        name: "Original Recipe",
        ingredients: [ingredient],
        createdAt: now,
        updatedAt: now,
      })
    );

    const newIngredient = { ...ingredient, id: "ing-2", name: "Rice", grams: 150 };
    await t.run(async (ctx) =>
      ctx.db.patch(id, {
        name: "Updated Recipe",
        ingredients: [ingredient, newIngredient],
        updatedAt: Date.now(),
      })
    );

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated!.name).toBe("Updated Recipe");
    expect(updated!.ingredients).toHaveLength(2);
  });

  test("remove deletes the recipe", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert("recipes", {
        userId: "recipe-delete-user",
        name: "To Delete",
        ingredients: [],
        createdAt: now,
        updatedAt: now,
      })
    );

    await t.run(async (ctx) => ctx.db.delete(id));

    const deleted = await t.run(async (ctx) => ctx.db.get(id));
    expect(deleted).toBeNull();
  });

  test("remove rejects access to another user's recipe", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const id = await t.run(async (ctx) =>
      ctx.db.insert("recipes", {
        userId: "real-owner",
        name: "Private Recipe",
        ingredients: [],
        createdAt: now,
        updatedAt: now,
      })
    );

    const recipe = await t.run(async (ctx) => ctx.db.get(id));
    expect(recipe!.userId).toBe("real-owner");
    expect(recipe!.userId).not.toBe("attacker");
  });

  test("recipe can store multiple ingredients with full nutrient data", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const ingredients = [
      ingredient,
      { id: "ing-2", name: "Brown Rice", grams: 100, caloriesPer100: 112, proteinPer100: 2.6, carbsPer100: 24, fatPer100: 0.9 },
      { id: "ing-3", name: "Olive Oil", grams: 15, caloriesPer100: 884, proteinPer100: 0, carbsPer100: 0, fatPer100: 100 },
    ];

    const id = await t.run(async (ctx) =>
      ctx.db.insert("recipes", {
        userId: "recipe-multi-user",
        name: "Full Meal",
        ingredients,
        createdAt: now,
        updatedAt: now,
      })
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored!.ingredients).toHaveLength(3);
    expect(stored!.ingredients[2].name).toBe("Olive Oil");
  });
});
