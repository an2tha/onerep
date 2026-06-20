import { Router, Request, Response } from "express";
import pg from "pg";
import { foodIndexExists, getFoodIndex, getFoodIndexPath } from "../src/lib/foodIndex";

const router: Router = Router();
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;

async function postgresHealth(): Promise<"ok" | "unavailable"> {
  if (!pool) return "unavailable";

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Database health check timeout")), 5000)
  );
  const healthCheckPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  })();

  try {
    await Promise.race([healthCheckPromise, timeoutPromise]);
    return "ok";
  } catch (error) {
    console.error("[HEALTH] Database check failed:", error);
    return "unavailable";
  }
}

router.get("/", async (_req: Request, res: Response) => {
  const foodIndex = foodIndexExists() ? getFoodIndex().health() : null;
  const postgres = await postgresHealth();
  const healthy = Boolean(foodIndex) && postgres === "ok";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    postgres,
    foodIndex: foodIndex ?? {
      path: getFoodIndexPath(),
      message: 'Run "bun run food:index" in apps/data-api to build the index.',
    },
    endpoints: {
      foods: [
        "/api/v1/foods",
        "/api/v1/foods/search",
        "/api/v1/foods/barcode/:code",
        "/api/v1/foods/nutrients",
      ],
      exercises: [
        "/api/v1/exercises",
        "/api/v1/exercises/search",
        "/api/v1/exercises/id/:id",
        "/api/v1/exercises/advanced",
        "/api/v1/exercises/lookup",
      ],
    },
  });
});

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

export default router;
