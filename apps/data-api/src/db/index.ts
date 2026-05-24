import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { foodfacts, exercises } from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

/**
 * Initializes the database by creating necessary extensions and indexes.
 * Uses a dedicated client for CONCURRENTLY index creation which cannot run in a transaction.
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    console.log("[DB] Initializing database...");
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // Create GIN indexes for fuzzy search if they don't exist
    // CONCURRENTLY avoids locking the table during index creation
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");

    console.log("[DB] Database initialization complete.");
  } catch (err) {
    console.error("[DB] Database initialization failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
