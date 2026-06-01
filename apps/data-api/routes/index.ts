import { Router, Request, Response } from "express";
import { pool } from "../src/db/index";

const router: Router = Router();

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
        foods: ["/api/v1/foods", "/api/v1/foods/search", "/api/v1/foods/barcode/:code", "/api/v1/foods/nutrients"],
        exercises: ["/api/v1/exercises", "/api/v1/exercises/search", "/api/v1/exercises/id/:id", "/api/v1/exercises/advanced", "/api/v1/exercises/lookup"]
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
