import polars as pl
import pymongo
from elasticsearch import Elasticsearch, helpers
from tqdm import tqdm

BATCH_SIZE = 5000

def format_for_mongoose(text_val):
    if not text_val:
        return []
    return [{"lang": "en", "text": str(text_val)}]

def load(mongo_client: pymongo.MongoClient, es_client: Elasticsearch):
    db = mongo_client["onerep-data"]
    collection = db["products"]

    relevant_cols = [
        "code", "product_name", "generic_name", "brands", 
        "categories", "nutriscore_grade", "nutriscore_score", 
        "nova_group", "nutriments", "ingredients_text", 
        "images", "last_modified_t"
    ]

    df = pl.read_parquet("datasets/foods.parquet").select(relevant_cols)
    total_rows = df.height

    for i in tqdm(range(0, total_rows, BATCH_SIZE), desc="Syncing Products"):
        batch_df = df.slice(i, BATCH_SIZE)
        raw_dicts = batch_df.to_dicts()
        
        processed_batch = []
        for doc in raw_dicts:
            p_doc = dict(doc)
            p_doc["product_name"] = format_for_mongoose(p_doc.get("product_name"))
            p_doc["generic_name"] = format_for_mongoose(p_doc.get("generic_name"))
            p_doc["ingredients_text"] = format_for_mongoose(p_doc.get("ingredients_text"))
            
            if p_doc.get("nutriscore_grade"):
                p_doc["nutriscore_grade"] = str(p_doc["nutriscore_grade"]).upper()
            
            processed_batch.append(p_doc)

        try:
            mongo_docs = [dict(d) for d in processed_batch]
            collection.insert_many(mongo_docs, ordered=False)
        except pymongo.errors.BulkWriteError:
            pass

        es_actions = [
            {
                "_index": "products",
                "_id": str(doc["code"]),
                "_source": doc
            }
            for doc in processed_batch
        ]
        
        helpers.bulk(es_client, es_actions)