import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import {
  closeStaged,
  livePath,
  openStaged,
  previousPath,
  replaceDatabaseFiles,
  stagedPath,
} from "./store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "onerep-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

const rows = sqliteTable("rows", {
  id: integer("id").primaryKey(),
});
const schema = { rows };

test("strict close releases Drizzle prepared statements before promotion", () => {
  const dataDir = temporaryDirectory();
  const staged = openStaged(dataDir, "test", schema);
  const prepared = Array.from({ length: 80 }, () =>
    staged.db
      .insert(rows)
      .values({ id: sql.placeholder("id") })
      .prepare(),
  );

  prepared.forEach((statement, id) => statement.run({ id }));
  closeStaged(staged);

  expect(() => prepared[0]!.run({ id: 100 })).toThrow();
  renameSync(stagedPath(dataDir, "test"), livePath(dataDir, "test"));
  expect(existsSync(livePath(dataDir, "test"))).toBe(true);
});

test("restores the live database when the staged rename fails", () => {
  const dataDir = temporaryDirectory();
  const staged = stagedPath(dataDir, "test");
  const live = livePath(dataDir, "test");
  const previous = previousPath(dataDir, "test");
  writeFileSync(staged, "new");
  writeFileSync(live, "old");

  let renames = 0;
  const failSecondRename: typeof renameSync = (source, destination) => {
    renames += 1;
    if (renames === 2)
      throw Object.assign(new Error("resource busy or locked"), {
        code: "EBUSY",
      });
    renameSync(source, destination);
  };

  expect(() =>
    replaceDatabaseFiles(staged, live, previous, failSecondRename),
  ).toThrow("resource busy");
  expect(readFileSync(live, "utf8")).toBe("old");
  expect(readFileSync(staged, "utf8")).toBe("new");
  expect(existsSync(previous)).toBe(false);
});
