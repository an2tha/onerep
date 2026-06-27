import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const presetArgs = {
  name: "Usual Breakfast",
  meal: "breakfast",
  signature: "oats|coffee",
  entries: [
    {
      name: "Oats",
      calories: 230,
      protein: 8,
      carbs: 38,
      fat: 4,
    },
    {
      name: "Coffee",
      calories: 20,
      protein: 1,
      carbs: 2,
      fat: 0,
    },
  ],
};

describe("mealPresets Convex functions", () => {
  test("list returns empty array when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.logs.mealPresets.list, {})).resolves.toEqual([]);
  });

  test("create throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.mealPresets.create, presetArgs),
    ).rejects.toThrow();
  });

  test("remove throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.logs.mealPresets.remove, {
        id: "jd7f4z1y2s3d4t5v6w7x8" as any,
      }),
    ).rejects.toThrow();
  });

  test("creates and lists meal presets for the authenticated user", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "meal-preset-user" }, async () => {
      const created = await t.mutation(api.logs.mealPresets.create, presetArgs);
      expect(created.id).toBeTruthy();

      const presets = await t.query(api.logs.mealPresets.list, {});
      expect(presets).toHaveLength(1);
      expect(presets[0].name).toBe("Usual Breakfast");
      expect(presets[0].meal).toBe("breakfast");
      expect(presets[0].entries).toHaveLength(2);
    });
  });

  test("dedupes presets by meal and signature", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "meal-preset-dedupe-user" }, async () => {
      const first = await t.mutation(api.logs.mealPresets.create, presetArgs);
      const second = await t.mutation(api.logs.mealPresets.create, {
        ...presetArgs,
        name: "Updated Breakfast",
      });

      expect(second.id).toBe(first.id);
      const presets = await t.query(api.logs.mealPresets.list, {});
      expect(presets).toHaveLength(1);
      expect(presets[0].name).toBe("Updated Breakfast");
    });
  });

  test("isolates presets between authenticated users", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "meal-preset-owner" }, async () => {
      await t.mutation(api.logs.mealPresets.create, presetArgs);
    });

    await t.withIdentity({ name: "meal-preset-other" }, async () => {
      await expect(t.query(api.logs.mealPresets.list, {})).resolves.toEqual([]);
    });
  });

  test("removes a meal preset owned by the authenticated user", async () => {
    const t = convexTest(schema, modules);

    await t.withIdentity({ name: "meal-preset-remove-user" }, async () => {
      const created = await t.mutation(api.logs.mealPresets.create, presetArgs);
      await t.mutation(api.logs.mealPresets.remove, { id: created.id });
      await expect(t.query(api.logs.mealPresets.list, {})).resolves.toEqual([]);
    });
  });
});
