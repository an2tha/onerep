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
 * Initialize the database by creating necessary extensions and indexes.
 * This should be called once during application startup.
 */
export const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    // Using CONCURRENTLY is safer for production but requires care;
    // here we ensure indexes exist for the search functionality.
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");
    console.log("[INFO] PostgreSQL initialized (extensions and indexes)");
  } catch (err) {
    console.error("[WARN] Database initialization failed:", (err as Error).message);
  } finally {
    client.release();
  }
};

export { foodfacts, exercises };
export type DB = typeof db;
