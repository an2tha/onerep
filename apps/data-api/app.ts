require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

import { sql } from "drizzle-orm";
import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import apiRouter from "./routes/api";
import indexRouter from "./routes/index";
import { validateApiKey } from "./middleware/auth";

const app = express();

// Test PostgreSQL connection on startup
import { db } from "./src/db/index";

db.execute(sql`SELECT 1`)
  .then(() => console.log("[INFO] PostgreSQL connected"))
  .catch((err: Error) => console.error("[WARN] PostgreSQL connection failed:", err.message));

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/", indexRouter);
app.use("/api/v1", validateApiKey, apiRouter);  // Convex expects /api/v1 prefix

// Catch 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = app;
