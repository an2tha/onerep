import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createIndexSql, createTableSql, schemaTables } from "./ddl.ts";
import { schema as usdaSchema } from "../providers/usda/schema.ts";
import { schema as wgerSchema } from "../providers/wger/schema.ts";

const sample = sqliteTable(
  "sample",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    nickname: text("nickname"),
    weight: real("weight"),
    flag: integer("flag").notNull().default(0),
  },
  (table) => [
    index("sample_nickname")
      .on(table.nickname)
      .where(sql`${table.nickname} IS NOT NULL`),
    uniqueIndex("sample_name").on(table.name),
  ],
);

test("keeps a lone integer primary key inline so it aliases the rowid", () => {
  // Without this, every UPDATE ... WHERE fdc_id = ? scans the table, which on a
  // two-million row import is the difference between minutes and hours.
  expect(createTableSql(sample)).toContain(`"id" INTEGER PRIMARY KEY`);
});

test("emits nullability and defaults", () => {
  const ddl = createTableSql(sample);
  expect(ddl).toContain(`"name" TEXT NOT NULL`);
  expect(ddl).toContain(`"nickname" TEXT`);
  expect(ddl).not.toContain(`"nickname" TEXT NOT NULL`);
  expect(ddl).toContain(`"flag" INTEGER NOT NULL DEFAULT 0`);
});

test("emits unique and partial indexes", () => {
  const statements = createIndexSql(sample);
  expect(statements).toContain(`CREATE INDEX "sample_nickname" ON "sample" ("nickname") WHERE "sample"."nickname" IS NOT NULL`);
  expect(statements).toContain(`CREATE UNIQUE INDEX "sample_name" ON "sample" ("name")`);
});

test("produces DDL SQLite actually accepts", () => {
  const db = new Database(":memory:");
  db.exec(createTableSql(sample));
  for (const statement of createIndexSql(sample)) db.exec(statement);

  db.query(`INSERT INTO sample (id, name) VALUES (1, 'a')`).run();
  expect(db.query("SELECT id, name, flag FROM sample").get()).toEqual({
    id: 1,
    name: "a",
    flag: 0,
  });
  db.close();
});

/**
 * The schemas are the only declaration of these tables, so a change that SQLite
 * would reject must fail here rather than at 3am on the import box.
 */
test.each([
  ["usda", usdaSchema],
  ["wger", wgerSchema],
])("%s schema creates cleanly", (_name, schema) => {
  const db = new Database(":memory:");
  const tables = schemaTables(schema);
  expect(tables.length).toBeGreaterThan(0);
  for (const table of tables) db.exec(createTableSql(table));
  for (const table of tables) {
    for (const statement of createIndexSql(table)) db.exec(statement);
  }
  db.close();
});

test("finds every table in a schema module and nothing else", () => {
  const names = schemaTables({ ...usdaSchema, FTS_DDL: "not a table", n: 5 }).length;
  expect(names).toBe(Object.keys(usdaSchema).length);
});
