import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { foodfacts, exercises } from "./schema";

const connectionString = process.env.DATABASE_URL || "postgresql://onerep:onerep_dev@localhost:5433/onerep_data";

const pool = new pg.Pool({
  connectionString,
});

export const db = drizzle(pool);
export { foodfacts, exercises };
export type DB = typeof db;
