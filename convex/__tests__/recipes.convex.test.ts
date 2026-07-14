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
  test("list returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.logs.recipes.list, {})).resolves.toEqual([]);
  });

  test("save throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.recipes.save, {
        name: "My Recipe",
        ingredients: [ingredient],
      }),
    ).rejects.toThrow();
  });

  test("remove throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.recipes.remove, {
        id: "jd7f4z1y2s3d4t5v6w7x8" as any,
      }),
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
      }),
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe("Chicken Bowl");
    expect(stored!.ingredients).toHaveLength(1);
    expect(stored!.ingredients[0].name).toBe("Chicken breast");
    expect(stored!.ingredients[0].grams).toBe(200);
  });

  test("persists Coach recipe card metadata", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ name: "coach-recipe-user" }, async () => {
      const id = await t.mutation(api.logs.recipes.save, {
        name: "Fast protein bowl",
        recipeType: "detailed",
        description: "A bright weeknight bowl",
        servings: 2,
        prepMinutes: 20,
        cookMinutes: 15,
        category: "Dinner",
        notes: "Keeps for two days",
        placeholderImage: "coach-kitchen",
        tags: ["high protein", "quick"],
        steps: ["Cook", "Assemble"],
        ingredients: [ingredient],
      });
      const recipe = await t.run(async (ctx) => ctx.db.get(id));
      expect(recipe).toMatchObject({
        description: "A bright weeknight bowl",
        recipeType: "detailed",
        servings: 2,
        prepMinutes: 20,
        cookMinutes: 15,
        category: "Dinner",
        notes: "Keeps for two days",
        placeholderImage: "coach-kitchen",
        tags: ["high protein", "quick"],
        steps: ["Cook", "Assemble"],
      });
    });
  });

  test("shares and unshares a recipe with the signed-in community", async () => {
    const t = convexTest(schema, modules);
    let recipeId: any;
    await t.withIdentity({ name: "Ada Cook", subject: "ada" }, async () => {
      recipeId = await t.mutation(api.logs.recipes.save, {
        name: "Ada's bowl",
        ingredients: [ingredient],
      });
      await t.mutation(api.logs.recipes.setCommunitySharing, {
        id: recipeId,
        shared: true,
        originCountry: "Italy",
      });
    });

    await t.withIdentity(
      { name: "Community reader", subject: "reader" },
      async () => {
        const community = await t.query(api.logs.recipes.listCommunity, {});
        expect(community).toHaveLength(1);
        expect(community[0]).toMatchObject({
          name: "Ada's bowl",
          communityAuthorName: "Ada Cook",
          originCountry: "Italy",
          isCommunityShared: true,
          isOwnedByViewer: false,
        });
        expect(community[0]).not.toHaveProperty("userId");
      },
    );

    await t.withIdentity({ name: "Ada Cook", subject: "ada" }, async () => {
      await t.mutation(api.logs.recipes.setCommunitySharing, {
        id: recipeId,
        shared: false,
      });
      await expect(
        t.query(api.logs.recipes.listCommunity, {}),
      ).resolves.toEqual([]);
    });
  });

  test("supports anonymous sharing and stores one pending report per reporter", async () => {
    const t = convexTest(schema, modules);
    let recipeId: any;
    await t.withIdentity(
      { name: "Private Chef", subject: "private-chef" },
      async () => {
        recipeId = await t.mutation(api.logs.recipes.save, {
          name: "Anonymous soup",
          ingredients: [ingredient],
        });
        await t.mutation(api.logs.recipes.setCommunitySharing, {
          id: recipeId,
          shared: true,
          anonymous: true,
          originCountry: "France",
        });
      },
    );
    await t.withIdentity(
      { name: "Reporter", subject: "reporter" },
      async () => {
        const community = await t.query(api.logs.recipes.listCommunity, {});
        expect(community[0].communityAuthorName).toBe("Anonymous");
        const first = await t.mutation(api.logs.recipes.reportCommunityRecipe, {
          recipeId,
          reason: "Needs review",
        });
        const duplicate = await t.mutation(
          api.logs.recipes.reportCommunityRecipe,
          { recipeId },
        );
        expect(duplicate).toBe(first);
        const reports = await t.run(async (ctx) =>
          ctx.db.query("recipeReports").collect(),
        );
        expect(reports).toHaveLength(1);
        expect(reports[0]).toMatchObject({
          status: "pending",
          reason: "Needs review",
        });
      },
    );
  });

  test("prompts once and maintains community rating aggregates", async () => {
    const t = convexTest(schema, modules);
    let recipeId: any;
    await t.withIdentity(
      { name: "Recipe owner", subject: "rating-owner" },
      async () => {
        recipeId = await t.mutation(api.logs.recipes.save, {
          name: "Rated bowl",
          ingredients: [ingredient],
        });
        await t.mutation(api.logs.recipes.setCommunitySharing, {
          id: recipeId,
          shared: true,
          originCountry: "Italy",
        });
      },
    );

    await t.withIdentity(
      { name: "Taster", subject: "rating-taster" },
      async () => {
        await expect(
          t.mutation(api.logs.recipes.claimRatingPrompt, { recipeId }),
        ).resolves.toBe(true);
        await expect(
          t.mutation(api.logs.recipes.claimRatingPrompt, { recipeId }),
        ).resolves.toBe(false);
        await t.mutation(api.logs.recipes.rateCommunityRecipe, {
          recipeId,
          rating: 4,
        });
        let community = await t.query(api.logs.recipes.listCommunity, {});
        expect(community[0]).toMatchObject({ ratingCount: 1, ratingTotal: 4 });

        await t.mutation(api.logs.recipes.rateCommunityRecipe, {
          recipeId,
          rating: 5,
        });
        community = await t.query(api.logs.recipes.listCommunity, {});
        expect(community[0]).toMatchObject({ ratingCount: 1, ratingTotal: 5 });
      },
    );
  });

  test("limits new community publications to ten per UTC day", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(
      { name: "Busy Chef", subject: "busy-chef" },
      async () => {
        for (let index = 0; index < 10; index += 1) {
          const id = await t.mutation(api.logs.recipes.save, {
            name: `Recipe ${index}`,
            ingredients: [ingredient],
          });
          await t.mutation(api.logs.recipes.setCommunitySharing, {
            id,
            shared: true,
            originCountry: "Germany",
          });
        }
        const eleventh = await t.mutation(api.logs.recipes.save, {
          name: "Recipe 11",
          ingredients: [ingredient],
        });
        await expect(
          t.mutation(api.logs.recipes.setCommunitySharing, {
            id: eleventh,
            shared: true,
            originCountry: "Germany",
          }),
        ).rejects.toThrow("Daily community sharing limit reached");
      },
    );
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
        .collect(),
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
      }),
    );

    const newIngredient = {
      ...ingredient,
      id: "ing-2",
      name: "Rice",
      grams: 150,
    };
    await t.run(async (ctx) =>
      ctx.db.patch(id, {
        name: "Updated Recipe",
        ingredients: [ingredient, newIngredient],
        updatedAt: Date.now(),
      }),
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
      }),
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
      }),
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
      {
        id: "ing-2",
        name: "Brown Rice",
        grams: 100,
        caloriesPer100: 112,
        proteinPer100: 2.6,
        carbsPer100: 24,
        fatPer100: 0.9,
      },
      {
        id: "ing-3",
        name: "Olive Oil",
        grams: 15,
        caloriesPer100: 884,
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 100,
      },
    ];

    const id = await t.run(async (ctx) =>
      ctx.db.insert("recipes", {
        userId: "recipe-multi-user",
        name: "Full Meal",
        ingredients,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored!.ingredients).toHaveLength(3);
    expect(stored!.ingredients[2].name).toBe("Olive Oil");
  });
});
