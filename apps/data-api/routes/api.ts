import express, { Request, Response, type Router } from "express";
import pg from "pg";
import { apiLimiter, searchLimiter, strictLimiter } from "../middleware/rateLimit";
import { searchQuerySchema, exerciseSearchSchema, barcodeSchema, idParamSchema, idsQuerySchema } from "../lib/validation";

const router: Router = express.Router();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Execute a SQL query against the module's PostgreSQL pool and return the resulting rows.
 *
 * @param sql - The SQL statement to execute; may contain positional placeholders like `$1`, `$2`, etc.
 * @param params - Optional array of parameter values to substitute into the query placeholders.
 * @returns The array of rows returned by the query.
 */
async function query(sql: string, params: any[] = []): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

router.use("/foods/search", searchLimiter);
router.use("/foods/nutrients", searchLimiter);
router.use("/exercises/search", searchLimiter);
router.use("/exercises/advanced", searchLimiter);
router.use("/exercises/lookup", apiLimiter);
router.post("/foods", apiLimiter);
router.post("/exercises", apiLimiter);

// Foods
router.get("/foods/search", async (req: Request, res: Response) => {
  const q = req.query.q as string || "";
  const limit = Math.min(Number(req.query.limit) || 25, 50);
  try {
    // Enable pg_trgm extension and create GIN indexes on first run
    await query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");

    const results = await query(
      "SELECT * FROM foodfacts WHERE name ILIKE $1 OR brand ILIKE $1 LIMIT $2",
      [`%${q}%`, limit]
    );
    // Return in format Convex expects
    const formatted = results.map(row => ({
      _id: row.code,
      _source: {
        code: row.code,
        product_name: row.name,
        brands: row.brand,
        calories_100g: row.calories,
        protein_100g: row.protein,
        carbs_100g: row.carbs,
        fat_100g: row.fat,
        nutriscore_grade: row.nutriscore_grade,
        nova_group: row.nova_group,
      }
    }));
    res.json(formatted);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/foods/nutrients", async (req: Request, res: Response) => {
  const { grade } = req.query;
  try {
    let results;
    if (grade) {
      results = await query("SELECT * FROM foodfacts WHERE nutriscore_grade = $1 LIMIT 100", [String(grade).toUpperCase()]);
    } else {
      results = await query("SELECT * FROM foodfacts LIMIT 100");
    }
    res.json(results);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/foods/barcode/:code", strictLimiter, async (req: Request, res: Response) => {
  try {
    const results = await query("SELECT * FROM foodfacts WHERE code = $1 LIMIT 1", [req.params.code]);
    if (results.length === 0) return res.status(404).json({ message: "Product not found" });
    const row = results[0];
    // Return in format Convex expects
    res.json({
      code: row.code,
      product_name: row.name,
      brands: row.brand,
      nutriments: {
        "energy-kcal_100g": row.calories,
        "proteins_100g": row.protein,
        "carbohydrates_100g": row.carbs,
        "fat_100g": row.fat,
      },
      nutriscore_grade: row.nutriscore_grade,
      nova_group: row.nova_group,
    });
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/foods/id/:id", strictLimiter, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const results = await query("SELECT * FROM foodfacts WHERE id = $1 LIMIT 1", [id]);
    if (results.length === 0) return res.status(404).json({ message: "Product not found" });
    res.json(results[0]);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/foods", apiLimiter, async (_req: Request, res: Response) => {
  try {
    const results = await query("SELECT * FROM foodfacts LIMIT 20");
    res.json(results);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Exercises
router.get("/exercises/search", async (req: Request, res: Response) => {
  const q = (req.query.q as string || "").trim();
  const size = Math.min(Number(req.query.limit) || 25, 50);
  try {
    let results;
    if (q.length < 2) {
      results = await query("SELECT * FROM exercises LIMIT $1", [size]);
    } else {
      results = await query(
        "SELECT * FROM exercises WHERE name ILIKE $1 OR equipment ILIKE $1 LIMIT $2",
        [`%${q}%`, size]
      );
    }
    // Return in format Convex expects
    const formatted = results.map(row => ({
      _id: row.exercise_id,
      _source: {
        id: row.exercise_id,
        name: row.name,
        category: row.category,
        level: row.level,
        equipment: row.equipment,
        force: row.force,
        primaryMuscles: typeof row.primary_muscles === 'string' ? JSON.parse(row.primary_muscles) : (row.primary_muscles || []),
        secondaryMuscles: typeof row.secondary_muscles === 'string' ? JSON.parse(row.secondary_muscles) : (row.secondary_muscles || []),
        instructions: typeof row.instructions === 'string' ? JSON.parse(row.instructions) : (row.instructions || []),
      }
    }));
    res.json(formatted);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/exercises/lookup", async (req: Request, res: Response) => {
  const validation = idsQuerySchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });
  const { ids } = validation.data;
  if (ids.length === 0) return res.json([]);
  try {
    const results = await query("SELECT * FROM exercises WHERE exercise_id = ANY($1)", [ids]);
    const formatted = results.map(row => ({
      _id: row.exercise_id,
      _source: {
        id: row.exercise_id,
        name: row.name,
        category: row.category,
        level: row.level,
        equipment: row.equipment,
        force: row.force,
        primaryMuscles: typeof row.primary_muscles === 'string' ? JSON.parse(row.primary_muscles) : (row.primary_muscles || []),
        secondaryMuscles: typeof row.secondary_muscles === 'string' ? JSON.parse(row.secondary_muscles) : (row.secondary_muscles || []),
        instructions: typeof row.instructions === 'string' ? JSON.parse(row.instructions) : (row.instructions || []),
      }
    }));
    res.json(formatted);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

router.get("/exercises/advanced", async (req: Request, res: Response) => {
  const validation = exerciseSearchSchema.safeParse(req.query);
  if (!validation.success) return res.status(400).json({ error: validation.error.format() });
  const { muscle, equipment, category, force } = validation.data;
  const conditions: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (muscle) { conditions.push(`primary_muscles::text ILIKE $${i++}`); params.push(`%${muscle}%`); }
  if (equipment) { conditions.push(`equipment ILIKE $${i++}`); params.push(`%${equipment}%`); }
  if (category) { conditions.push(`category = $${i++}`); params.push(String(category).toLowerCase()); }
  if (force) { conditions.push(`force = $${i++}`); params.push(String(force).toLowerCase()); }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  try {
    const results = await query(`SELECT * FROM exercises ${where} LIMIT 100`, params);
    res.json(results);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/exercises/id/:id", strictLimiter, async (req: Request, res: Response) => {
  try {
    const results = await query("SELECT * FROM exercises WHERE exercise_id = $1 LIMIT 1", [req.params.id]);
    if (results.length === 0) return res.status(404).json({ message: "Exercise not found" });
    res.json(results[0]);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/exercises", apiLimiter, async (_req: Request, res: Response) => {
  try {
    const results = await query("SELECT * FROM exercises LIMIT 20");
    res.json(results);
  } catch (err) {
    console.error("[ERR]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/foods", async (_req: Request, res: Response) => {
  res.status(501).json({ error: "Custom food creation not implemented" });
});

router.post("/exercises", async (_req: Request, res: Response) => {
  res.status(501).json({ error: "Custom exercise creation not implemented" });
});

export default router;