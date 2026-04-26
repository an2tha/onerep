require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

import { sql } from "drizzle-orm";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "morgan";
import { validateApiKey } from "./middleware/auth";
import apiRouter from "./routes/api";
import indexRouter from "./routes/index";

const app = express();

// Test PostgreSQL connection on startup
import { db } from "./src/db/index";

db.execute(sql`SELECT 1`)
  .then(() => console.log("[INFO] PostgreSQL connected"))
  .catch((err: Error) => console.error("[WARN] PostgreSQL connection failed:", err.message));

app.use(helmet());
app.use(cors()); // In production, this should be restricted to specific origins
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/", indexRouter);
app.use("/api/v1", validateApiKey, apiRouter); // Protect all API v1 routes

// Catch 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = app;
