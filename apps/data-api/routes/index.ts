import { Router, Request, Response } from "express";
import pg from "pg";

const router: Router = Router();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    // Perform liveness check with timeout
    const timeoutPromise = new Promise((_, reject) =>
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

    await Promise.race([healthCheckPromise, timeoutPromise]);

    res.json({
      status: "ok",
      endpoints: {
        foods: ["/api/foods", "/api/foods/search", "/api/foods/barcode/:code", "/api/foods/nutrients"],
        exercises: ["/api/exercises", "/api/exercises/search", "/api/exercises/id/:id", "/api/exercises/advanced", "/api/exercises/lookup"]
      }
    });
  } catch (err) {
    console.error("[HEALTH] Database check failed:", err);
    res.status(503).json({
      status: "error",
      message: "Database unavailable"
    });
  }
});

export default router;