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
 * Initializes the database by creating necessary extensions and indexes.
 * Runs on server startup to avoid overhead during requests.
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    console.log("[DB] Initializing database...");

    // Extensions
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // Concurrent indexes for search performance
    // Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");

    console.log("[DB] Database initialization complete");
  } catch (err) {
    console.error("[DB] Database initialization failed:", err);
    // We don't necessarily want to crash the whole app if index creation fails,
    // but extensions are often critical.
  } finally {
    client.release();
  }
}
