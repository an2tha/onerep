import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

/**
 * Every provider database carries the same key/value table recording what was
 * imported and when, which is what `/v1/stats` reads. Providers include this in
 * their own schema object so it is created alongside their tables.
 */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type MetaSchema = { meta: typeof meta };

export function writeMeta(
  db: BunSQLiteDatabase<Record<string, unknown>>,
  entries: Record<string, string | number>,
): void {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value: String(value) }));
  if (rows.length > 0) db.insert(meta).values(rows).run();
}

export function readMeta(db: BunSQLiteDatabase<Record<string, unknown>>): Record<string, string> {
  const rows = db.select().from(meta).all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
