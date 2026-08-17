import { getTableConfig, SQLiteSyncDialect, type SQLiteTable } from "drizzle-orm/sqlite-core";

/**
 * Emits CREATE TABLE / CREATE INDEX from a Drizzle schema.
 *
 * Providers build a brand new database on every import and swap it into place,
 * so there is nothing to migrate and no reason to keep drizzle-kit around. What
 * we do want is for the Drizzle tables to be the only place a column is ever
 * declared — this turns them into the DDL that creates the file, so a schema
 * and the queries typed against it cannot drift apart.
 *
 * FTS5 virtual tables have no Drizzle representation and stay raw SQL in the
 * providers that want one.
 */

const dialect = new SQLiteSyncDialect();

export function createTableSql(table: SQLiteTable): string {
  const config = getTableConfig(table);
  const primaries = config.columns.filter((column) => column.primary);

  const definitions = config.columns.map((column) => {
    const parts = [`"${column.name}"`, column.getSQLType().toUpperCase()];
    if (primaries.length === 1 && column.primary) {
      // A single INTEGER PRIMARY KEY aliases the rowid, which is the difference
      // between an update-by-id and a scan of two million rows per statement.
      parts.push("PRIMARY KEY");
    } else if (column.notNull) {
      parts.push("NOT NULL");
    }
    if (column.hasDefault && column.default !== undefined) {
      parts.push(`DEFAULT ${literal(column.default)}`);
    }
    return `  ${parts.join(" ")}`;
  });

  if (primaries.length > 1) {
    definitions.push(`  PRIMARY KEY (${primaries.map((c) => `"${c.name}"`).join(", ")})`);
  }

  return `CREATE TABLE "${config.name}" (\n${definitions.join(",\n")}\n)`;
}

function literal(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  throw new Error(`unsupported column default: ${String(value)}`);
}

/**
 * Index DDL, separate from the table DDL because every importer creates its
 * indexes after the bulk load rather than before it.
 */
export function createIndexSql(table: SQLiteTable): string[] {
  const config = getTableConfig(table);
  return config.indexes.map((index) => {
    const { name, unique, columns, where } = index.config;
    const target = columns.map((column) => {
      const named = column as { name?: unknown };
      if (typeof named.name !== "string") {
        throw new Error(`index ${name} indexes an expression this emitter cannot render`);
      }
      return `"${named.name}"`;
    });
    const parts = [
      `CREATE${unique ? " UNIQUE" : ""} INDEX "${name}"`,
      `ON "${config.name}" (${target.join(", ")})`,
    ];
    if (where) {
      const { params, sql } = dialect.sqlToQuery(where);
      // A parameterised partial index would be meaningless — the predicate is
      // stored in the schema, not bound per statement.
      if (params.length > 0) throw new Error(`index ${name} has a parameterised WHERE clause`);
      parts.push(`WHERE ${sql}`);
    }
    return parts.join(" ");
  });
}

/** Every table and index in a provider's schema module, in declaration order. */
export function schemaTables(schema: Record<string, unknown>): SQLiteTable[] {
  return Object.values(schema).filter(
    (value): value is SQLiteTable =>
      typeof value === "object" && value !== null && Symbol.for("drizzle:Name") in value,
  );
}
