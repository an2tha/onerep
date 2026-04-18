import json
import pymongo
from elasticsearch import Elasticsearch, helpers

# Fields declared in the ES mapping (lib/elasticsearch.ts)
ES_FIELDS = {"id", "name", "force", "equipment", "primaryMuscles", "secondaryMuscles", "category", "instructions"}


def load(mongo_client: pymongo.MongoClient, es_client: Elasticsearch):
    db = mongo_client["onerep-data"]
    collection = db["exercises"]

    with open("datasets/free-exercise-db/dist/exercises.json", "r") as f:
        exercises = json.load(f)

    print(f"Syncing {len(exercises)} exercises...")

    try:
        collection.insert_many(exercises, ordered=False)
    except Exception as e:
        print(f"Mongo insertion note: {e}")

    ARRAY_FIELDS = {"primaryMuscles", "secondaryMuscles", "instructions"}

    def clean(k, v):
        if k in ARRAY_FIELDS and isinstance(v, list):
            return [x for x in v if x is not None]
        return v

    actions = [
        {
            "_index": "exercises",
            "_id": str(doc.get("id")),
            "_source": {
                k: clean(k, v)
                for k, v in doc.items()
                if k in ES_FIELDS and v is not None
            },
        }
        for doc in exercises
        if doc.get("id")
    ]

    failed = 0
    for ok, info in helpers.parallel_bulk(es_client, actions, raise_on_error=False):
        if not ok:
            failed += 1
            if failed <= 3:
                print(f"[ES-ERR] {info}")
    if failed:
        print(f"[ES-WARN] {failed}/{len(actions)} exercises failed to index")
    else:
        print("Exercise sync complete.")
