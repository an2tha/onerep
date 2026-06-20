import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type FoodProduct = {
  id: number;
  code: string;
  name: string;
  brand: string | null;
  serving: string;
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugars: number;
  saturatedFat: number;
  sodium: number;
  cholesterol: number;
  calcium: number;
  iron: number;
  potassium: number;
  vitaminC: number;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  popularityKey: number;
  lastModifiedT: number | null;
};

type SearchOptions = {
  query: string;
  limit: number;
};

const DEFAULT_INDEX_PATH = path.resolve(process.cwd(), "data/food-index.sqlite");

const SELECT_COLUMNS = `
  products.id,
  products.code,
  products.name,
  products.brand,
  products.serving,
  products.serving_grams as servingGrams,
  products.calories,
  products.protein,
  products.carbs,
  products.fat,
  products.fiber,
  products.sugars,
  products.saturated_fat as saturatedFat,
  products.sodium,
  products.cholesterol,
  products.calcium,
  products.iron,
  products.potassium,
  products.vitamin_c as vitaminC,
  products.nutriscore_grade as nutriscoreGrade,
  products.nova_group as novaGroup,
  products.popularity_key as popularityKey,
  products.last_modified_t as lastModifiedT
`;

const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

function indexPath(): string {
  return path.resolve(process.env.FOOD_INDEX_PATH || DEFAULT_INDEX_PATH);
}

function toFoodProduct(row: Record<string, unknown>): FoodProduct {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    brand: row.brand === null ? null : String(row.brand),
    serving: String(row.serving || "100 g"),
    servingGrams: row.servingGrams === null ? null : Number(row.servingGrams),
    calories: Number(row.calories || 0),
    protein: Number(row.protein || 0),
    carbs: Number(row.carbs || 0),
    fat: Number(row.fat || 0),
    fiber: Number(row.fiber || 0),
    sugars: Number(row.sugars || 0),
    saturatedFat: Number(row.saturatedFat || 0),
    sodium: Number(row.sodium || 0),
    cholesterol: Number(row.cholesterol || 0),
    calcium: Number(row.calcium || 0),
    iron: Number(row.iron || 0),
    potassium: Number(row.potassium || 0),
    vitaminC: Number(row.vitaminC || 0),
    nutriscoreGrade: row.nutriscoreGrade === null ? null : String(row.nutriscoreGrade),
    novaGroup: row.novaGroup === null ? null : Number(row.novaGroup),
    popularityKey: Number(row.popularityKey || 0),
    lastModifiedT: row.lastModifiedT === null ? null : Number(row.lastModifiedT),
  };
}

function searchTokens(raw: string): string[] {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .match(TOKEN_PATTERN)
    ?.slice(0, 8) ?? [];
}

function tokenVariants(token: string): string[] {
  const variants = new Set([token]);

  if (token.length >= 4) {
    if (token.endsWith("ies") && token.length > 4) {
      variants.add(`${token.slice(0, -3)}y`);
    } else if (/(?:ches|shes|sses|xes|zes|oes)$/.test(token)) {
      variants.add(token.slice(0, -2));
    } else if (token.endsWith("s") && !token.endsWith("ss")) {
      variants.add(token.slice(0, -1));
    } else if (!token.endsWith("s")) {
      variants.add(`${token}s`);
      if (token.endsWith("y") && token.length > 1 && !"aeiou".includes(token.at(-2)!)) {
        variants.add(`${token.slice(0, -1)}ies`);
      } else if (/(?:o|s|x|z|ch|sh)$/.test(token)) {
        variants.add(`${token}es`);
      }
    }
  }

  return [...variants].filter((variant) => variant.length >= 2);
}

function ftsQuery(tokens: string[], prefix = false): string {
  const groups = tokens.map((token) => {
    const terms = prefix ? [`${token}*`] : tokenVariants(token);
    return terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;
  });
  return groups.join(" AND ");
}

function clampLimit(limit: number | undefined, max = 100): number {
  if (!Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(Math.trunc(limit || 25), max));
}

class FoodIndex {
  private db: DatabaseSync;
  private searchStatement;
  private browseStatement;
  private barcodeStatement;
  private nutrientsStatement;
  private nutrientsByGradeStatement;
  private countStatement;

  constructor(private readonly filePath: string) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Food index not found at ${filePath}. Run "bun run food:index" in apps/data-api first.`,
      );
    }

    this.db = new DatabaseSync(filePath, { readOnly: true });
    this.db.exec("PRAGMA query_only = ON");
    this.db.exec("PRAGMA temp_store = MEMORY");
    this.db.exec("PRAGMA mmap_size = 268435456");

    this.searchStatement = this.db.prepare(`
      SELECT ${SELECT_COLUMNS}
      FROM products
      JOIN products_fts ON products_fts.rowid = products.id
      WHERE products_fts MATCH ?
      ORDER BY
        CASE
          WHEN lower(products.name) = ? THEN 0
          WHEN lower(products.name) LIKE ? THEN 1
          WHEN lower(products.name) LIKE ? THEN 2
          WHEN lower(coalesce(products.brand, '')) = ? THEN 3
          WHEN lower(coalesce(products.brand, '')) LIKE ? THEN 4
          ELSE 5
        END,
        bm25(products_fts, 8.0, 0.4, 0.05),
        products.popularity_key DESC,
        products.last_modified_t DESC
      LIMIT ?
    `);
    this.browseStatement = this.db.prepare(`
      SELECT ${SELECT_COLUMNS}
      FROM products
      ORDER BY popularity_key DESC, last_modified_t DESC
      LIMIT ?
    `);
    this.barcodeStatement = this.db.prepare(`
      SELECT ${SELECT_COLUMNS}
      FROM products
      WHERE code = ?
      LIMIT 1
    `);
    this.nutrientsStatement = this.db.prepare(`
      SELECT ${SELECT_COLUMNS}
      FROM products
      ORDER BY popularity_key DESC, last_modified_t DESC
      LIMIT ?
    `);
    this.nutrientsByGradeStatement = this.db.prepare(`
      SELECT ${SELECT_COLUMNS}
      FROM products
      WHERE nutriscore_grade = ?
      ORDER BY popularity_key DESC, last_modified_t DESC
      LIMIT ?
    `);
    this.countStatement = this.db.prepare("SELECT count(*) as count FROM products");
  }

  search({ query, limit }: SearchOptions): FoodProduct[] {
    const safeLimit = clampLimit(limit, 100);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return this.browse(safeLimit);
    }

    const barcode = trimmed.replace(/\D/g, "");
    if (barcode.length >= 8 && barcode === trimmed) {
      const exact = this.getByBarcode(barcode);
      if (exact) return [exact];
    }

    const tokens = searchTokens(trimmed);
    if (tokens.length === 0) return [];

    const normalized = tokens.join(" ");
    const match = ftsQuery(tokens);
    const exactRows = this.searchRows(match, normalized, safeLimit);
    const needsPrefixFallback =
      exactRows.length === 0 ||
      (tokens.some((token) => token.length < 5) && exactRows.length < Math.min(safeLimit, 10));

    if (!needsPrefixFallback) return exactRows;

    // Fall back to prefix matching only for empty/very sparse exact matches.
    // This keeps complete searches like "apple" from being dominated by
    // prefix-only brand matches such as "Appletiser", while still supporting
    // partial user input like "appl".
    const prefixMatch = ftsQuery(tokens, true);
    const prefixRows = prefixMatch ? this.searchRows(prefixMatch, normalized, safeLimit) : [];
    return prefixRows.length > exactRows.length ? prefixRows : exactRows;
  }

  private searchRows(match: string, normalized: string, limit: number): FoodProduct[] {
    return this.searchStatement
      .all(
        match,
        normalized,
        `${normalized}%`,
        `%${normalized}%`,
        normalized,
        `%${normalized}%`,
        limit,
      )
      .map(toFoodProduct);
  }

  browse(limit: number): FoodProduct[] {
    return this.browseStatement.all(clampLimit(limit, 100)).map(toFoodProduct);
  }

  nutrients(grade: string | undefined, limit: number): FoodProduct[] {
    const normalizedGrade = grade?.trim().toLowerCase();
    const rows = normalizedGrade
      ? this.nutrientsByGradeStatement.all(normalizedGrade, clampLimit(limit, 250))
      : this.nutrientsStatement.all(clampLimit(limit, 250));
    return rows.map(toFoodProduct);
  }

  getByBarcode(code: string): FoodProduct | null {
    const row = this.barcodeStatement.get(code);
    return row ? toFoodProduct(row) : null;
  }

  health() {
    const row = this.countStatement.get();
    const stats = fs.statSync(this.filePath);
    return {
      path: this.filePath,
      products: Number(row?.count || 0),
      sizeBytes: stats.size,
      mtime: stats.mtime.toISOString(),
    };
  }
}

let singleton: FoodIndex | null = null;

export function getFoodIndex(): FoodIndex {
  if (!singleton) {
    singleton = new FoodIndex(indexPath());
  }
  return singleton;
}

export function foodIndexExists(): boolean {
  return fs.existsSync(indexPath());
}

export function getFoodIndexPath(): string {
  return indexPath();
}
