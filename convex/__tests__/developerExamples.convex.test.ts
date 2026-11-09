import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { OneRep, operations, type Inputs } from "../../packages/sdk/src/index";
import { sha256Hex } from "../mcp/tokens";

const modules = import.meta.glob("../**/*.ts");
const fixture = "apps/mobile/src/pages/developer-reference/examples.json";
const date = "2026-05-18";
const range = { start: "2026-05-12", end: date };

afterEach(() => vi.useRealTimers());

// The reference is recorded from the same SDK and HTTP router developers use.
// Regenerate intentional contract changes with UPDATE_API_EXAMPLES=1 and run this test.
test("every developer example round-trips through the SDK and REST API", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(date + "T12:00:00Z"));
  const t = convexTest(schema, modules);
  const token = "fixture-only";
  const personalKey = "fixture-delete-only";
  const userId = "sample-athlete";
  await t.run(async (ctx) => {
    const now = Date.now();
    const clientId = "sample-app";
    await ctx.db.insert("mcpOauthClients", {
      clientId,
      clientName: "Example",
      redirectUris: ["https://example.org/callback"],
      registration: "manual",
      createdAt: now,
    });
    await ctx.db.insert("mcpTokens", {
      userId,
      name: "Example",
      createdAt: now,
      prefix: "demo",
      tokenHash: await sha256Hex(token),
      clientId,
      scopes: ["read", "write"],
    });
    await ctx.db.insert("mcpTokens", {
      userId,
      name: "Personal key",
      createdAt: now,
      prefix: "demo",
      tokenHash: await sha256Hex(personalKey),
      scopes: ["delete"],
    });
    const timestamps = { createdAt: now, updatedAt: now };
    const nutrientsPerServing = {
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
    };
    const routine = await ctx.db.insert("presets", {
      userId,
      name: "Lower body",
      items: ["squat"],
      exerciseData: {},
      focus: "Strength",
      ...timestamps,
    });
    await ctx.db.insert("schedules", {
      userId,
      routine: { Monday: routine },
      presetOrder: [routine],
      updatedAt: now,
    });
    await ctx.db.insert("mealPresets", {
      userId,
      name: "Breakfast oats",
      meal: "breakfast",
      signature: "breakfast-oats",
      entries: [{ name: "Oats", ...nutrientsPerServing }],
      ...timestamps,
    });
    await ctx.db.insert("customFoods", {
      userId,
      name: "Rolled oats",
      servingLabel: "½ cup",
      servingGrams: 40,
      nutrientsPerServing,
      ...timestamps,
    });
    await ctx.db.insert("mealPrepBatches", {
      userId,
      name: "Overnight oats",
      meal: "breakfast",
      preppedOn: date,
      storage: "fridge",
      servingsTotal: 3,
      servingsLogged: 1,
      nutrientsPerServing,
      ...timestamps,
    });
    await ctx.db.insert("fastingSessions", {
      userId,
      startedAt: now - 14 * 3600000,
      endedAt: now,
      targetMinutes: 840,
      protocol: "custom",
      startDate: "2026-05-17",
      endDate: date,
      ...timestamps,
    });
    await ctx.db.insert("groceryLists", {
      userId,
      name: "Breakfast shop",
      items: [
        {
          id: "oats",
          name: "Rolled oats",
          key: "rolled-oats",
          checked: false,
          manual: true,
        },
      ],
      ...timestamps,
    });
    await ctx.db.insert("supplementItems", {
      userId,
      name: "Creatine",
      category: "creatine",
      form: "powder",
      servingLabel: "1 scoop",
      defaultServingQuantity: 1,
      active: true,
      schedule: { type: "daily" },
      nutrientsPerServing: { creatine: 5 },
      source: "manual",
      ...timestamps,
    });
    await ctx.db.insert("hikingTrails", {
      userId,
      name: "Lake loop",
      description: "Lakeside walking trail",
      distanceMeters: 4200,
    });
    await ctx.db.insert("exercises", {
      userId: "__global__",
      exerciseId: "squat",
      name: "Squat",
      category: "strength",
      level: "beginner",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: ["glutes"],
      instructions: ["Bend your knees and hips, then stand."],
    });
    await ctx.db.insert("nutritionProgrammes", {
      userId,
      goal: "maintain",
      startDate: date,
      weeks: 4,
      baselineCalories: 2200,
      changePercent: 0,
      protein: 120,
      fat: 70,
      fastingHours: 12,
      eatingStart: "08:00",
      timezone: "Europe/Berlin",
      createdAt: now,
    });
  });

  let path = "";
  let body: unknown;
  async function send(url: RequestInfo | URL, init?: RequestInit) {
    const request = new URL(String(url));
    path = request.pathname + request.search;
    body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const response = await t.fetch(path, init);
    expect(response.status, path).toBe(200);
    return response;
  }
  const oauth = new OneRep({ accessToken: token, fetch: send as typeof fetch });
  const personal = new OneRep({
    accessToken: personalKey,
    fetch: send as typeof fetch,
  });
  const examples: Record<string, unknown> = {};
  async function record<K extends keyof Inputs>(
    operation: K,
    ...args: {} extends Inputs[K] ? [input?: Inputs[K]] : [input: Inputs[K]]
  ) {
    const sdk =
      operations.find((item) => item.operation === operation)?.scope ===
      "delete"
        ? personal
        : oauth;
    const response = await sdk.call(operation, ...args);
    examples[operation] = { input: args[0] ?? {}, path, body, response };
    return response;
  }

  for (const op of [
    "list_routines",
    "list_schedules",
    "list_saved_meals",
    "list_custom_foods",
    "list_meal_prep",
    "list_fasts",
    "list_grocery_lists",
    "list_supplements",
    "list_trails",
  ] as const)
    await record(op, { limit: 10 });
  await record("search_exercises", { query: "Squat", limit: 5 });
  await record("list_programmes");
  await record("list_routes");
  await record("get_access");
  await record("set_nutrition_targets", { protein: 120, waterMl: 2000 });
  await record("get_goals");
  const water = await record("log_water", { date, amountMl: 350 });
  const food = await record("log_food", {
    date,
    name: "Rolled oats",
    meal: "breakfast",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
  });
  const workout = await record("log_workout", {
    date,
    durationMinutes: 35,
    exercises: [{ name: "Squat", sets: [{ reps: 8, weightKg: 50 }] }],
  });
  await record("list_workouts", { limit: 5 });
  await record("log_weight", { date, weightKg: 72.5 });
  await record("log_body_measurement", { date, waistCm: 80 });
  const measurements = await record("list_body_measurements", { limit: 5 });
  const dates = { dates: ["2026-05-17"] };
  await record("mark_rest_day", dates);
  await record("get_day", { date });
  await record("get_range", range);
  await record("set_health_metric", { date, field: "steps", value: 8200 });
  await record("get_health_days", range);
  await record("log_health_workout", {
    date,
    activityType: "walking",
    durationMinutes: 30,
    externalId: "lake-walk-0518",
    totalDistanceMeters: 2400,
  });
  const activities = await record("list_health_workouts", { limit: 5 });
  await record("get_training_insights", { date });
  await record("save_recipe", {
    name: "Breakfast oats",
    servings: 1,
    ingredients: [
      {
        id: "oats",
        name: "Oats",
        grams: 40,
        caloriesPer100: 375,
        proteinPer100: 12.5,
        carbsPer100: 67.5,
        fatPer100: 7.5,
      },
    ],
  });
  const recipes = await record("list_recipes", { limit: 10 });
  const recipeId = recipes.recipes[0].id;
  await record("update_recipe", { id: recipeId, name: "Morning oats" });
  await record("create_custom_metric", {
    title: "Mobility",
    tab: "training",
    kind: "number",
    unit: "min",
    step: 1,
  });
  const metricId = await t.run(
    async (ctx) => (await ctx.db.query("customProgressMetrics").first())!._id,
  );
  await record("update_custom_metric", { metricId, target: 15 });
  await record("set_custom_metric_value", { metricId, date, value: 12 });
  await record("list_custom_metrics", { tab: "training", days: 7 });
  await record("list_platform_metrics", { group: "vitals" });
  await record("delete_recipe", { id: recipeId });
  await record("delete_custom_metric", { metricId });
  await record("delete_body_measurement", { id: measurements[0].id });
  await record("delete_food_entry", { date, entryId: food.entryId });
  await record("delete_water_entry", { date, entryId: water.entryId });
  await record("delete_workout", { date, sessionId: workout.sessionId });
  await record("unmark_rest_days", dates);
  await record("delete_health_day", { date });
  await record("delete_health_workout", { id: activities[0].id });

  expect(Object.keys(examples).sort()).toEqual(
    operations.map((item) => item.operation).sort(),
  );
  // Replace per-run log entry IDs everywhere, including URL-encoded path segments.
  let json = JSON.stringify(examples, null, 2);
  for (const [actual, sample] of [
    [food.entryId, "example-food-entry"],
    [water.entryId, "example-water-entry"],
    [workout.sessionId, "example-session"],
  ]) {
    json = json
      .replaceAll(encodeURIComponent(actual), sample)
      .replaceAll(actual, sample);
  }
  if (process.env.UPDATE_API_EXAMPLES === "1")
    writeFileSync(fixture, json + "\n");
  expect(JSON.parse(json)).toEqual(JSON.parse(readFileSync(fixture, "utf8")));
});
