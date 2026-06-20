#!/usr/bin/env python3
"""Build the local OpenFoodFacts SQLite search index from food.parquet."""

from __future__ import annotations

import argparse
import math
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Iterable


APP_DIR = Path(__file__).resolve().parents[1]
DEFAULT_PARQUET = APP_DIR / "data" / "food.parquet"
DEFAULT_OUTPUT = APP_DIR / "data" / "food-index.sqlite"
VENV_PYTHON = APP_DIR / "loaders" / ".venv" / "bin" / "python"
PYTHON_CANDIDATES = [
    os.environ.get("PYARROW_PYTHON"),
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    str(VENV_PYTHON),
]


def reexec_with_pyarrow_python() -> None:
    tried = {
        item
        for item in os.environ.get("FOOD_INDEX_PYTHON_TRIED", "").split(os.pathsep)
        if item
    }
    current = str(Path(sys.executable).resolve())

    for candidate in PYTHON_CANDIDATES:
        if not candidate:
            continue
        path = Path(candidate)
        if not path.exists():
            continue
        resolved = str(path.resolve())
        if resolved == current or resolved in tried:
            continue
        env = os.environ.copy()
        env["FOOD_INDEX_PYTHON_TRIED"] = os.pathsep.join([*sorted(tried), current])
        os.execve(resolved, [resolved, *sys.argv], env)


try:
    import pyarrow.parquet as pq
except ModuleNotFoundError:
    reexec_with_pyarrow_python()
    raise

COLUMNS = [
    "code",
    "product_name",
    "brands",
    "serving_size",
    "serving_quantity",
    "nutriments",
    "nutriscore_grade",
    "nova_group",
    "popularity_key",
    "last_modified_t",
]

SERVING_GRAMS_RE = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*g\b", re.IGNORECASE)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return (
        str(value)
        .replace("\x00", "")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("\t", " ")
        .strip()
    )


def compact_spaces(value: str) -> str:
    return " ".join(value.split())


def extract_multilang_text(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return compact_spaces(clean_text(value))

    items = list(value) if isinstance(value, Iterable) else [value]
    for lang in ("main", "en"):
        for item in items:
            if isinstance(item, dict) and item.get("lang") == lang and item.get("text"):
                return compact_spaces(clean_text(item["text"]))
    for item in items:
        if isinstance(item, dict) and item.get("text"):
            return compact_spaces(clean_text(item["text"]))
        if item:
            return compact_spaces(clean_text(item))
    return ""


def finite_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def round1(value: float | None) -> float:
    if value is None:
        return 0.0
    return round(value, 1)


def nutrient_map(nutriments: Any) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    if not nutriments:
        return result
    for item in nutriments:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name:
            continue
        result[str(name).lower()] = item
    return result


def nutrient_value(
    nutrients: dict[str, dict[str, Any]],
    names: tuple[str, ...],
    *,
    unit: str = "raw",
) -> float:
    for name in names:
        item = nutrients.get(name)
        if not item:
            continue
        value = finite_float(item.get("100g"))
        if value is None:
            value = finite_float(item.get("value"))
        if value is None:
            continue

        item_unit = clean_text(item.get("unit")).lower()
        if unit == "kcal":
          if item_unit == "kj":
              return value / 4.184
          return value
        if unit == "mg":
            if item_unit in {"g", "gram", "grams", ""}:
                return value * 1000
            return value
        return value
    return 0.0


def serving_grams(serving_quantity: Any, serving_size: Any) -> float | None:
    direct = finite_float(serving_quantity)
    if direct and direct > 0:
        return round(direct, 2)

    text = clean_text(serving_size).replace(",", ".")
    match = SERVING_GRAMS_RE.search(text)
    if match:
        grams = finite_float(match.group(1))
        if grams and grams > 0:
            return round(grams, 2)
    return None


def normalized_grade(value: Any) -> str | None:
    grade = clean_text(value).lower()
    return grade if grade in {"a", "b", "c", "d", "e"} else None


def normalized_int(value: Any) -> int | None:
    parsed = finite_float(value)
    if parsed is None:
        return None
    return int(parsed)


def row_to_product(row: dict[str, Any]) -> tuple[Any, ...] | None:
    code = clean_text(row.get("code"))
    if not code:
        return None

    name = extract_multilang_text(row.get("product_name"))
    if not name:
        return None

    brand = compact_spaces(clean_text(row.get("brands"))) or None
    serving = compact_spaces(clean_text(row.get("serving_size"))) or "100 g"
    grams = serving_grams(row.get("serving_quantity"), row.get("serving_size"))
    nutrients = nutrient_map(row.get("nutriments"))

    energy = nutrient_value(nutrients, ("energy-kcal", "energy"), unit="kcal")
    sodium = nutrient_value(nutrients, ("sodium",), unit="mg")
    calcium = nutrient_value(nutrients, ("calcium",), unit="mg")
    iron = nutrient_value(nutrients, ("iron",), unit="mg")
    potassium = nutrient_value(nutrients, ("potassium",), unit="mg")
    vitamin_c = nutrient_value(nutrients, ("vitamin-c", "ascorbic-acid"), unit="mg")

    return (
        code,
        name,
        brand,
        serving,
        grams,
        round1(energy),
        round1(nutrient_value(nutrients, ("proteins",))),
        round1(nutrient_value(nutrients, ("carbohydrates",))),
        round1(nutrient_value(nutrients, ("fat",))),
        round1(nutrient_value(nutrients, ("fiber",))),
        round1(nutrient_value(nutrients, ("sugars",))),
        round1(nutrient_value(nutrients, ("saturated-fat",))),
        round1(sodium),
        round1(nutrient_value(nutrients, ("cholesterol",), unit="mg")),
        round1(calcium),
        round1(iron),
        round1(potassium),
        round1(vitamin_c),
        normalized_grade(row.get("nutriscore_grade")),
        normalized_int(row.get("nova_group")),
        normalized_int(row.get("popularity_key")) or 0,
        normalized_int(row.get("last_modified_t")),
    )


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;
        PRAGMA locking_mode = EXCLUSIVE;
        PRAGMA cache_size = -200000;

        CREATE TABLE products (
          id INTEGER PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          brand TEXT,
          serving TEXT NOT NULL,
          serving_grams REAL,
          calories REAL NOT NULL DEFAULT 0,
          protein REAL NOT NULL DEFAULT 0,
          carbs REAL NOT NULL DEFAULT 0,
          fat REAL NOT NULL DEFAULT 0,
          fiber REAL NOT NULL DEFAULT 0,
          sugars REAL NOT NULL DEFAULT 0,
          saturated_fat REAL NOT NULL DEFAULT 0,
          sodium REAL NOT NULL DEFAULT 0,
          cholesterol REAL NOT NULL DEFAULT 0,
          calcium REAL NOT NULL DEFAULT 0,
          iron REAL NOT NULL DEFAULT 0,
          potassium REAL NOT NULL DEFAULT 0,
          vitamin_c REAL NOT NULL DEFAULT 0,
          nutriscore_grade TEXT,
          nova_group INTEGER,
          popularity_key INTEGER NOT NULL DEFAULT 0,
          last_modified_t INTEGER
        );
        """
    )


def finalize_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE INDEX products_code_idx ON products(code);
        CREATE INDEX products_grade_idx ON products(nutriscore_grade);
        CREATE INDEX products_popularity_idx ON products(popularity_key DESC, last_modified_t DESC);

        CREATE VIRTUAL TABLE products_fts USING fts5(
          name,
          brand,
          code,
          content='products',
          content_rowid='id',
          tokenize='unicode61 remove_diacritics 2'
        );

        INSERT INTO products_fts(rowid, name, brand, code)
        SELECT id, name, coalesce(brand, ''), code
        FROM products;

        PRAGMA optimize;
        VACUUM;
        """
    )


def build_index(parquet_path: Path, output_path: Path, batch_size: int) -> None:
    if not parquet_path.exists():
        raise FileNotFoundError(f"Parquet file not found: {parquet_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    if tmp_path.exists():
        tmp_path.unlink()

    print(f"[index] Reading {parquet_path}", file=sys.stderr, flush=True)
    parquet = pq.ParquetFile(parquet_path)
    print(
        f"[index] {parquet.metadata.num_rows:,} rows, {parquet.metadata.num_row_groups:,} row groups",
        file=sys.stderr,
        flush=True,
    )

    conn = sqlite3.connect(tmp_path)
    create_schema(conn)

    insert_sql = """
      INSERT OR IGNORE INTO products (
        code, name, brand, serving, serving_grams,
        calories, protein, carbs, fat, fiber, sugars, saturated_fat,
        sodium, cholesterol, calcium, iron, potassium, vitamin_c,
        nutriscore_grade, nova_group, popularity_key, last_modified_t
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """

    started = time.time()
    seen = 0
    inserted = 0
    batch: list[tuple[Any, ...]] = []

    with conn:
        for arrow_batch in parquet.iter_batches(batch_size=batch_size, columns=COLUMNS):
            for row in arrow_batch.to_pylist():
                seen += 1
                product = row_to_product(row)
                if product is None:
                    continue
                batch.append(product)
                if len(batch) >= batch_size:
                    before = conn.total_changes
                    conn.executemany(insert_sql, batch)
                    inserted += conn.total_changes - before
                    batch.clear()

            if seen % (batch_size * 10) < batch_size:
                elapsed = max(time.time() - started, 1)
                rate = seen / elapsed
                print(
                    f"[index] scanned={seen:,} inserted={inserted:,} rate={rate:,.0f}/s",
                    file=sys.stderr,
                    flush=True,
                )

        if batch:
            before = conn.total_changes
            conn.executemany(insert_sql, batch)
            inserted += conn.total_changes - before

    print(f"[index] Building FTS over {inserted:,} products", file=sys.stderr, flush=True)
    finalize_schema(conn)
    conn.close()

    os.replace(tmp_path, output_path)
    elapsed = time.time() - started
    print(
        f"[index] Wrote {output_path} ({inserted:,} products) in {elapsed:,.1f}s",
        file=sys.stderr,
        flush=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet", type=Path, default=DEFAULT_PARQUET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=20_000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_index(args.parquet.resolve(), args.output.resolve(), args.batch_size)


if __name__ == "__main__":
    main()
