require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

import { sql } from "drizzle-orm";
import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import helmet from "helmet";
import { validateApiKey } from "./middleware/auth";
import apiRouter from "./routes/api";
import indexRouter from "./routes/index";

const app = express();

// Database initialization on startup
import { db } from "./src/db/index";

const initDb = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("[INFO] PostgreSQL connected");

    // Enable pg_trgm extension and create GIN indexes
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)`);
    await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)`);
    console.log("[INFO] Database extensions and indexes verified");
  } catch (err: any) {
    console.error("[WARN] Database initialization failed:", err.message);
  }
};

initDb();

app.use(helmet());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/", indexRouter);
app.use("/api/v1", validateApiKey, apiRouter); // Convex expects /api/v1 prefix

// Catch 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERR]", err);
  res.status(err.status || 500).json({ error: "Internal server error" });
});

module.exports = app;
