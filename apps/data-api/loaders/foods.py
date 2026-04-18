import polars as pl
import pymongo
from elasticsearch import Elasticsearch, helpers
from tqdm import tqdm

BATCH_SIZE = 10000

def load(mongo_client: pymongo.MongoClient, es_client: Elasticsearch):
    db = mongo_client["onerep-data"]
    collection = db["foods"]

    relevant_cols = [
        "code", "product_name", "generic_name", "brands", 
        "categories", "nutriscore_grade", "nutriscore_score", 
        "nova_group", "nutriments", "ingredients_text", 
        "images", "last_modified_t"
    ]

    lf = pl.scan_parquet("datasets/foods.parquet").select(relevant_cols)
    total_rows = lf.select(pl.len()).collect().item()

    offset = 0
    with tqdm(total=total_rows, desc="Syncing Foods", bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt}", ascii=" #") as pbar:
        while offset < total_rows:
            batch_df = lf.slice(offset, BATCH_SIZE).collect()
            if batch_df.height == 0:
                break
                
            batch_dicts = batch_df.to_dicts()
            
            try:
                collection.insert_many(batch_dicts, ordered=False)
            except pymongo.errors.BulkWriteError:
                pass

            es_actions = []
            for doc in batch_dicts:
                if "_id" in doc:
                    del doc["_id"]
                
                es_actions.append({
                    "_index": "foods",
                    "_id": str(doc["code"]),
                    "_source": doc
                })

            helpers.bulk(es_client, es_actions)

            pbar.update(len(batch_dicts))
            offset += BATCH_SIZE