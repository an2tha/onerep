/**
 * Streaming RFC 4180 CSV reader.
 *
 * USDA's `food_nutrient.csv` is several GB, so rows are yielded as they are
 * decoded rather than collected. Quoted fields may contain commas, newlines
 * and doubled quotes.
 */
export async function* readCsvRows(path: string): AsyncGenerator<string[]> {
  const stream = Bun.file(path).stream();
  const decoder = new TextDecoder();

  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteInField = false;

  const endField = () => {
    row.push(field);
    field = "";
    quoteInField = false;
  };

  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]!;

      if (quoted) {
        if (char !== '"') {
          field += char;
        } else if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
        continue;
      }

      if (char === '"' && field.length === 0 && !quoteInField) {
        quoted = true;
        quoteInField = true;
      } else if (char === ",") {
        endField();
      } else if (char === "\n") {
        endField();
        yield row;
        row = [];
      } else if (char !== "\r") {
        field += char;
      }
    }
  }

  // A final line without a trailing newline still forms a row.
  if (field.length > 0 || row.length > 0) {
    endField();
    yield row;
  }
}

/**
 * Yields objects keyed by the header row. Column order differs between USDA
 * releases, so importers must address fields by name rather than index.
 */
export async function* readCsvRecords(
  path: string,
): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null;
  for await (const row of readCsvRows(path)) {
    if (!header) {
      header = row.map((name) => name.trim().replace(/^﻿/, ""));
      continue;
    }
    // Trailing empty lines decode as a single empty field.
    if (row.length === 1 && row[0] === "") continue;
    const record: Record<string, string> = {};
    for (let i = 0; i < header.length; i += 1) record[header[i]!] = row[i] ?? "";
    yield record;
  }
}
