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

// Test PostgreSQL connection and initialize DB on startup
import { db, initDb } from "./src/db/index";

if (!process.env.DATA_API_KEY && process.env.NODE_ENV === "production") {
  throw new Error("DATA_API_KEY environment variable is required in production");
}

db.execute(sql`SELECT 1`)
  .then(async () => {
    console.log("[INFO] PostgreSQL connected");
    await initDb();
  })
  .catch((err: Error) => console.error("[WARN] PostgreSQL initialization failed:", err.message));

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
