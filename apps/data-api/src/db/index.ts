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
 * Execute a SQL query against the shared PostgreSQL pool and return the resulting rows.
 *
 * @param sql - The SQL statement to execute; may contain positional placeholders like `$1`, `$2`, etc.
 * @param params - Optional array of parameter values to substitute into the query placeholders.
 * @returns The array of rows returned by the query.
 */
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Initialize database extensions and indexes.
 * This should be called once on application startup.
 */
export async function initializeDatabase() {
  console.log("[DB] Initializing database...");
  try {
    await query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    // Note: CREATE INDEX CONCURRENTLY cannot be run within a transaction block.
    // pg.Pool.query and our query helper execute statements individually outside of implicit transactions.
    await query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_trgm_idx ON foodfacts USING gin (name gin_trgm_ops)");
    await query("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_brand_trgm_idx ON foodfacts USING gin (brand gin_trgm_ops)");
    console.log("[DB] Database initialization complete.");
  } catch (err: any) {
    // If the error is that the index already exists, we can safely ignore it.
    if (err.code === "42P07") {
      console.log("[DB] Indexes already exist.");
    } else {
      console.error("[DB] Database initialization failed:", err.message);
    }
  }
}

export { foodfacts, exercises };
export type DB = typeof db;
