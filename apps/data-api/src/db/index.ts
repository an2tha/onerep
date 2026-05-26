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
 * Uses a direct client from the pool to allow concurrent index creation.
 */
export async function initDb() {
  console.log("[INFO] Initializing database...");
  const client = await pool.connect();
  try {
    // pg_trgm for fast text search
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    // Concurrent index creation must happen outside of a transaction block
    // These indexes help search performance and prevent potential DoS through heavy queries
    await client.query(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)"
    );
    await client.query(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)"
    );

    console.log("[INFO] Database initialization complete.");
  } catch (err) {
    console.error("[WARN] Database initialization failed:", (err as Error).message);
  } finally {
    client.release();
  }
}
