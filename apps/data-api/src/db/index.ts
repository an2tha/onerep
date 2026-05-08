import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { foodfacts, exercises } from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("[ERROR] DATABASE_URL is not set in environment variables");
}

const pool = new pg.Pool({
  connectionString,
});

export const db = drizzle(pool);
export { foodfacts, exercises };
export type DB = typeof db;
