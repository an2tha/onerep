import type { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";

/**
 * Two places where Drizzle's SQLite typings do not reach, wrapped once here so
 * the providers stay readable.
 */

/**
 * A bind placeholder usable inside `.set()`.
 *
 * `sql.placeholder` on its own is rejected by the `.set()` signature, which
 * accepts only values, columns and `SQL`. Wrapping it in a template makes it an
 * `SQL` node that still binds by name, which is what lets the nutrient pass use
 * one prepared statement per column instead of rebuilding the query per row.
 */
export function bind(name: string) {
  return sql`${sql.placeholder(name)}`;
}

/**
 * Rows affected by the statement that just ran.
 *
 * `drizzle-orm/bun-sqlite` types `.run()` as returning void even though it
 * hands back a result object, so this asks SQLite directly rather than lying
 * about the return type.
 */
export function changes(raw: Database): number {
  return (raw.query("SELECT changes() AS n").get() as { n: number } | null)?.n ?? 0;
}
