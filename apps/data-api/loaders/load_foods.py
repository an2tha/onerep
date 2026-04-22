#!/usr/bin/env python3
"""Fast foods loader using CSV file and COPY."""
import sys
import os
import csv
import glob
import json

os.chdir(os.path.dirname(os.path.abspath(__file__)))
# Dynamically find the site-packages directory for the installed Python version
site_packages = glob.glob(".venv/lib/python*/site-packages")
if site_packages:
    sys.path.insert(0, site_packages[0])

import duckdb
import psycopg2

BATCH_SIZE = 100000
PARQUET_PATH = "datasets/foods.parquet"
DB_URL = os.environ.get("DATABASE_URL", "postgresql://onerep:onerep_dev@localhost:5433/onerep_data")

def extract_name(product_name):
    """
    Extract the best-available product name from a product_name structure.
    
    Tries to find a name in prioritized order: a dict with "lang" == "main", then a dict with "lang" == "en", then the first element if it is a dict, otherwise the string form of the first element. Returns None for falsy input.
    
    Parameters:
        product_name: An iterable (commonly a list) containing name entries; entries may be dicts with "lang" and "text" keys or plain values.
    
    Returns:
        The selected name string, or `None` if no name can be determined.
    """
    if not product_name: return None
    for item in product_name:
        if isinstance(item, dict) and item.get("lang") == "main": return item.get("text")
    for item in product_name:
        if isinstance(item, dict) and item.get("lang") == "en": return item.get("text")
    if isinstance(product_name[0], dict): return product_name[0].get("text")
    return str(product_name[0]) if product_name else None

def extract_nutrient(nutriments, name):
    """
    Extracts the per-100g value for a named nutrient from a collection of nutriment records.
    
    Parameters:
        nutriments (iterable): Sequence (often list) of mappings where each mapping may contain a "name" key and a "100g" key holding the nutrient amount.
        name (str): The nutrient name to locate (compared against each record's "name" value).
    
    Returns:
        float: The nutrient amount per 100g rounded to one decimal place if found and convertible to float; `0.0` if `nutriments` is empty, the named nutrient is not present, or the value cannot be parsed.
    """
    if not nutriments: return 0.0
    for n in nutriments:
        if isinstance(n, dict) and n.get("name") == name:
            try: return round(float(n.get("100g") or 0), 1)
            except: return 0.0
    return 0.0

def safe_int(val):
    """
    Convert a value to a 32-bit signed integer if it can be safely converted and fits within the range -2147483648 to 2147483647.
    
    Parameters:
        val: The value to convert; any type that may be cast to int.
    
    Returns:
        int or None: The converted integer if conversion succeeds and its absolute value is less than or equal to 2147483647, otherwise `None`.
    """
    if val is None: return None
    try:
        v = int(val)
        return v if abs(v) <= 2147483647 else None
    except: return None

def clean(s):
    """
    Normalize a value into a cleaned, whitespace-normalized string.
    
    Converts the input to a string, replaces tabs/newlines/carriage returns with spaces, and trims leading/trailing whitespace. If the input is None, returns an empty string.
    
    Parameters:
        s: The value to normalize; may be None or any type convertible to str.
    
    Returns:
        str: The cleaned string, or an empty string if `s` is None.
    """
    if s is None: return ""
    return str(s).replace("\t", " ").replace("\n", " ").replace("\r", " ").strip()

def main():
    """
    Load food data from the configured Parquet dataset into the PostgreSQL `foodfacts` table.
    
    If `foodfacts` already contains rows the function exits without modifying the database. Otherwise it creates a temporary staging table, reads the Parquet dataset in batches via DuckDB while transforming and writing rows to a temporary tab-delimited CSV, bulk-loads that CSV into the staging table using PostgreSQL COPY, inserts distinct rows into `foodfacts` using `ON CONFLICT (code) DO NOTHING`, recreates indexes on `foodfacts(code)` and `foodfacts(name)`, removes the staging table and the temporary CSV, and closes the database connection.
    """
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
            popularity_key INTEGER,
            nutrients JSONB,
            extra_nutrients JSONB
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
                SELECT code, product_name, brands, serving_quantity, serving_size, nutriments, nutriscore_grade, nova_group, popularity_key, nutriments_list
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
                nutriments_list = row[9] or []

                # Split nutrients into core and extra
                core_nutrients = ["Energy", "Fat", "Saturated-fat", "Carbohydrates", "Sugars", "Fiber", "Proteins", "Salt", "Sodium"]
                nutrients = [n for n in nutriments_list if isinstance(n, dict) and n.get("name") in core_nutrients]
                extra_nutrients = [n for n in nutriments_list if isinstance(n, dict) and n.get("name") not in core_nutrients]

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
                    safe_int(row[8]),
                    json.dumps(nutrients) if nutrients else "",
                    json.dumps(extra_nutrients) if extra_nutrients else ""
                ])
            
            offset += len(result)
            print(f"[PY] Written {offset}/{total} ({offset*100//total}%)", file=sys.stderr, flush=True)
            if len(result) < BATCH_SIZE: break
    
    duck.close()
    
    # Load CSV with COPY
    print("[PY] Loading CSV into staging table...", file=sys.stderr, flush=True)
    with open(csv_path, "r", encoding="utf-8") as f:
        cur.copy_expert("""
            COPY foodfacts_staging (code, name, brand, serving, serving_grams, calories, protein, carbs, fat, nutriscore_grade, nova_group, popularity_key, nutrients, extra_nutrients)
            FROM STDIN WITH (FORMAT CSV, DELIMITER E'\\t', NULL '')
        """, f)
    
    os.remove(csv_path)
    
    # Move unique rows to main table
    print("[PY] Inserting unique rows...", file=sys.stderr, flush=True)
    cur.execute("""
        INSERT INTO foodfacts (code, name, brand, serving, serving_grams, calories, protein, carbs, fat, nutriscore_grade, nova_group, popularity_key, nutrients, extra_nutrients)
        SELECT DISTINCT code, name, brand, serving, serving_grams, calories, protein, carbs, fat, NULLIF(nutriscore_grade, '')::VARCHAR(10), nova_group, popularity_key, nutrients, extra_nutrients
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