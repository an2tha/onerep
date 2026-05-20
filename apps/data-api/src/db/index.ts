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
 * Initializes the database by ensuring required extensions and indexes exist.
 * This should be called during application startup.
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    console.log("[INFO] Initializing database...");

    // Enable pg_trgm extension for fuzzy search
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // Create GIN indexes concurrently to avoid locking the tables
    // Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");

    console.log("[INFO] Database initialization complete");
  } catch (err) {
    console.error("[ERR] Database initialization failed:", err);
    // We don't necessarily want to crash if index creation fails (e.g. already exists but not by name)
    // but extension failure might be critical. For now, we throw to be safe and ensure visibility.
    throw err;
  } finally {
    client.release();
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
