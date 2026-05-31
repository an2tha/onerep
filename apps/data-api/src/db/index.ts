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
 * Initializes the database by enabling required extensions and creating indexes.
 * This should be called once during application startup.
 */
export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log("[INFO] Initializing database extensions and indexes...");
    // pg_trgm is needed for ILIKE and fuzzy search performance
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    // Create GIN indexes for efficient text searching.
    // Note: CREATE INDEX CONCURRENTLY is not allowed within a transaction block.
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");
    console.log("[INFO] Database initialization complete.");
  } catch (err) {
    console.error("[WARN] Database initialization failed:", err instanceof Error ? err.message : err);
  } finally {
    client.release();
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
