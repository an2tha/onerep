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
export { foodfacts, exercises };
export type DB = typeof db;

/**
 * Performs one-time database initialization.
 * Enables required extensions and creates performance-optimizing indexes.
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    // Enable pg_trgm for fuzzy search support
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // Create GIN indexes concurrently to avoid locking the table during creation
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");

    console.log("[DB] Initialization complete (extensions and indexes verified)");
  } catch (err) {
    console.error("[DB] Initialization failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
