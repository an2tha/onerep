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
 * Initialize the database by enabling required extensions and creating indexes.
 * Uses CONCURRENTLY to avoid locking tables during index creation.
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    console.log("[INFO] Initializing database...");
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    // Use CONCURRENTLY for indexes to avoid blocking production tables
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");
    console.log("[INFO] Database initialization complete");
  } catch (err: any) {
    console.warn("[WARN] Database initialization partially failed:", err.message);
  } finally {
    client.release();
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
