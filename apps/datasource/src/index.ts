import { requireToken } from "./auth.ts";
import { toCompatProduct, type FoodRow, type Portion } from "./compat.ts";
import { loadConfig } from "./config.ts";
import { LiveDatabase, livePath } from "./db.ts";
import { barcodeKey, SEARCH_SQL, searchParams, toMatchExpression } from "./search.ts";

const config = loadConfig();
const startedAt = Date.now();

const foodDb = new LiveDatabase(livePath(config.dataDir, "usda"));
const exerciseDb = new LiveDatabase(livePath(config.dataDir, "wger"));

const MAX_LIMIT = 50;

function notImported(source: string): Response {
  return Response.json(
    { error: "not_imported", source, detail: `No ${source} data has been imported yet` },
    { status: 503 },
  );
}

function limitOf(url: URL, fallback = 25): number {
  const raw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, raw));
}

function portionsFor(db: ReturnType<LiveDatabase["get"]>, fdcId: number): Portion[] {
  return db!
    .query(
      "SELECT amount, unit, gram_weight FROM portions WHERE fdc_id = ? ORDER BY gram_weight LIMIT 10",
    )
    .all(fdcId) as Portion[];
}

function searchFoods(request: Request): Response {
  const db = foodDb.get();
  if (!db) return notImported("usda");

  const url = new URL(request.url);
  const params = searchParams((url.searchParams.get("q") ?? "").trim(), limitOf(url));
  if (!params) return Response.json({ products: [], attribution: "usda" });

  const rows = db.query(SEARCH_SQL).all(params) as FoodRow[];

  return Response.json({
    products: rows.map((row) => toCompatProduct(row)),
    attribution: "usda",
  });
}

function foodById(request: Request, id: string): Response {
  const db = foodDb.get();
  if (!db) return notImported("usda");

  // Accept both "usda:123456" and a bare FDC id.
  const fdcId = Number.parseInt(id.replace(/^usda:/, ""), 10);
  if (!Number.isFinite(fdcId)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  const lookup = db.query("SELECT * FROM foods WHERE fdc_id = ?");
  let row = lookup.get(fdcId) as FoodRow | null;

  // The id may belong to a duplicate that a later import collapsed away.
  if (!row) {
    const alias = db
      .query("SELECT canonical_fdc_id FROM aliases WHERE fdc_id = ?")
      .get(fdcId) as { canonical_fdc_id: number } | null;
    if (alias) row = lookup.get(alias.canonical_fdc_id) as FoodRow | null;
  }

  if (!row) return Response.json({ status: 0, product: null, attribution: "usda" }, { status: 404 });
  return Response.json({
    status: 1,
    product: toCompatProduct(row, portionsFor(db, row.fdc_id)),
    attribution: "usda",
  });
}

function foodByBarcode(barcode: string): Response {
  const db = foodDb.get();
  if (!db) return notImported("usda");

  const key = barcodeKey(barcode);
  if (!key) return Response.json({ error: "invalid_barcode" }, { status: 400 });

  // Prefer a row that actually carries nutrition data: USDA sometimes lists the
  // same GTIN several times, including discontinued entries with no nutrients.
  const row = db
    .query(
      `SELECT * FROM foods
       WHERE barcode_key = ?
       ORDER BY (kcal IS NULL), fdc_id DESC
       LIMIT 1`,
    )
    .get(key) as FoodRow | null;

  if (!row) {
    return Response.json({ status: 0, product: null, attribution: "usda" }, { status: 404 });
  }
  return Response.json({
    status: 1,
    product: toCompatProduct(row, portionsFor(db, row.fdc_id)),
    attribution: "usda",
  });
}

type ExerciseRow = {
  id: number;
  uuid: string;
  name: string;
  category: string | null;
  description: string | null;
  equipment: string;
  primary_muscles: string;
  secondary_muscles: string;
  license: string | null;
  license_author: string | null;
};

function toExercise(db: NonNullable<ReturnType<LiveDatabase["get"]>>, row: ExerciseRow) {
  const images = db
    .query(
      `SELECT url, thumbnail_url, is_main, is_ai, license_author
       FROM exercise_images WHERE exercise_id = ? ORDER BY is_main DESC`,
    )
    .all(row.id) as Record<string, unknown>[];
  const videos = db
    .query("SELECT url FROM exercise_videos WHERE exercise_id = ?")
    .all(row.id) as { url: string }[];

  return {
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    category: row.category,
    description: row.description,
    equipment: JSON.parse(row.equipment) as string[],
    primaryMuscles: JSON.parse(row.primary_muscles) as string[],
    secondaryMuscles: JSON.parse(row.secondary_muscles) as string[],
    images: images.map((image) => ({
      url: image.url,
      thumbnailUrl: image.thumbnail_url,
      isMain: image.is_main === 1,
      isAiGenerated: image.is_ai === 1,
      licenseAuthor: image.license_author,
    })),
    videos: videos.map((video) => video.url),
    // CC-BY-SA 4.0 requires this to be shown wherever the content appears.
    license: row.license,
    licenseAuthor: row.license_author,
  };
}

function searchExercises(request: Request): Response {
  const db = exerciseDb.get();
  if (!db) return notImported("wger");

  const url = new URL(request.url);
  const match = toMatchExpression(url.searchParams.get("q") ?? "");
  if (!match) return Response.json({ exercises: [], attribution: "wger" });

  const rows = db
    .query(
      `SELECT e.* FROM exercises_fts
       JOIN exercises e ON e.id = exercises_fts.rowid
       WHERE exercises_fts MATCH ?
       ORDER BY bm25(exercises_fts) ASC
       LIMIT ?`,
    )
    .all(match, limitOf(url)) as ExerciseRow[];

  return Response.json({
    exercises: rows.map((row) => toExercise(db, row)),
    attribution: "wger",
  });
}

function exerciseById(id: string): Response {
  const db = exerciseDb.get();
  if (!db) return notImported("wger");

  const row = (db.query("SELECT * FROM exercises WHERE id = ?").get(Number.parseInt(id, 10)) ??
    db.query("SELECT * FROM exercises WHERE uuid = ?").get(id)) as ExerciseRow | null;
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ exercise: toExercise(db, row), attribution: "wger" });
}

function stats(): Response {
  const read = (live: LiveDatabase) => {
    const db = live.get();
    if (!db) return { imported: false };
    const rows = db.query("SELECT key, value FROM meta").all() as {
      key: string;
      value: string;
    }[];
    return {
      imported: true,
      ...Object.fromEntries(rows.map((row) => [row.key, row.value])),
    };
  };
  return Response.json({ sources: { usda: read(foodDb), wger: read(exerciseDb) } });
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  // Deliberately no CORS headers: this service is only ever called server-side
  // from Convex, never from a browser.
  routes: {
    "/health": () =>
      Response.json({ status: "ok", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) }),

    "/v1/stats": (req) => requireToken(req, config.apiToken) ?? stats(),
    "/v1/foods/search": (req) => requireToken(req, config.apiToken) ?? searchFoods(req),
    "/v1/foods/:id": (req) => requireToken(req, config.apiToken) ?? foodById(req, req.params.id),
    "/v1/barcodes/:barcode": (req) =>
      requireToken(req, config.apiToken) ?? foodByBarcode(req.params.barcode),
    "/v1/exercises/search": (req) => requireToken(req, config.apiToken) ?? searchExercises(req),
    "/v1/exercises/:id": (req) =>
      requireToken(req, config.apiToken) ?? exerciseById(req.params.id),
  },
  fetch: () => Response.json({ error: "not_found" }, { status: 404 }),
  error: (error) => {
    console.error("unhandled request error", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  },
});

console.log(`datasource listening on http://${server.hostname}:${server.port}`);
