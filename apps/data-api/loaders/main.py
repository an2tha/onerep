import os
import subprocess
import dotenv
import pymongo
from elasticsearch import Elasticsearch
import foods
import exercises

dotenv.load_dotenv("../.env")

# Clients
mongo_client = pymongo.MongoClient(os.getenv("MONGO_URI") or os.getenv("MONGO_URL"))
es_client = Elasticsearch(os.getenv("ELASTIC_URL"))
db = mongo_client["onerep-data"]

if not os.path.exists("datasets/foods.parquet"):
    subprocess.run(["./clone_datasets.sh"], check=True)


def ensure_indices():
    """Create ES indices with the correct mapping if they don't exist."""
    if not es_client.indices.exists(index="foods"):
        es_client.indices.create(
            index="foods",
            body={
                "mappings": {
                    "properties": {
                        "code": {"type": "keyword"},
                        "product_name": {"type": "text", "analyzer": "standard"},
                        "brands": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                        "categories": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                        "nutriscore_grade": {"type": "keyword"},
                        "nutriscore_score": {"type": "integer"},
                        "nova_group": {"type": "integer"},
                        "ingredients_text": {"type": "text"},
                        "main_category": {"type": "keyword"},
                        "countries": {"type": "keyword"},
                    }
                },
                "settings": {"number_of_shards": 1, "number_of_replicas": 1},
            },
        )
        print("[ES] foods index created")

    if not es_client.indices.exists(index="exercises"):
        es_client.indices.create(
            index="exercises",
            body={
                "mappings": {
                    "properties": {
                        "id": {"type": "keyword"},
                        "name": {"type": "text", "analyzer": "standard"},
                        "force": {"type": "keyword"},
                        "equipment": {"type": "keyword"},
                        "primaryMuscles": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                        "secondaryMuscles": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                        "category": {"type": "keyword"},
                        "instructions": {"type": "text"},
                    }
                },
                "settings": {"number_of_shards": 1, "number_of_replicas": 1},
            },
        )
        print("[ES] exercises index created")


ensure_indices()

# Load Foods (collection is "products" to match the Mongoose model name)
if db["products"].count_documents({}) == 0:
    print("Loading foods into Mongo and Elastic...")
    foods.load(mongo_client, es_client)

# Load Exercises
if db["exercises"].count_documents({}) == 0:
    print("Loading exercises into Mongo and Elastic...")
    exercises.load(mongo_client, es_client)

print("Data synchronization complete.")
