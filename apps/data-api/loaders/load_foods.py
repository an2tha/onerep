#!/usr/bin/env python3
"""Fast foods loader using CSV file and COPY."""
import sys
import os
import csv

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ".venv/lib/python3.14/site-packages")

import duckdb
import psycopg2

BATCH_SIZE = 100000
PARQUET_PATH = "datasets/foods.parquet"
DB_URL = os.environ.get("DATABASE_URL", "postgresql://onerep:onerep_dev@localhost:5433/onerep_data")

def extract_name(product_name):
    if not product_name: return None
    for item in product_name:
        if isinstance(item, dict) and item.get("lang") == "main": return item.get("text")
    for item in product_name:
        if isinstance(item, dict) and item.get("lang") == "en": return item.get("text")
    if isinstance(product_name[0], dict): return product_name[0].get("text")
    return str(product_name[0]) if product_name else None

def extract_nutrient(nutriments, name):
    if not nutriments: return 0.0
    for n in nutriments:
        if isinstance(n, dict) and n.get("name") == name:
            try: return round(float(n.get("100g") or 0), 1)
            except: return 0.0
    return 0.0

def safe_int(val):
    if val is None: return None
    try:
        v = int(val)
        return v if abs(v) <= 2147483647 else None
    except: return None

def clean(s):
    if s is None: return ""
    return str(s).replace("\t", " ").replace("\n", " ").replace("\r", " ").strip()

def main():
    print("[PY] Connecting to PostgreSQL...", file=sys.stderr, flush=True)
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    
    # Check if data already exists
    cur.execute("SELECT COUNT(*) FROM foodfacts")
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"[PY] Already have {existing} rows, skipping...", file=sys.stderr, flush=True)
        cur.close()
        conn.close()
        return
    
    # Create staging table
    print("[PY] Creating staging table...", file=sys.stderr, flush=True)
    cur.execute("DROP TABLE IF EXISTS foodfacts_staging")
    cur.execute("""
        CREATE TABLE foodfacts_staging (
            code VARCHAR(255),
            name TEXT,
            brand TEXT,
            serving TEXT,
            serving_grams REAL,
            calories REAL,
            protein REAL,
            carbs REAL,
            fat REAL,
            nutriscore_grade VARCHAR(10),
            nova_group INTEGER,
            popularity_key INTEGER
        )
    """)
    
    # Drop indexes
    print("[PY] Dropping indexes...", file=sys.stderr, flush=True)
    try: cur.execute("DROP INDEX IF EXISTS foodfacts_code_idx")
    except: pass
    try: cur.execute("DROP INDEX IF EXISTS foodfacts_name_idx")
    except: pass
    
    duck = duckdb.connect(database=":memory:")
    total = duck.execute(f"SELECT COUNT(*) FROM '{PARQUET_PATH}' WHERE code IS NOT NULL AND code != ''").fetchone()[0]
    print(f"[PY] Total: {total}", file=sys.stderr, flush=True)
    
    # Create CSV file for COPY
    csv_path = "/tmp/foodfacts.csv"
    offset = 0
    
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter="\t")
        
        while True:
            result = duck.execute(f"""
                SELECT code, product_name, brands, serving_quantity, serving_size, nutriments, nutriscore_grade, nova_group, popularity_key
                FROM '{PARQUET_PATH}'
                WHERE code IS NOT NULL AND code != ''
                LIMIT {BATCH_SIZE} OFFSET {offset}
            """).fetchall()
            
            if not result: break
            
            for row in result:
                code = str(row[0]) if row[0] else ""
                if not code: continue
                
                nutriments = row[5] or []
                sqty = row[3] if row[3] else 100
                ssize = str(row[4]) if row[4] else f"{sqty}g"
                
                writer.writerow([
                    clean(code),
                    clean(extract_name(row[1]) or code),
                    clean(row[2]),
                    clean(ssize),
                    sqty,
                    extract_nutrient(nutriments, "energy-kcal"),
                    extract_nutrient(nutriments, "proteins"),
                    extract_nutrient(nutriments, "carbohydrates"),
                    extract_nutrient(nutriments, "fat"),
                    clean(str(row[6]).lower()[:10] if row[6] else ""),
                    safe_int(row[7]),
                    safe_int(row[8])
                ])
            
            offset += len(result)
            print(f"[PY] Written {offset}/{total} ({offset*100//total}%)", file=sys.stderr, flush=True)
            if len(result) < BATCH_SIZE: break
    
    duck.close()
    
    # Load CSV with COPY
    print("[PY] Loading CSV into staging table...", file=sys.stderr, flush=True)
    with open(csv_path, "r", encoding="utf-8") as f:
        cur.copy_expert("""
            COPY foodfacts_staging (code, name, brand, serving, serving_grams, calories, protein, carbs, fat, nutriscore_grade, nova_group, popularity_key)
            FROM STDIN WITH (FORMAT CSV, DELIMITER E'\\t', NULL '')
        """, f)
    
    os.remove(csv_path)
    
    # Move unique rows to main table
    print("[PY] Inserting unique rows...", file=sys.stderr, flush=True)
    cur.execute("""
        INSERT INTO foodfacts (code, name, brand, serving, serving_grams, calories, protein, carbs, fat, nutriscore_grade, nova_group, popularity_key)
        SELECT DISTINCT code, name, brand, serving, serving_grams, calories, protein, carbs, fat, NULLIF(nutriscore_grade, '')::VARCHAR(10), nova_group, popularity_key
        FROM foodfacts_staging
        ON CONFLICT (code) DO NOTHING
    """)
    print(f"[PY] Inserted {cur.rowcount} rows", file=sys.stderr, flush=True)
    
    # Recreate indexes
    print("[PY] Recreating indexes...", file=sys.stderr, flush=True)
    cur.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_code_idx ON foodfacts(code)")
    cur.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS foodfacts_name_idx ON foodfacts(name)")
    
    cur.execute("DROP TABLE foodfacts_staging")
    cur.close()
    conn.close()
    print("[PY] Done!", file=sys.stderr, flush=True)

if __name__ == "__main__": main()
