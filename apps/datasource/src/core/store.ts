import { Database, type Statement } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { existsSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createIndexSql, createTableSql, schemaTables } from "./ddl.ts";

/**
 * Database lifecycle shared by every provider.
 *
 * An import never touches the live file. It builds `<id>.next.sqlite` from
 * nothing, validates it, and renames it into place, keeping the outgoing file
 * as `<id>.previous.sqlite` for rollback. A failed build is discarded and
 * restarted rather than recovered, which is why the staging database runs with
 * durability switched off.
 */

export function livePath(dataDir: string, id: string): string {
  return join(dataDir, `${id}.sqlite`);
}

export function stagedPath(dataDir: string, id: string): string {
  return join(dataDir, `${id}.next.sqlite`);
}

export function previousPath(dataDir: string, id: string): string {
  return join(dataDir, `${id}.previous.sqlite`);
}

export type Staged<S extends Record<string, unknown>> = {
  /** Typed query builder over the provider's schema. */
  db: BunSQLiteDatabase<S>;
  /** The underlying handle, for FTS5 DDL and explicit transactions. */
  raw: Database;
  /** Deterministically finalizes every statement before closing the handle. */
  close: () => void;
};

/**
 * Closes a staging database and all prepared statements Drizzle created for it.
 * Strict close is required before a Windows filesystem rename.
 */
export function closeStaged<S extends Record<string, unknown>>(staged: Staged<S>): void {
  staged.close();
}

/**
 * Bun's Windows VFS may retain a file lock after close while a Statement is
 * still reachable. Drizzle does not expose its underlying Statements, so
 * capture them at the Database boundary and finalize them explicitly.
 */
function trackStatements(raw: Database): () => void {
  const seen = new WeakSet<Statement>();
  let statements: WeakRef<Statement>[] = [];
  let statementsSinceSweep = 0;
  const prepare = raw.prepare.bind(raw);
  const query = raw.query.bind(raw);

  const track = <T extends Statement>(statement: T): T => {
    if (!seen.has(statement)) {
      seen.add(statement);
      // A weak reference preserves normal GC of one-shot Drizzle queries while
      // still letting close finalize every statement that remains reachable.
      statements.push(new WeakRef(statement));
      statementsSinceSweep += 1;
      if (statementsSinceSweep >= 256) {
        statements = statements.filter((reference) => reference.deref() !== undefined);
        statementsSinceSweep = 0;
      }
    }
    return statement;
  };

  raw.prepare = ((sql: string) => {
    return track(prepare(sql));
  }) as Database["prepare"];
  raw.query = ((sql: string) => {
    return track(query(sql));
  }) as Database["query"];

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    for (const reference of statements) reference.deref()?.finalize();
    statements = [];
    raw.close(true);
  };
}

/**
 * Opens an empty staging database and creates the provider's tables from its
 * Drizzle schema. Indexes are deliberately *not* created here — every importer
 * builds them after the bulk load, where they cost one sort instead of a btree
 * insert per row.
 */
export function openStaged<S extends Record<string, unknown>>(
  dataDir: string,
  id: string,
  schema: S,
): Staged<S> {
  const path = stagedPath(dataDir, id);
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });

  const raw = new Database(path, { create: true, readwrite: true });
  const close = trackStatements(raw);
  // Pragmas are stepped with `.get()` rather than `.exec()`, because the ones
  // that report a resulting value are not applied by `exec()` alone.
  //
  // `journal_mode = OFF` is requested but *not* relied on: Bun's SQLite build
  // refuses it and reports `delete` back, whatever the call style. WAL,
  // TRUNCATE and MEMORY all take, so this is specific to OFF. A rollback
  // journal is therefore always in play during an import, which is exactly why
  // the bulk loaders commit in batches instead of wrapping millions of rows in
  // one transaction — see `commitEvery`.
  raw.query("PRAGMA journal_mode = OFF").get();
  raw.query("PRAGMA synchronous = OFF").get();
  raw.query("PRAGMA temp_store = MEMORY").get();
  // Bounded so an import cannot page the 4 GB host into swap.
  raw.query("PRAGMA cache_size = -262144").get();

  for (const table of schemaTables(schema)) raw.exec(createTableSql(table));

  return { db: drizzle(raw, { schema }), raw, close };
}

/**
 * Runs a bulk load in batched transactions.
 *
 * A single transaction spanning millions of rows is the fast way to load
 * SQLite right up until it isn't: the rollback journal that Bun's build will
 * not let us disable forces the dirty pages of an open transaction to be held,
 * and on the Open Food Facts import that reached the 2 GB cgroup limit within
 * 250,000 products and was OOM-killed. Committing periodically bounds it.
 *
 * The staging database is a throwaway that is only promoted once the whole
 * build succeeds, so a partial commit is never visible to anything — the
 * atomicity that matters is the file swap, not the transaction.
 */
export function commitEvery(raw: Database, rows: number, batchSize = 50_000): void {
  if (rows > 0 && rows % batchSize === 0) {
    raw.exec("COMMIT");
    raw.exec("BEGIN");
  }
}

/** Creates every index declared on the provider's Drizzle schema. */
export function createIndexes<S extends Record<string, unknown>>(
  staged: Staged<S>,
  schema: S,
): void {
  for (const table of schemaTables(schema)) {
    for (const statement of createIndexSql(table)) staged.raw.exec(statement);
  }
}

/**
 * Validates a staged database and swaps it in, keeping the outgoing file as a
 * rollback copy. A failure here leaves the running server untouched.
 */
export function promote(dataDir: string, id: string, expectedRows: number): void {
  const staged = stagedPath(dataDir, id);
  const live = livePath(dataDir, id);
  const previous = previousPath(dataDir, id);

  const db = new Database(staged, { readonly: true });
  const close = trackStatements(db);
  try {
    const integrity = db.query("PRAGMA integrity_check").get() as Record<string, string>;
    const result = Object.values(integrity)[0];
    if (result !== "ok") throw new Error(`integrity_check failed: ${result}`);
    if (expectedRows <= 0) throw new Error("refusing to promote an empty database");
  } finally {
    close();
  }

  replaceDatabaseFiles(staged, live, previous);
}

type Rename = typeof renameSync;

/** Restores the live pathname if the second half of a promotion fails. */
export function replaceDatabaseFiles(
  staged: string,
  live: string,
  previous: string,
  rename: Rename = renameSync,
): void {
  let liveMoved = false;
  if (existsSync(live)) {
    rmSync(previous, { force: true });
    rename(live, previous);
    liveMoved = true;
  }

  try {
    rename(staged, live);
  } catch (promotionError) {
    if (liveMoved && !existsSync(live) && existsSync(previous)) {
      try {
        rename(previous, live);
      } catch (restoreError) {
        throw new AggregateError(
          [promotionError, restoreError],
          `failed to promote ${staged} and restore ${live}`,
        );
      }
    }
    throw promotionError;
  }
}

export function rollback(dataDir: string, id: string): void {
  const live = livePath(dataDir, id);
  const previous = previousPath(dataDir, id);
  if (!existsSync(previous)) throw new Error(`no rollback database for ${id}`);
  const spare = `${live}.rollback-swap`;
  if (existsSync(live)) renameSync(live, spare);
  renameSync(previous, live);
  if (existsSync(spare)) renameSync(spare, previous);
}

/**
 * A read-only handle to a live database that reopens itself after a promotion
 * replaces the file underneath it. The inode is re-checked at most once per
 * interval, so the common request path stays a single cached lookup.
 *
 * Returns null until the provider has been imported for the first time.
 */
export class LiveStore<S extends Record<string, unknown>> {
  private raw: Database | null = null;
  private db: BunSQLiteDatabase<S> | null = null;
  private closeRaw: (() => void) | null = null;
  private inode: number | null = null;
  private checkedAt = 0;

  constructor(
    private readonly path: string,
    private readonly schema: S,
    private readonly recheckMs = 10_000,
  ) {}

  get(): BunSQLiteDatabase<S> | null {
    const now = Date.now();
    if (this.db && now - this.checkedAt < this.recheckMs) return this.db;
    this.checkedAt = now;

    if (!existsSync(this.path)) {
      this.close();
      return null;
    }

    const inode = statSync(this.path).ino;
    if (this.db && inode === this.inode) return this.db;

    this.close();
    this.raw = new Database(this.path, { readonly: true });
    this.closeRaw = trackStatements(this.raw);
    this.db = drizzle(this.raw, { schema: this.schema });
    this.inode = inode;
    return this.db;
  }

  /** The raw handle behind {@link get}, for FTS5 queries Drizzle cannot type. */
  rawHandle(): Database | null {
    this.get();
    return this.raw;
  }

  close(): void {
    const closeRaw = this.closeRaw;
    this.closeRaw = null;
    this.raw = null;
    this.db = null;
    this.inode = null;
    closeRaw?.();
  }
}
