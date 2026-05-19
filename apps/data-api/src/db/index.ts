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
 * Initialize the database by enabling necessary extensions and creating indexes.
 * This should be called once on application startup.
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    console.log("[INFO] Initializing database...");
    // Enable pg_trgm extension for fuzzy searching
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // Create GIN indexes concurrently for performance
    // Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    // Drizzle's db.execute often uses transactions, so we use the raw client.
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
