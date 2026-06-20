import express, { Request, Response, type Router } from "express";
import pg from "pg";
import { apiLimiter, searchLimiter, strictLimiter } from "../middleware/rateLimit";
import {
  foodIndexExists,
  getFoodIndex,
  getFoodIndexPath,
  type FoodProduct,
} from "../src/lib/foodIndex";

const router: Router = express.Router();

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;

async function query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  if (!pool) {
    const error = new Error("PostgreSQL exercise catalog is not configured");
    error.name = "DatabaseUnavailable";
    throw error;
  }

  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

function numeric(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

function servingParts(product: FoodProduct): { servingSize?: number; servingUnit?: string } {
  if (product.servingGrams && product.servingGrams > 0) {
    return { servingSize: numeric(product.servingGrams), servingUnit: "g" };
  }
  return {};
}

function nutriments(product: FoodProduct): Record<string, number> {
  return {
    "energy-kcal_100g": Math.round(product.calories),
    "energy-kcal": Math.round(product.calories),
    proteins_100g: numeric(product.protein),
    proteins: numeric(product.protein),
    carbohydrates_100g: numeric(product.carbs),
    carbohydrates: numeric(product.carbs),
    fat_100g: numeric(product.fat),
    fat: numeric(product.fat),
    fiber_100g: numeric(product.fiber),
    fiber: numeric(product.fiber),
    sugars_100g: numeric(product.sugars),
    sugars: numeric(product.sugars),
    "saturated-fat_100g": numeric(product.saturatedFat),
    "saturated-fat": numeric(product.saturatedFat),
    sodium_100g: numeric(product.sodium),
    sodium: numeric(product.sodium),
    cholesterol_100g: numeric(product.cholesterol),
    cholesterol: numeric(product.cholesterol),
    calcium_100g: numeric(product.calcium),
    calcium: numeric(product.calcium),
    iron_100g: numeric(product.iron),
    iron: numeric(product.iron),
    potassium_100g: numeric(product.potassium),
    potassium: numeric(product.potassium),
    "vitamin-c_100g": numeric(product.vitaminC),
    "vitamin-c": numeric(product.vitaminC),
  };
}

function foodSource(product: FoodProduct) {
  return {
    code: product.code,
    product_name: product.name,
    name: product.name,
    brands: product.brand || "",
    brand: product.brand || "",
    serving: product.serving,
    ...servingParts(product),
    calories: Math.round(product.calories),
    calories_100g: Math.round(product.calories),
    protein: numeric(product.protein),
    protein_100g: numeric(product.protein),
    carbs: numeric(product.carbs),
    carbs_100g: numeric(product.carbs),
    carbohydrates: numeric(product.carbs),
    carbohydrates_100g: numeric(product.carbs),
    fat: numeric(product.fat),
    fat_100g: numeric(product.fat),
    fiber: numeric(product.fiber),
    sugar: numeric(product.sugars),
    sodium: numeric(product.sodium),
    nutriments: nutriments(product),
    nutriscore_grade: product.nutriscoreGrade,
    nova_group: product.novaGroup,
  };
}

function foodHit(product: FoodProduct) {
  return {
    _id: product.code,
    _source: foodSource(product),
  };
}

function foodDetail(product: FoodProduct) {
  return {
    ...foodSource(product),
    id: product.id,
    externalId: product.code,
    lastModifiedT: product.lastModifiedT,
  };
}

function limitFromRequest(req: Request, fallback = 25, max = 100): number {
  const raw = Number(req.query.limit);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(Math.trunc(raw), max));
}

function handleFoodError(error: unknown, res: Response): void {
  console.error("[FOODS]", error);
  res.status(503).json({
    error: "Food index unavailable",
    message: error instanceof Error ? error.message : "Unknown error",
  });
}

function handleExerciseError(error: unknown, res: Response, fallbackMessage: string): void {
  console.error("[EXERCISES]", error);
  const status = error instanceof Error && error.name === "DatabaseUnavailable" ? 503 : 500;
  res.status(status).json({ error: fallbackMessage });
}

router.use("/foods/search", searchLimiter);
router.use("/foods/nutrients", searchLimiter);
router.use("/exercises/search", searchLimiter);
router.use("/exercises/advanced", searchLimiter);
router.use("/exercises/lookup", apiLimiter);
router.post("/foods", apiLimiter);
router.post("/exercises", apiLimiter);

router.get("/health", async (_req: Request, res: Response) => {
  if (!foodIndexExists()) {
    return res.status(503).json({
      status: "missing_food_index",
      path: getFoodIndexPath(),
    });
  }

  res.json({
    status: "ok",
    foodIndex: getFoodIndex().health(),
  });
});

router.get("/foods/search", async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const limit = limitFromRequest(req, 25, 100);
    const results = getFoodIndex().search({ query: q, limit });
    res.json(results.map(foodHit));
  } catch (error) {
    handleFoodError(error, res);
  }
});

router.get("/foods/nutrients", async (req: Request, res: Response) => {
  try {
    const grade = typeof req.query.grade === "string" ? req.query.grade : undefined;
    const limit = limitFromRequest(req, 100, 250);
    const results = getFoodIndex().nutrients(grade, limit);
    res.json(results.map(foodDetail));
  } catch (error) {
    handleFoodError(error, res);
  }
});

router.get("/foods/barcode/:code", strictLimiter, async (req: Request, res: Response) => {
  try {
    const product = getFoodIndex().getByBarcode(req.params.code);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(foodDetail(product));
  } catch (error) {
    handleFoodError(error, res);
  }
});

router.get("/foods/id/:id", strictLimiter, async (req: Request, res: Response) => {
  try {
    const product = getFoodIndex().getByBarcode(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(foodDetail(product));
  } catch (error) {
    handleFoodError(error, res);
  }
});

router.get("/foods", apiLimiter, async (req: Request, res: Response) => {
  try {
    const limit = limitFromRequest(req, 20, 100);
    res.json(getFoodIndex().browse(limit).map(foodDetail));
  } catch (error) {
    handleFoodError(error, res);
  }
});

// Convex first tries /foods/:id for numeric food IDs. Treat that as barcode lookup.
router.get("/foods/:code", strictLimiter, async (req: Request, res: Response) => {
  try {
    const product = getFoodIndex().getByBarcode(req.params.code);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(foodDetail(product));
  } catch (error) {
    handleFoodError(error, res);
  }
});

router.get("/exercises/search", async (req: Request, res: Response) => {
  const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
  const size = limitFromRequest(req, 25, 50);
  try {
    const results =
      q.length < 2
        ? await query("SELECT * FROM exercises LIMIT $1", [size])
        : await query(
            "SELECT * FROM exercises WHERE name ILIKE $1 OR equipment ILIKE $1 LIMIT $2",
            [`%${q}%`, size],
          );
    const formatted = results.map((row) => ({
      _id: row.exercise_id,
      _source: {
        id: row.exercise_id,
        name: row.name,
        category: row.category,
        level: row.level,
        equipment: row.equipment,
        force: row.force,
        primaryMuscles: typeof row.primary_muscles === "string"
          ? JSON.parse(row.primary_muscles)
          : row.primary_muscles || [],
        secondaryMuscles: typeof row.secondary_muscles === "string"
          ? JSON.parse(row.secondary_muscles)
          : row.secondary_muscles || [],
        instructions: typeof row.instructions === "string"
          ? JSON.parse(row.instructions)
          : row.instructions || [],
      },
    }));
    res.json(formatted);
  } catch (error) {
    handleExerciseError(error, res, "Exercise search failed");
  }
});

router.get("/exercises/lookup", async (req: Request, res: Response) => {
  const raw = req.query.ids as string;
  if (!raw) return res.status(400).json({ error: "ids query param required" });
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  if (ids.length === 0) return res.json([]);
  try {
    const results = await query("SELECT * FROM exercises WHERE exercise_id = ANY($1)", [ids]);
    const formatted = results.map((row) => ({
      _id: row.exercise_id,
      _source: {
        id: row.exercise_id,
        name: row.name,
        category: row.category,
        level: row.level,
        equipment: row.equipment,
        force: row.force,
        primaryMuscles: typeof row.primary_muscles === "string"
          ? JSON.parse(row.primary_muscles)
          : row.primary_muscles || [],
        secondaryMuscles: typeof row.secondary_muscles === "string"
          ? JSON.parse(row.secondary_muscles)
          : row.secondary_muscles || [],
        instructions: typeof row.instructions === "string"
          ? JSON.parse(row.instructions)
          : row.instructions || [],
      },
    }));
    res.json(formatted);
  } catch (error) {
    handleExerciseError(error, res, "Exercise lookup failed");
  }
});

router.get("/exercises/advanced", async (req: Request, res: Response) => {
  const { muscle, equipment, category, force } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (muscle) {
    conditions.push(`primary_muscles::text ILIKE $${i++}`);
    params.push(`%${muscle}%`);
  }
  if (equipment) {
    conditions.push(`equipment ILIKE $${i++}`);
    params.push(`%${equipment}%`);
  }
  if (category) {
    conditions.push(`category = $${i++}`);
    params.push(String(category).toLowerCase());
  }
  if (force) {
    conditions.push(`force = $${i++}`);
    params.push(String(force).toLowerCase());
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const results = await query(`SELECT * FROM exercises ${where} LIMIT 100`, params);
    res.json(results);
  } catch (error) {
    handleExerciseError(error, res, "Exercise search failed");
  }
});

router.get("/exercises/id/:id", strictLimiter, async (req: Request, res: Response) => {
  try {
    const results = await query("SELECT * FROM exercises WHERE exercise_id = $1 LIMIT 1", [
      req.params.id,
    ]);
    if (results.length === 0) return res.status(404).json({ message: "Exercise not found" });
    res.json(results[0]);
  } catch (error) {
    handleExerciseError(error, res, "Exercise lookup failed");
  }
});

router.get("/exercises/:id", strictLimiter, async (req: Request, res: Response) => {
  try {
    const results = await query("SELECT * FROM exercises WHERE exercise_id = $1 LIMIT 1", [
      req.params.id,
    ]);
    if (results.length === 0) return res.status(404).json({ message: "Exercise not found" });
    res.json(results[0]);
  } catch (error) {
    handleExerciseError(error, res, "Exercise lookup failed");
  }
});

router.get("/exercises", apiLimiter, async (req: Request, res: Response) => {
  try {
    const results = await query("SELECT * FROM exercises LIMIT $1", [limitFromRequest(req, 20, 100)]);
    res.json(results);
  } catch (error) {
    handleExerciseError(error, res, "Exercise catalog unavailable");
  }
});

router.post("/foods", async (_req: Request, res: Response) => {
  res.status(501).json({ error: "Custom food creation is handled by Convex" });
});

router.post("/exercises", async (_req: Request, res: Response) => {
  res.status(501).json({ error: "Custom exercise creation is handled by Convex" });
});

export default router;
