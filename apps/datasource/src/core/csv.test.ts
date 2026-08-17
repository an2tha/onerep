import { afterAll, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCsvRecords, readCsvRows } from "./csv.ts";

const written: string[] = [];

async function fixture(content: string): Promise<string> {
  const path = join(tmpdir(), `datasource-csv-${crypto.randomUUID()}.csv`);
  await Bun.write(path, content);
  written.push(path);
  return path;
}

async function rows(content: string): Promise<string[][]> {
  const out: string[][] = [];
  for await (const row of readCsvRows(await fixture(content))) out.push(row);
  return out;
}

afterAll(async () => {
  for (const path of written) await Bun.file(path).delete();
});

test("parses plain rows", async () => {
  expect(await rows("a,b\n1,2\n")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("parses a final row without a trailing newline", async () => {
  expect(await rows("a,b\n1,2")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("keeps commas inside quoted fields", async () => {
  expect(await rows('name,x\n"Beans, canned",1\n')).toEqual([
    ["name", "x"],
    ["Beans, canned", "1"],
  ]);
});

test("unescapes doubled quotes", async () => {
  expect(await rows('a\n"say ""hi"""\n')).toEqual([["a"], ['say "hi"']]);
});

test("keeps newlines inside quoted fields", async () => {
  expect(await rows('a,b\n"line1\nline2",2\n')).toEqual([
    ["a", "b"],
    ["line1\nline2", "2"],
  ]);
});

test("handles CRLF line endings", async () => {
  expect(await rows("a,b\r\n1,2\r\n")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("keeps empty fields", async () => {
  expect(await rows("a,b,c\n1,,3\n")).toEqual([
    ["a", "b", "c"],
    ["1", "", "3"],
  ]);
});

test("reads records keyed by header", async () => {
  const out: Record<string, string>[] = [];
  const path = await fixture('fdc_id,description\n123,"Egg, whole"\n');
  for await (const record of readCsvRecords(path)) out.push(record);
  expect(out).toEqual([{ fdc_id: "123", description: "Egg, whole" }]);
});

test("pads short rows and skips blank trailing lines", async () => {
  const out: Record<string, string>[] = [];
  const path = await fixture("a,b,c\n1,2\n\n");
  for await (const record of readCsvRecords(path)) out.push(record);
  expect(out).toEqual([{ a: "1", b: "2", c: "" }]);
});
