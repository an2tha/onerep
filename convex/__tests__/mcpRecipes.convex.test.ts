import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { sha256Hex } from "../mcp/tokens";

const modules = import.meta.glob("../**/*.ts");
const ingredient = {
  name: "Chicken breast",
  grams: 200,
  caloriesPer100: 165,
  proteinPer100: 31,
  carbsPer100: 0,
  fatPer100: 3.6,
};
const meal = { name: "Chicken bowl", servings: 2, ingredients: [ingredient] };
type Harness = ReturnType<typeof convexTest>;

async function client(
  t: Harness,
  token: string,
  scopes: Array<"read" | "write" | "delete">,
) {
  const userId = `test|${token}`;
  const owner = t.withIdentity({ tokenIdentifier: userId });
  await owner.mutation(internal.mcp.tokens.store, {
    name: "Recipes",
    scopes,
    tokenHash: await sha256Hex(token),
    prefix: token.slice(0, 5),
  });
  async function rpc(method: string, params: Record<string, unknown>) {
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).result;
  }
  return {
    userId,
    owner,
    tools: () => rpc("tools/list", {}),
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const result = await rpc("tools/call", { name, arguments: args });
      return { isError: result.isError, ...JSON.parse(result.content[0].text) };
    },
  };
}

describe("MCP saved recipes", () => {
  test("saves to My Recipes, computes macros, and never logs food", async () => {
    const t = convexTest(schema, modules);
    const c = await client(t, "recipes-owner", ["read", "write"]);
    const saved = await c.call("save_recipe", {
      ...meal,
      steps: ["Cook the chicken"],
    });
    expect(saved.isError).toBe(false);
    expect(saved.recipe).toMatchObject({
      name: meal.name,
      servings: 2,
      totals: { calories: 330, protein: 62, carbs: 0, fat: 7.2 },
      perServing: { calories: 165, protein: 31, carbs: 0, fat: 4 },
    });
    expect(saved.recipe.ingredients[0].id).toEqual(expect.any(String));
    const inApp = await c.owner.query(api.logs.recipes.list, {});
    expect(inApp).toHaveLength(1);
    expect(inApp[0]._id).toBe(saved.recipe.id);
    expect(inApp[0].steps).toEqual(["Cook the chicken"]);
    expect(await t.run((ctx) => ctx.db.query("foodLogs").take(1))).toEqual([]);
    expect(await c.call("list_recipes")).toMatchObject({
      recipes: [saved.recipe],
      nextCursor: null,
    });
  });

  test("reads recipes created in the app and paginates only the owner's recipes", async () => {
    const t = convexTest(schema, modules);
    const c = await client(t, "recipes-pages", ["read", "write"]);
    await c.owner.mutation(api.logs.recipes.save, {
      ...meal,
      ingredients: [{ ...ingredient, id: "in-app" }],
    });
    await c.call("save_recipe", { ...meal, name: "Second" });
    await c.call("save_recipe", { ...meal, name: "Third" });
    const stranger = await client(t, "recipes-stranger", [
      "read",
      "write",
      "delete",
    ]);
    const first = await c.call("list_recipes", { limit: 2 });
    expect(
      first.recipes.map((recipe: { name: string }) => recipe.name),
    ).toEqual(["Third", "Second"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const last = await c.call("list_recipes", {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(last.recipes).toHaveLength(1);
    expect(last.recipes[0].ingredients[0].id).toBe("in-app");
    expect(last.nextCursor).toBeNull();
    expect((await stranger.call("list_recipes")).recipes).toEqual([]);
    for (const name of ["update_recipe", "delete_recipe"]) {
      const result = await stranger.call(name, {
        id: first.recipes[0].id,
        ...(name === "update_recipe" ? { name: "Stolen" } : {}),
      });
      expect(result.isError).toBe(true);
      expect(result.error).toMatch(/not found|access denied/i);
    }
  });

  test("partial updates preserve metadata and photos, and undo restores changed fields", async () => {
    const t = convexTest(schema, modules);
    const c = await client(t, "recipes-update", ["read", "write"]);
    const saved = await c.call("save_recipe", {
      ...meal,
      notes: "Keep",
      steps: ["Cook"],
    });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })),
    );
    await t.run((ctx) =>
      ctx.db.patch(saved.recipe.id, {
        photoStorageIds: [storageId],
        isCommunityShared: true,
      }),
    );
    const result = await c.call("update_recipe", {
      id: saved.recipe.id,
      description: "New description",
      ingredients: [{ ...saved.recipe.ingredients[0], proteinPer100: 25 }],
    });
    expect(result.isError).toBe(false);
    expect(result.recipe).toMatchObject({
      name: meal.name,
      notes: "Keep",
      steps: ["Cook"],
      perServing: { protein: 25 },
    });
    const stored = await t.run((ctx) => ctx.db.get("recipes", saved.recipe.id));
    expect(stored).toMatchObject({
      photoStorageIds: [storageId],
      isCommunityShared: true,
    });
    const history = await c.owner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    const update = history.find((event) => event.kind === "api_update_recipe")!;
    await c.owner.mutation(api.ai.coachState.undoAction, { id: update._id });
    const restored = await t.run((ctx) =>
      ctx.db.get("recipes", saved.recipe.id),
    );
    expect(restored!.description).toBeUndefined();
    expect(restored!.ingredients[0].proteinPer100).toBe(31);
    expect(restored!.photoStorageIds).toEqual([storageId]);
  });

  test("write access cannot delete, while delete access removes recipes and supports undo with photos", async () => {
    const t = convexTest(schema, modules);
    const c = await client(t, "recipes-delete", ["read", "write", "delete"]);
    const saved = await c.call("save_recipe", meal);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })),
    );
    const uploadId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("fileUploads", {
        userId: c.userId,
        purpose: "recipe_photo",
        status: "attached",
        storageId,
        expectedMimeType: "image/jpeg",
        expectedSize: 5,
        attachedTable: "recipes",
        attachedDocumentId: saved.recipe.id,
        attachedAt: Date.now(),
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
      });
      await ctx.db.patch(saved.recipe.id, { photoUploadIds: [id] });
      return id;
    });
    const writer = await client(t, "recipes-writer", ["read", "write"]);
    expect(
      (await writer.call("delete_recipe", { id: saved.recipe.id })).error,
    ).toMatch(/needs delete/i);
    expect(
      (await c.call("delete_recipe", { id: saved.recipe.id })).isError,
    ).toBe(false);
    expect((await c.call("list_recipes")).recipes).toEqual([]);
    const history = await c.owner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    const deletion = history.find(
      (event) => event.kind === "api_delete_recipe",
    )!;
    await c.owner.mutation(api.ai.coachState.undoAction, { id: deletion._id });
    const [restored] = await c.owner.query(api.logs.recipes.list, {});
    expect(restored.name).toBe(meal.name);
    expect(restored.photoUrls).toHaveLength(1);
    expect(
      (await t.run((ctx) => ctx.db.get(uploadId)))!.attachedDocumentId,
    ).toBe(restored._id);
    // The restored photo must remain removable through the normal app flow.
    await c.owner.mutation(api.logs.recipes.remove, { id: restored._id });
    expect(await t.run((ctx) => ctx.db.get(uploadId))).toBeNull();
  });

  test("save can be undone from the same app history", async () => {
    const t = convexTest(schema, modules);
    const c = await client(t, "recipes-undo-save", ["read", "write"]);
    await c.call("save_recipe", meal);
    const [event] = await c.owner.query(
      api.ai.coachState.listActionHistory,
      {},
    );
    await c.owner.mutation(api.ai.coachState.undoAction, { id: event._id });
    expect((await c.call("list_recipes")).recipes).toEqual([]);
  });

  test("clients cannot forge server recipe undo snapshots", async () => {
    const t = convexTest(schema, modules);
    const c = await client(t, "recipes-forged-undo", ["read"]);
    for (const kind of ["restore_recipe_fields", "restore_deleted_recipe"]) {
      await expect(
        c.owner.mutation(api.ai.coachState.recordAction, {
          kind: "api_update_recipe",
          summary: "Forged",
          targetType: "recipe",
          undoPayload: {
            kind,
            id: "fake",
            body: { userId: c.userId },
            fields: {},
          },
        }),
      ).rejects.toThrow("only be recorded by the server");
    }
  });

  test("catalog scopes and annotations match recipe operations", async () => {
    const t = convexTest(schema, modules);
    const reader = await client(t, "recipes-reader", ["read"]);
    const readerNames = (await reader.tools()).tools.map(
      (tool: { name: string }) => tool.name,
    );
    expect(readerNames).toContain("list_recipes");
    for (const name of ["save_recipe", "update_recipe", "delete_recipe"]) {
      expect(readerNames).not.toContain(name);
      expect((await reader.call(name, { ...meal, id: "unused" })).isError).toBe(
        true,
      );
    }
    const full = await client(t, "recipes-full", ["read", "write", "delete"]);
    const tools = (await full.tools()).tools;
    for (const name of [
      "list_recipes",
      "save_recipe",
      "update_recipe",
      "delete_recipe",
    ])
      expect(
        tools.find((tool: { name: string }) => tool.name === name),
      ).toBeDefined();
    expect(
      tools.find((tool: { name: string }) => tool.name === "delete_recipe")
        .annotations.destructiveHint,
    ).toBe(true);
  });

  test("rejects invalid ingredients, macros, servings, ids, and empty updates without writing", async () => {
    const t = convexTest(schema, modules);
    const c = await client(t, "recipes-validation", [
      "read",
      "write",
      "delete",
    ]);
    for (const input of [
      { ...meal, name: " " },
      { ...meal, ingredients: [] },
      { ...meal, ingredients: [{ ...ingredient, grams: 0 }] },
      { ...meal, ingredients: [{ ...ingredient, proteinPer100: -1 }] },
      { ...meal, ingredients: [{ ...ingredient, caloriesPer100: undefined }] },
      { ...meal, ingredients: ["Chicken"] },
      {
        ...meal,
        ingredients: [
          { ...ingredient, id: "same" },
          { ...ingredient, id: "same" },
        ],
      },
      { ...meal, servings: 0 },
      { ...meal, cookMinutes: -1 },
      { ...meal, calories: 900 },
    ]) {
      expect((await c.call("save_recipe", input)).isError).toBe(true);
    }
    expect((await c.call("list_recipes")).recipes).toEqual([]);
    const saved = await c.call("save_recipe", meal);
    expect(
      (await c.call("update_recipe", { id: saved.recipe.id })).isError,
    ).toBe(true);
    for (const name of ["update_recipe", "delete_recipe"])
      expect(
        (await c.call(name, { id: "invalid", name: "Test" })).isError,
      ).toBe(true);
    for (const limit of [0, -1, 1.5, 101, "20"])
      expect((await c.call("list_recipes", { limit })).isError).toBe(true);
    expect((await c.call("list_recipes")).recipes).toHaveLength(1);
  });
});
