import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, sql } from "drizzle-orm";
import { foods, metadata, products } from "./schema.ts";
import type { BarcodeProduct, UsdaFood } from "./models.ts";

export class DatasourceDatabase {
  readonly sqlite: Database;
  readonly db;
  constructor(readonly kind: "usda" | "off", path: string) {
    this.sqlite = new Database(path, { create: true, strict: true });
    this.sqlite.exec("pragma journal_mode=WAL; pragma synchronous=NORMAL; pragma temp_store=MEMORY;");
    this.db = drizzle(this.sqlite);
    this.migrate();
  }
  private migrate(): void {
    this.sqlite.exec(`
      create table if not exists metadata (key text primary key, value text not null) without rowid;
      ${this.kind === "usda" ? `create table if not exists foods (fdc_id integer primary key, data_type text not null, name text not null, brand text, category text, calories_100g real, protein_100g real, carbs_100g real, fat_100g real, fiber_100g real, sugar_100g real, saturated_fat_100g real, sodium_100g real, nutrients_json text, portions_json text); create virtual table if not exists foods_fts using fts5(fdc_id unindexed, name, brand, category, tokenize='unicode61 remove_diacritics 2');` : `create table if not exists products (barcode text primary key, name text not null, brand text, quantity text, serving_size text, calories_100g real not null, protein_100g real not null, carbs_100g real not null, fat_100g real not null, fiber_100g real, sugar_100g real, saturated_fat_100g real, sodium_100g real, country_codes text, language text, image_url text, completeness integer not null, updated_at integer) without rowid; create virtual table if not exists products_fts using fts5(barcode unindexed, name, brand, tokenize='unicode61 remove_diacritics 2');`}
    `);
  }
  reset(): void {
    this.sqlite.exec(this.kind === "usda" ? "delete from foods; delete from foods_fts; delete from metadata;" : "delete from products; delete from products_fts; delete from metadata;");
  }
  insertUsda(rows: UsdaFood[]): void {
    this.sqlite.transaction(() => {
      for (const row of rows) this.db.insert(foods).values({ ...row, nutrientsJson: row.nutrients ? JSON.stringify(row.nutrients) : null, portionsJson: row.portions ? JSON.stringify(row.portions) : null }).onConflictDoUpdate({ target: foods.fdcId, set: { ...row, nutrientsJson: row.nutrients ? JSON.stringify(row.nutrients) : null, portionsJson: row.portions ? JSON.stringify(row.portions) : null } }).run();
    })();
  }
  insertOff(rows: BarcodeProduct[], withSearch: boolean): void {
    this.sqlite.transaction(() => {
      for (const row of rows) {
        this.db.insert(products).values(row).onConflictDoUpdate({ target: products.barcode, set: row }).run();
        if (withSearch) this.sqlite.query("insert into products_fts (barcode,name,brand) values (?,?,?)").run(row.barcode, row.name, row.brand ?? "");
      }
    })();
  }
  setMetadata(values: Record<string, string | number>): void {
    for (const [key, value] of Object.entries(values)) this.db.insert(metadata).values({ key, value: String(value) }).onConflictDoUpdate({ target: metadata.key, set: { value: String(value) } }).run();
  }
  rebuildUsdaSearch(): void {
    this.sqlite.exec("delete from foods_fts; insert into foods_fts(fdc_id,name,brand,category) select cast(fdc_id as text),name,coalesce(brand,''),coalesce(category,'') from foods;");
  }
  food(id: number) { return this.db.select().from(foods).where(eq(foods.fdcId, id)).get(); }
  barcode(code: string) { return this.db.select().from(products).where(eq(products.barcode, code)).get(); }
  searchFoods(query: string, limit: number) { const match = query.split(/\s+/).filter(Boolean).map((token) => `${token.replace(/[^\p{L}\p{N}-]/gu, "")}*`).join(" AND "); return this.db.all(sql`select f.* from foods_fts s join foods f on f.fdc_id=cast(s.fdc_id as integer) where foods_fts match ${match} order by bm25(foods_fts,0,8,2,1) limit ${limit}`); }
  searchProducts(query: string, limit: number) { const match = query.split(/\s+/).filter(Boolean).map((token) => `${token.replace(/[^\p{L}\p{N}-]/gu, "")}*`).join(" AND "); return this.db.all(sql`select p.* from products_fts s join products p on p.barcode=s.barcode where products_fts match ${match} order by bm25(products_fts,0,8,2) limit ${limit}`); }
  stats() { const table = this.kind === "usda" ? "foods" : "products"; const rows = this.sqlite.query(`select count(*) as count from ${table}`).get() as { count: number }; return { rows: rows.count, metadata: this.db.select().from(metadata).all() }; }
  integrityCheck(): boolean { return (this.sqlite.query("pragma integrity_check").get() as { integrity_check?: string } | null)?.integrity_check === "ok"; }
  optimize(): void { this.sqlite.exec("pragma optimize; pragma wal_checkpoint(TRUNCATE);"); }
  close(): void { this.sqlite.close(); }
}
