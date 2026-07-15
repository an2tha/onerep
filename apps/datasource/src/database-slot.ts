import { existsSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatasourceDatabase } from "./database.ts";

function removeDatabaseFiles(path: string): void {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) rmSync(candidate, { force: true });
}

export class AtomicDatabaseSlot {
  private current: DatasourceDatabase;
  private building = false;
  readonly previousPath: string;

  constructor(readonly kind: "usda" | "off", readonly path: string) {
    this.previousPath = join(dirname(path), `${kind}.previous.sqlite`);
    // Recover from a process interruption between moving the old database and
    // promoting the staged database.
    if (!existsSync(path) && existsSync(this.previousPath)) renameSync(this.previousPath, path);
    this.current = new DatasourceDatabase(kind, path);
  }

  get db(): DatasourceDatabase { return this.current; }
  get isBuilding(): boolean { return this.building; }
  get hasRollback(): boolean { return existsSync(this.previousPath); }

  async buildAndPromote(jobId: string, build: (database: DatasourceDatabase) => Promise<number>): Promise<number> {
    if (this.building) throw new Error(`${this.kind} database build is already running`);
    this.building = true;
    const nextPath = join(dirname(this.path), `${this.kind}.${jobId}.next.sqlite`);
    removeDatabaseFiles(nextPath);
    const staged = new DatasourceDatabase(this.kind, nextPath);
    try {
      const rows = await build(staged);
      if (rows <= 0) throw new Error(`Refusing to promote an empty ${this.kind} database`);
      if (!staged.integrityCheck()) throw new Error(`Staged ${this.kind} database failed SQLite integrity_check`);
      staged.optimize(); staged.close();
      this.promote(nextPath);
      return rows;
    } catch (error) {
      try { staged.close(); } catch {}
      removeDatabaseFiles(nextPath);
      throw error;
    } finally {
      this.building = false;
    }
  }

  private promote(nextPath: string): void {
    this.current.optimize(); this.current.close();
    removeDatabaseFiles(this.previousPath);
    if (existsSync(this.path)) renameSync(this.path, this.previousPath);
    try {
      renameSync(nextPath, this.path);
      this.current = new DatasourceDatabase(this.kind, this.path);
      if (!this.current.integrityCheck()) throw new Error(`Promoted ${this.kind} database failed integrity_check`);
    } catch (error) {
      try { this.current.close(); } catch {}
      removeDatabaseFiles(this.path);
      if (existsSync(this.previousPath)) renameSync(this.previousPath, this.path);
      this.current = new DatasourceDatabase(this.kind, this.path);
      throw error;
    }
  }

  rollback(): void {
    if (this.building) throw new Error(`Cannot roll back ${this.kind} while a build is running`);
    if (!existsSync(this.previousPath)) throw new Error(`No previous ${this.kind} database is available`);
    this.current.optimize(); this.current.close();
    const failedPath = join(dirname(this.path), `${this.kind}.rolled-back.sqlite`);
    removeDatabaseFiles(failedPath);
    if (existsSync(this.path)) renameSync(this.path, failedPath);
    try {
      renameSync(this.previousPath, this.path);
      this.current = new DatasourceDatabase(this.kind, this.path);
      if (!this.current.integrityCheck()) throw new Error(`Previous ${this.kind} database failed integrity_check`);
      removeDatabaseFiles(failedPath);
    } catch (error) {
      try { this.current.close(); } catch {}
      removeDatabaseFiles(this.path);
      if (existsSync(failedPath)) renameSync(failedPath, this.path);
      this.current = new DatasourceDatabase(this.kind, this.path);
      throw error;
    }
  }

  close(): void { this.current.close(); }
}
