import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { foodfacts, exercises } from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

/**
 * Initialize database with extensions and indexes
 */
export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    // These GIN indexes are expensive to build on large datasets, but the first search will be slow without them.
    // We create them concurrently to avoid locking the table if they are being added after data is loaded.
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");
    console.log("[INFO] Database initialized with extensions and indexes");
  } catch (err) {
    console.error("[ERR] Database initialization failed:", err);
  } finally {
    client.release();
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
