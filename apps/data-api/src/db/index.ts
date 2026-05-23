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
 * This should be called once during application startup.
 */
export async function initDb() {
  const client = await pool.connect();
  try {
    console.log("[INFO] Initializing database extensions and indexes...");
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // Concurrent index creation must happen outside of a transaction.
    // Drizzle's db.execute might use transactions, so we use the raw client.
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");
    console.log("[INFO] Database initialization complete");
  } catch (err) {
    console.error("[ERR] Database initialization failed:", err);
    // We don't throw here to allow the app to start even if indexing fails,
    // but in a production environment, this might be a fatal error.
  } finally {
    client.release();
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
