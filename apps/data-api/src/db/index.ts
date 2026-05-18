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

/**
 * Initializes the database by enabling required extensions and creating indexes concurrently.
 */
export async function initDb() {
  console.log("[INFO] Initializing database...");
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    // CREATE INDEX CONCURRENTLY cannot be run inside a transaction block.
    // Drizzle's db.execute often uses transactions, so we use the pg client directly.
    await client.query(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)",
    );
    await client.query(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)",
    );
    console.log("[INFO] Database initialization complete.");
  } catch (err) {
    console.error("[ERR] Database initialization failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

export const db = drizzle(pool);
export { foodfacts, exercises };
export type DB = typeof db;
