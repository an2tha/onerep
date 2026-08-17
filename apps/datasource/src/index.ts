import { requireToken } from "./core/auth.ts";
import { loadConfig } from "./core/config.ts";
import { toCompatExercise, toCompatProduct } from "./compat.ts";
import { createRegistry } from "./registry.ts";

const config = loadConfig();
const registry = createRegistry(config.dataDir);
const startedAt = Date.now();

const MAX_LIMIT = 50;

function limitOf(url: URL, fallback = 25): number {
  const raw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, raw));
}

function queryOf(request: Request): { query: string; limit: number } {
  const url = new URL(request.url);
  return { query: (url.searchParams.get("q") ?? "").trim(), limit: limitOf(url) };
}

/**
 * No provider of this kind has been imported yet, which is a server-side
 * problem and not the caller's.
 */
function notImported(kind: string, source: string): Response {
  return Response.json(
    { error: "not_imported", source, detail: `No ${kind} data has been imported yet` },
    { status: 503 },
  );
}

function hasFoods(): boolean {
  return registry.foodProviders().some((provider) => provider.stats().imported);
}

function hasExercises(): boolean {
  return registry.exerciseProviders().some((provider) => provider.stats().imported);
}

/**
 * Credit for whichever providers actually contributed to a response.
 *
 * `attribution` stays a bare provider id because that is what has always been
 * on the wire and clients may be matching on it. The richer per-provider credit
 * — which is what a CC-BY-SA or ODbL catalog actually requires be displayed —
 * is additive, so nothing existing has to change to ignore it.
 */
function credit(providerIds: Iterable<string>, fallback: string) {
  const ids = new Set(providerIds);
  const contributing = registry.providers.filter((provider) => ids.has(provider.id));
  return {
    attribution: contributing[0]?.id ?? fallback,
    providers: contributing.map((provider) => ({
      id: provider.id,
      attribution: provider.attribution,
    })),
  };
}

/** The provider credited on an empty result, matching the historic response. */
const DEFAULT_FOOD_PROVIDER = "usda";
const DEFAULT_EXERCISE_PROVIDER = "wger";

function searchFoods(request: Request): Response {
  if (!hasFoods()) return notImported("food", DEFAULT_FOOD_PROVIDER);
  const { query, limit } = queryOf(request);
  const foods = query ? registry.searchFoods(query, limit) : [];
  return Response.json({
    products: foods.map(toCompatProduct),
    ...credit(foods.map((food) => food.providerId), DEFAULT_FOOD_PROVIDER),
  });
}

function foodById(id: string): Response {
  if (!hasFoods()) return notImported("food", DEFAULT_FOOD_PROVIDER);
  const food = registry.foodById(id);
  if (!food) {
    return Response.json(
      { status: 0, product: null, ...credit([], DEFAULT_FOOD_PROVIDER) },
      { status: 404 },
    );
  }
  return Response.json({
    status: 1,
    product: toCompatProduct(food),
    ...credit([food.providerId], DEFAULT_FOOD_PROVIDER),
  });
}

function foodByBarcode(barcode: string): Response {
  if (!hasFoods()) return notImported("food", DEFAULT_FOOD_PROVIDER);
  // A barcode of all zeros or punctuation is a bad scan, not a bad request:
  // report it as a miss so the client shows "not found" instead of an error.
  const food = registry.foodByBarcode(barcode);
  if (!food) {
    return Response.json(
      { status: 0, product: null, ...credit([], DEFAULT_FOOD_PROVIDER) },
      { status: 404 },
    );
  }
  return Response.json({
    status: 1,
    product: toCompatProduct(food),
    ...credit([food.providerId], DEFAULT_FOOD_PROVIDER),
  });
}

function searchExercises(request: Request): Response {
  if (!hasExercises()) return notImported("exercise", DEFAULT_EXERCISE_PROVIDER);
  const { query, limit } = queryOf(request);
  const exercises = query ? registry.searchExercises(query, limit) : [];
  return Response.json({
    exercises: exercises.map(toCompatExercise),
    ...credit(exercises.map((exercise) => exercise.providerId), DEFAULT_EXERCISE_PROVIDER),
  });
}

function exerciseById(id: string): Response {
  if (!hasExercises()) return notImported("exercise", DEFAULT_EXERCISE_PROVIDER);
  const exercise = registry.exerciseById(id);
  if (!exercise) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    exercise: toCompatExercise(exercise),
    ...credit([exercise.providerId], DEFAULT_EXERCISE_PROVIDER),
  });
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  // Deliberately no CORS headers: this service is only ever called server-side
  // from Convex, never from a browser.
  routes: {
    "/health": () =>
      Response.json({ status: "ok", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) }),

    "/v1/stats": (req) =>
      requireToken(req, config.apiToken) ?? Response.json({ sources: registry.stats() }),
    "/v1/foods/search": (req) => requireToken(req, config.apiToken) ?? searchFoods(req),
    "/v1/foods/:id": (req) => requireToken(req, config.apiToken) ?? foodById(req.params.id),
    "/v1/barcodes/:barcode": (req) =>
      requireToken(req, config.apiToken) ?? foodByBarcode(req.params.barcode),
    "/v1/exercises/search": (req) => requireToken(req, config.apiToken) ?? searchExercises(req),
    "/v1/exercises/:id": (req) => requireToken(req, config.apiToken) ?? exerciseById(req.params.id),
  },
  fetch: () => Response.json({ error: "not_found" }, { status: 404 }),
  error: (error) => {
    console.error("unhandled request error", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  },
});

console.log(
  `datasource listening on http://${server.hostname}:${server.port} ` +
    `(providers: ${registry.providers.map((provider) => provider.id).join(", ")})`,
);
