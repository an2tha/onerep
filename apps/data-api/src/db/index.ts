import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { foodfacts, exercises } from "./schema";
import { sql } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

/**
 * Initializes the database by enabling required extensions and creating indexes.
 * This should be called once during application startup.
 */
export async function initializeDatabase() {
  console.log("[DB] Initializing database...");
  try {
    // pg_trgm for fuzzy search
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // GIN indexes for foodfacts search.
    // NOTE: CREATE INDEX CONCURRENTLY cannot be run inside a transaction block.
    // Drizzle's db.execute might use a client from the pool.
    // To be safe and ensure it's not in a transaction, we can use the pool directly.
    const client = await pool.connect();
    try {
      await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
      await client.query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");
    } finally {
      client.release();
    }

    console.log("[DB] Database initialization complete.");
  } catch (err) {
    console.error("[DB] Database initialization failed:", err instanceof Error ? err.message : err);
    // We don't throw here to allow the app to start even if indexes fail (e.g. permission issues),
    // but search performance might be degraded.
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
