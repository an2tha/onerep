import polars as pl
import pymongo
from elasticsearch import Elasticsearch, helpers
from tqdm import tqdm

BATCH_SIZE = 5000

# Scalar fields indexed in ES (must match the mapping in lib/elasticsearch.ts)
ES_FIELDS = {
    "code", "product_name", "brands", "categories",
    "nutriscore_grade", "nutriscore_score", "nova_group",
    "ingredients_text", "main_category", "countries",
}


def _extract_text(val) -> str | None:
    """Unwrap parquet struct fields like {'text': '...', 'lang': 'main'} to plain strings."""
    if val is None:
        return None
    if isinstance(val, dict):
        return val.get("text") or None
    if isinstance(val, list) and len(val) > 0:
        # Try to find 'main' or 'en'
        main = next((v for v in val if isinstance(v, dict) and v.get("lang") == "main"), None)
        if main: return main.get("text")
        en = next((v for v in val if isinstance(v, dict) and v.get("lang") == "en"), None)
        if en: return en.get("text")
        if isinstance(val[0], dict): return val[0].get("text")
        return str(val[0])
    return str(val) or None


def _extract_macros(nutriments) -> dict:
    """Flatten key macros from the OpenFoodFacts nutriments dict for ES indexing."""
    if not nutriments:
        return {}
    
    data = {}
    if isinstance(nutriments, dict):
        data = nutriments
    elif isinstance(nutriments, list):
        for item in nutriments:
            if isinstance(item, dict) and "name" in item:
                val = item.get("100g")
                if val is None: val = item.get("value")
                data[item["name"]] = val
                # Ensure we also have the _100g version for the n() helper
                data[f"{item['name']}_100g"] = val
    else:
        return {}

    def n(key: str) -> float:
        # Try both the name and name_100g
        val = data.get(key)
        if val is None: val = data.get(f"{key}_100g")
        try:
            return round(float(val or 0), 1)
        except (ValueError, TypeError):
            return 0.0

    return {
        "calories_100g": n("energy-kcal"),
        "protein_100g":  n("proteins"),
        "carbs_100g":    n("carbohydrates"),
        "fat_100g":      n("fat"),
    }


def _coerce(doc: dict) -> dict:
    """Normalize types to match schema expectations."""
    for text_field in ("product_name", "generic_name", "ingredients_text"):
        doc[text_field] = _extract_text(doc.get(text_field))

    if doc.get("nutriscore_grade"):
        doc["nutriscore_grade"] = str(doc["nutriscore_grade"]).upper()

    for int_field in ("nutriscore_score", "nova_group"):
        v = doc.get(int_field)
        if v is not None:
            try:
                doc[int_field] = int(v)
            except (ValueError, TypeError):
                doc[int_field] = None
    return doc


def load(mongo_client: pymongo.MongoClient, es_client: Elasticsearch):
    db = mongo_client["onerep-data"]
    collection = db["products"]

    relevant_cols = [
        "code", "product_name", "generic_name", "brands",
        "categories", "nutriscore_grade", "nutriscore_score",
        "nova_group", "nutriments", "ingredients_text",
        "images", "last_modified_t",
    ]

    df = pl.read_parquet("datasets/foods.parquet").select(relevant_cols)
    total_rows = df.height

    for i in tqdm(range(0, total_rows, BATCH_SIZE), desc="Syncing Products"):
        batch = df.slice(i, BATCH_SIZE).to_dicts()
        processed = [_coerce(dict(doc)) for doc in batch]

        # MongoDB: store full document (includes nutriments for detail lookups)
        try:
            collection.insert_many(processed, ordered=False)
        except pymongo.errors.BulkWriteError:
            pass  # duplicate codes expected on re-runs

        # Elasticsearch: scalar fields + flattened macros for search results
        es_actions = [
            {
                "_index": "foods",
                "_id": str(doc["code"]),
                "_source": {
                    **{k: v for k, v in doc.items() if k in ES_FIELDS and v is not None},
                    **_extract_macros(doc.get("nutriments")),
                },
            }
            for doc in processed
            if doc.get("code")
        ]

        failed = 0
        for ok, info in helpers.parallel_bulk(es_client, es_actions, raise_on_error=False):
            if not ok:
                failed += 1
                if failed <= 3:
                    print(f"[ES-ERR] {info}")
        if failed:
            print(f"[ES-WARN] {failed}/{len(es_actions)} docs failed to index in this batch")
