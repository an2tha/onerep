import { Database } from "bun:sqlite";
import { existsSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export type SourceName = "usda" | "wger";

export function livePath(dataDir: string, source: SourceName): string {
  return join(dataDir, `${source}.sqlite`);
}

export function stagedPath(dataDir: string, source: SourceName): string {
  return join(dataDir, `${source}.next.sqlite`);
}

export function previousPath(dataDir: string, source: SourceName): string {
  return join(dataDir, `${source}.previous.sqlite`);
}

/**
 * Opens a fresh staging database. Durability pragmas are disabled because a
 * failed build is discarded and restarted rather than recovered.
 */
export function openStaged(dataDir: string, source: SourceName): Database {
  const path = stagedPath(dataDir, source);
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  const db = new Database(path, { create: true, readwrite: true });
  db.exec("PRAGMA journal_mode = OFF");
  db.exec("PRAGMA synchronous = OFF");
  db.exec("PRAGMA temp_store = MEMORY");
  // Bounded so an import cannot page the 4 GB host into swap.
  db.exec("PRAGMA cache_size = -262144");
  return db;
}

/**
 * Validates a staged database and swaps it into place, keeping the outgoing
 * database as a rollback copy. The live database is never modified in place,
 * so a failure here leaves the running server untouched.
 */
export function promote(dataDir: string, source: SourceName, expectedRows: number): void {
  const staged = stagedPath(dataDir, source);
  const live = livePath(dataDir, source);
  const previous = previousPath(dataDir, source);

  const db = new Database(staged, { readonly: true });
  try {
    const integrity = db.query("PRAGMA integrity_check").get() as Record<string, string>;
    const result = Object.values(integrity)[0];
    if (result !== "ok") throw new Error(`integrity_check failed: ${result}`);
    if (expectedRows <= 0) throw new Error("refusing to promote an empty database");
  } finally {
    db.close();
  }

  if (existsSync(live)) {
    rmSync(previous, { force: true });
    renameSync(live, previous);
  }
  renameSync(staged, live);
}

export function rollback(dataDir: string, source: SourceName): void {
  const live = livePath(dataDir, source);
  const previous = previousPath(dataDir, source);
  if (!existsSync(previous)) throw new Error(`no rollback database for ${source}`);
  const spare = `${live}.rollback-swap`;
  if (existsSync(live)) renameSync(live, spare);
  renameSync(previous, live);
  if (existsSync(spare)) renameSync(spare, previous);
}

/**
 * Holds a read-only handle to a live database and reopens it after a promotion
 * replaces the file. The inode is re-checked at most once per interval so the
 * common request path stays a single cached lookup.
 */
export class LiveDatabase {
  private db: Database | null = null;
  private inode: number | null = null;
  private checkedAt = 0;

  constructor(
    private readonly path: string,
    private readonly recheckMs = 10_000,
  ) {}

  get(): Database | null {
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
    this.db = new Database(this.path, { readonly: true });
    this.inode = inode;
    return this.db;
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.inode = null;
  }
}
