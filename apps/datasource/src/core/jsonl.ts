import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

/**
 * Streaming newline-delimited JSON reader.
 *
 * The Open Food Facts export is tens of gigabytes of one-object-per-line JSON,
 * so lines are decoded and yielded as they arrive rather than collected. Only a
 * single partial line is ever buffered, which is what keeps an import inside
 * the memory budget of a small box.
 *
 * A `.gz` path is decompressed in the same pass, so the dump never has to be
 * expanded onto disk first.
 */

export type JsonLineOptions = {
  /**
   * Called instead of throwing when a line will not parse. A dump this large
   * occasionally carries a truncated record, and losing one product is better
   * than losing the import — but the caller still has to see it happen, so it
   * can abort if corruption turns out to be widespread.
   */
  onError?: (lineNumber: number, error: unknown) => void;
};

export async function* readJsonLines(
  path: string,
  options: JsonLineOptions = {},
): AsyncGenerator<Record<string, unknown>> {
  // `DecompressionStream("gzip")` is deliberately not used here. It decompresses
  // greedily instead of honouring backpressure, so the whole expanded dump
  // queues up in memory: measured against the real 12.7 GB Open Food Facts
  // export it blew through a 1 GB cap in about a second, while the same read
  // through node:zlib holds steady around 70 MB. The plain-file path is a Bun
  // stream, which backpressures correctly on its own.
  const source: AsyncIterable<Uint8Array | Buffer> = path.endsWith(".gz")
    ? createReadStream(path).pipe(createGunzip())
    : Bun.file(path).stream();

  const decoder = new TextDecoder();
  let buffer = "";
  let lineNumber = 0;

  const parse = (line: string): Record<string, unknown> | null => {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const value: unknown = JSON.parse(trimmed);
      // A JSON line that is a bare number or array is not a product record.
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch (error) {
      if (!options.onError) throw new Error(`malformed JSON on line ${lineNumber}: ${String(error)}`);
      options.onError(lineNumber, error);
      return null;
    }
  };

  for await (const chunk of source) {
    buffer += decoder.decode(chunk, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const record = parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (record) yield record;
      newline = buffer.indexOf("\n");
    }
  }

  // A final line without a trailing newline is still a record.
  const last = parse(buffer);
  if (last) yield last;
}
