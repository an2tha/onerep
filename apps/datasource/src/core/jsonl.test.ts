import { gzipSync } from "bun";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonLines } from "./jsonl.ts";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "datasource-jsonl-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function write(body: string | Uint8Array, name = "data.jsonl"): Promise<string> {
  const path = join(tempDir(), name);
  await Bun.write(path, body);
  return path;
}

async function collect(path: string, options?: Parameters<typeof readJsonLines>[1]) {
  const records = [];
  for await (const record of readJsonLines(path, options)) records.push(record);
  return records;
}

test("yields one object per line", async () => {
  const path = await write('{"a":1}\n{"a":2}\n{"a":3}\n');
  expect(await collect(path)).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
});

test("yields a final line with no trailing newline", async () => {
  const path = await write('{"a":1}\n{"a":2}');
  expect(await collect(path)).toEqual([{ a: 1 }, { a: 2 }]);
});

test("skips blank lines", async () => {
  const path = await write('{"a":1}\n\n\n{"a":2}\n');
  expect(await collect(path)).toEqual([{ a: 1 }, { a: 2 }]);
});

test("returns nothing for an empty file", async () => {
  expect(await collect(await write(""))).toEqual([]);
});

test("decompresses a .gz dump in the same pass", async () => {
  const body = '{"a":1}\n{"a":2}\n';
  const path = await write(gzipSync(Buffer.from(body)), "data.jsonl.gz");
  expect(await collect(path)).toEqual([{ a: 1 }, { a: 2 }]);
});

test("holds memory flat while decompressing, rather than buffering the dump", async () => {
  // A guard, and an honest one about its limits.
  //
  // The bug it was written for: `DecompressionStream("gzip")` decompresses
  // greedily and ignores backpressure, queueing the whole expanded dump in
  // memory. On the Linux import box (Bun 1.3.14) that blew a 1 GB cap in about
  // a second against the real 12.7 GB Open Food Facts export, while the same
  // read through node:zlib held at ~70 MB.
  //
  // It does *not* reproduce everywhere: on macOS/Bun 1.3.12 the greedy path
  // stays under this threshold, so this test passes either way there. Treat it
  // as a check that memory stays flat under a real decompression load — which
  // will catch a gross regression on Linux — not as proof the greedy
  // implementation is gone. That proof came from measuring on the box.
  const line = `${JSON.stringify({ padding: "x".repeat(9_000) })}\n`;
  const target = 400_000_000;
  const path = await write(gzipSync(Buffer.from(line.repeat(Math.ceil(target / line.length)))), "big.jsonl.gz");

  Bun.gc(true);
  const before = process.memoryUsage.rss();
  let peak = before;
  let count = 0;
  for await (const _ of readJsonLines(path)) {
    count += 1;
    if (count % 5_000 === 0) peak = Math.max(peak, process.memoryUsage.rss());
  }

  expect(count).toBeGreaterThan(40_000);
  const growthMb = (peak - before) / 1024 / 1024;
  // Correct backpressure holds this near constant; buffering the whole stream
  // would put it in the hundreds.
  expect(growthMb).toBeLessThan(200);
}, 120_000);

test("reassembles a record split across read chunks", async () => {
  // Far larger than one stream chunk, so the partial-line buffer is exercised;
  // OFF products routinely run to tens of kilobytes.
  const big = { name: "x".repeat(500_000), tail: true };
  const path = await write(`${JSON.stringify(big)}\n{"a":2}\n`);
  const records = await collect(path);
  expect(records).toHaveLength(2);
  expect((records[0] as typeof big).name).toHaveLength(500_000);
  expect(records[1]).toEqual({ a: 2 });
});

test("handles multi-byte characters spanning a chunk boundary", async () => {
  // A UTF-8 sequence cut in half by the decoder would corrupt the name of every
  // accented European product.
  const path = await write(`${JSON.stringify({ name: "é".repeat(400_000) })}\n`);
  const records = await collect(path);
  expect((records[0] as { name: string }).name).toBe("é".repeat(400_000));
});

test("throws on malformed JSON when no handler is given", async () => {
  const path = await write('{"a":1}\n{"a":\n');
  await expect(collect(path)).rejects.toThrow("malformed JSON on line 2");
});

test("reports malformed lines to a handler instead of throwing", async () => {
  const path = await write('{"a":1}\n{"a":\n{"a":3}\n');
  const failures: number[] = [];
  const records = await collect(path, { onError: (line) => failures.push(line) });
  expect(records).toEqual([{ a: 1 }, { a: 3 }]);
  expect(failures).toEqual([2]);
});

test("ignores lines that parse but are not objects", async () => {
  // A bare number or array is not a product record.
  const path = await write('{"a":1}\n42\n[1,2]\n"text"\nnull\n{"a":2}\n');
  expect(await collect(path)).toEqual([{ a: 1 }, { a: 2 }]);
});
